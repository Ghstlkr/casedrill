import { readFileSync } from "node:fs";
import { importPack } from "@casedrill/importer";
import { beforeEach, describe, expect, it } from "vitest";
import { type CaseInput, scoreShift } from "../src";

const xml = readFileSync(new URL("../../../templates/casedrill-template.xml", import.meta.url), "utf8");
const result = importPack(xml);
if (!result.ok) throw new Error(result.repairPrompt);
const pack = result.pack;

const TP = "S7K2";
const FP = "S3M9";
const mark = (targetType: string, targetRef: string, category: string) => ({
  key: `${targetType}:${targetRef}`,
  targetType,
  targetRef,
  label: targetRef,
  category,
});

const perfectTP = (): CaseInput => ({
  decision: "refer_to_mlro",
  pattern: "money_mule",
  routing: ["mlro", "nca_sar"],
  marks: [mark("transaction", "R1", "frequency"), mark("transaction", "R2", "counterparty"), mark("document", "D3", "behaviour")],
  requestedDocs: ["D3"],
  timeSpentMs: 1000,
  report: { blocks: { activity_summary: "B1", reason_for_suspicion: "B3", action_taken: "B5" }, freeText: "" },
});
const perfectFP = (): CaseInput => ({
  decision: "close",
  pattern: "property_sale",
  routing: [],
  marks: [],
  requestedDocs: [],
  timeSpentMs: 1000,
  report: { blocks: {}, freeText: "" },
});

let tp: CaseInput;
let fp: CaseInput;
beforeEach(() => {
  tp = perfectTP();
  fp = perfectFP();
});

const allowed = pack.parameters.sessionMinutes * 60_000;
const run = (usedMs = 60_000) =>
  scoreShift({
    parameters: pack.parameters,
    scenarios: pack.scenarios.scenario,
    answerKey: pack.answerKey!,
    work: { [TP]: tp, [FP]: fp },
    usedMs,
  });
const caseOf = (id: string, results = run()) => results.cases.find((item) => item.scenarioId === id)!;
const component = (id: string, key: string, results = run()) => caseOf(id, results).components.find((item) => item.key === key);

describe("a perfect shift", () => {
  it("scores 100 and passes", () => {
    const results = run();
    expect(results.score).toBe(100);
    expect(results.passed).toBe(true);
    expect(results.recall).toBe(1);
    expect(results.precision).toBe(1);
  });

  it("counts outcomes", () => {
    expect(run().counts).toEqual({ detected: 1, missed: 0, reportedFalsePositives: 0, closedFalsePositives: 1, borderline: 0, undecided: 0 });
  });
});

describe("critical errors", () => {
  it("caps a closed true positive and fails the shift", () => {
    tp.decision = "close";
    const results = run();
    expect(caseOf(TP, results).critical).toEqual(["missed_true_positive"]);
    expect(caseOf(TP, results).score).toBeLessThanOrEqual(40);
    expect(results.passed).toBe(false);
    expect(results.recall).toBe(0);
  });

  it("caps tipping off even with the right decision", () => {
    tp.routing = ["mlro", "nca_sar", "customer_notification"];
    const item = caseOf(TP);
    expect(item.critical).toEqual(["tipping_off"]);
    expect(item.score).toBeLessThanOrEqual(40);
    expect(item.routing.debriefs[0]).toContain("section 333A");
  });

  it("treats an undecided true positive as missed and scores zero", () => {
    tp.decision = null;
    const results = run();
    expect(caseOf(TP, results).score).toBe(0);
    expect(caseOf(TP, results).critical).toContain("missed_true_positive");
    expect(results.counts.undecided).toBe(1);
  });
});

describe("false positives", () => {
  it("counts a referred false positive as an error but not a critical one", () => {
    fp.decision = "refer_to_mlro";
    const results = run();
    expect(results.counts.reportedFalsePositives).toBe(1);
    expect(results.precision).toBe(0.5);
    expect(caseOf(FP, results).critical).toEqual([]);
  });

  it("does not score a report for a case that needs none", () => {
    expect(component(FP, "report")).toBeUndefined();
  });

  it("penalises flags on a clean case", () => {
    fp.marks = [mark("document", "D1", "document")];
    expect(component(FP, "evidence")?.earned).toBe(0.75);
  });
});

describe("evidence", () => {
  it("gives partial credit for partial evidence", () => {
    tp.marks = tp.marks.slice(0, 1);
    const item = caseOf(TP);
    expect(item.components.find((entry) => entry.key === "evidence")?.earned).toBeCloseTo(1 / 3);
    expect(item.missed).toHaveLength(2);
  });

  it("gives half credit for the wrong category", () => {
    tp.marks[0]!.category = "amount";
    const item = caseOf(TP);
    expect(item.components.find((entry) => entry.key === "evidence")?.earned).toBeCloseTo(2.5 / 3);
    expect(item.found[0]?.categoryCorrect).toBe(false);
  });

  it("counts several transactions from one group once", () => {
    tp.marks.push({ ...mark("transaction", "R1", "frequency"), key: "transaction:T0002" });
    expect(component(TP, "evidence")?.earned).toBe(1);
  });

  it("subtracts for unrelated flags", () => {
    tp.marks.push(mark("transaction", "R4", "amount"));
    const item = caseOf(TP);
    expect(item.components.find((entry) => entry.key === "evidence")?.earned).toBeCloseTo(0.9);
    expect(item.extraFlags).toEqual(["R4"]);
  });
});

describe("routing and report", () => {
  it("scores overlap between routes", () => {
    tp.routing = ["mlro"];
    expect(component(TP, "routing")?.earned).toBe(0.5);
  });

  it("scores each report section", () => {
    tp.report.blocks.action_taken = "B6";
    const item = caseOf(TP);
    expect(item.components.find((entry) => entry.key === "report")?.earned).toBeCloseTo(2 / 3);
    expect(item.report.find((entry) => entry.section === "action_taken")?.correct).toBe(false);
  });
});

describe("time", () => {
  it("gives full credit within the shift", () => {
    expect(component(TP, "time", run(allowed))?.earned).toBe(1);
  });

  it("falls with overtime and stops at zero", () => {
    expect(component(TP, "time", run(allowed * 1.25))?.earned).toBeCloseTo(0.5);
    expect(component(TP, "time", run(allowed * 2))?.earned).toBe(0);
  });
});

describe("pattern", () => {
  it("credits the right pattern only", () => {
    tp.pattern = "crypto_off_ramp";
    expect(component(TP, "typology")?.earned).toBe(0);
  });

  it("reports accuracy by pattern", () => {
    fp.decision = "refer_to_mlro";
    const entries = run().byPattern;
    expect(entries.find((item) => item.id === "money_mule")).toMatchObject({ total: 1, correct: 1 });
    expect(entries.find((item) => item.id === "property_sale")).toMatchObject({ total: 1, correct: 0 });
  });
});

describe("borderline", () => {
  const borderlineRun = () => {
    const answerKey = structuredClone(pack.answerKey!);
    const answer = answerKey.answer.find((item) => item.scenarioId === FP)!;
    answer.outcome = "borderline";
    answer.acceptable = ["close", "refer_to_mlro"];
    return scoreShift({
      parameters: { ...pack.parameters, borderline: 1 },
      scenarios: pack.scenarios.scenario,
      answerKey,
      work: { [TP]: tp, [FP]: fp },
      usedMs: 60_000,
    });
  };

  it("gives full credit for the best decision", () => {
    expect(caseOf(FP, borderlineRun()).decisionCredit).toBe(1);
  });

  it("gives partial credit for the other acceptable decision", () => {
    fp.decision = "refer_to_mlro";
    expect(caseOf(FP, borderlineRun()).decisionCredit).toBe(0.6);
  });
});
