import { readFileSync } from "node:fs";
import { importPack } from "@casedrill/importer";
import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../src/store";

const xml = readFileSync(new URL("../../../templates/casedrill-template.xml", import.meta.url), "utf8");
const CASE = "S7K2";
const target = { key: "document:D1", targetType: "document" as const, targetRef: "D1", label: "Onboarding form" };

const state = () => useStore.getState();
const work = () => state().shift!.cases[CASE]!;

beforeEach(() => {
  const result = importPack(xml);
  if (!result.ok) throw new Error(result.repairPrompt);
  state().startShift(xml, result.pack, result.summary);
});

describe("training view", () => {
  it("contains no answers", () => {
    const view = JSON.stringify(state().view);
    expect(state().view).not.toHaveProperty("answerKey");
    expect(view).not.toContain("explanation");
    expect(view).not.toContain("true_positive");
  });

  it("creates transactions for every case", () => {
    expect(state().transactions[CASE]?.length).toBe(56);
  });
});

describe("case work", () => {
  it("marks a case as opened and records it once", () => {
    state().openCase(CASE);
    state().openCase(CASE);
    expect(work().opened).toBe(true);
    expect(state().shift!.events.filter((item) => item.type === "case_opened")).toHaveLength(1);
  });

  it("adds, replaces and removes flags", () => {
    state().flag(CASE, target, "amount");
    state().flag(CASE, target, "document");
    expect(work().marks).toHaveLength(1);
    expect(work().marks[0]?.category).toBe("document");
    state().unflag(CASE, target.key);
    expect(work().marks).toHaveLength(0);
  });

  it("charges time for a document only once", () => {
    state().requestDocument(CASE, "D3", 5);
    state().requestDocument(CASE, "D3", 5);
    expect(work().requestedDocs).toEqual(["D3"]);
    expect(state().shift!.penaltyMs).toBe(300_000);
  });

  it("sets and clears a decision", () => {
    state().setDecision(CASE, "close");
    expect(work().decision).toBe("close");
    state().setDecision(CASE, null);
    expect(work().decision).toBeNull();
  });

  it("toggles routes", () => {
    state().toggleRoute(CASE, "mlro");
    expect(work().routing).toEqual(["mlro"]);
    state().toggleRoute(CASE, "mlro");
    expect(work().routing).toEqual([]);
  });
});

describe("report", () => {
  it("keeps one block per section and the analyst's own text", () => {
    state().setReportBlock(CASE, "activity_summary", "B1");
    state().setReportBlock(CASE, "activity_summary", "B2");
    state().setReportText(CASE, "My reasoning");
    expect(work().report.blocks).toEqual({ activity_summary: "B2" });
    expect(work().report.freeText).toBe("My reasoning");
  });
});

describe("ending a shift", () => {
  it("scores the shift and stops the clock", async () => {
    state().setDecision(CASE, "refer_to_mlro");
    expect(await state().endShift()).toBeNull();
    expect(state().screen).toBe("results");
    expect(state().results?.cases).toHaveLength(2);
    const elapsed = state().shift!.elapsedMs;
    state().tick(1000);
    expect(state().shift!.elapsedMs).toBe(elapsed);
  });
});

describe("shift files", () => {
  it("restores a saved shift", () => {
    state().setDecision(CASE, "close");
    const file = state().buildShiftFile();
    state().leaveShift();
    expect(state().importShiftFile(file)).toBeNull();
    expect(work().decision).toBe("close");
    expect(state().shift!.paused).toBe(true);
  });

  it("rejects an unrelated file", () => {
    expect(state().importShiftFile("{}")).toContain("not a CaseDrill shift");
  });

  it("rejects a file with work for other cases", () => {
    const parsed = JSON.parse(state().buildShiftFile());
    parsed.shift.cases = { OTHER: parsed.shift.cases[CASE] };
    expect(state().importShiftFile(JSON.stringify(parsed))).toContain("does not match");
  });
});

describe("clock", () => {
  it("counts time for the shift and the open case", () => {
    state().openCase(CASE);
    state().tick(1000);
    expect(state().shift!.elapsedMs).toBe(1000);
    expect(work().timeSpentMs).toBe(1000);
  });

  it("does not count while paused", () => {
    state().togglePause();
    state().tick(1000);
    expect(state().shift!.elapsedMs).toBe(0);
  });
});
