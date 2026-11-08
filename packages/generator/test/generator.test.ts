import { importPack } from "@casedrill/importer";
import { describe, expect, it } from "vitest";
import { generatePack, TEMPLATES } from "../src";

const base = { jurisdiction: "uk", level: "l2", cases: 8, truePositives: 2, difficulty: "medium", seed: 11 } as const;

const load = (xml: string) => {
  const result = importPack(xml, { now: new Date("2026-11-08T00:00:00Z") });
  if (!result.ok) throw new Error(result.repairPrompt);
  return result;
};

describe("generated packs", () => {
  const combinations = (["uk", "eu"] as const).flatMap((jurisdiction) =>
    (["l1", "l2"] as const).flatMap((level) => (["easy", "medium", "hard"] as const).map((difficulty) => ({ jurisdiction, level, difficulty }))),
  );

  it.each(combinations)("are valid for $jurisdiction $level $difficulty", (combination) => {
    expect(load(generatePack({ ...base, ...combination })).summary.cases).toBe(8);
  });

  it.each([0, 1, 5, 20])("contain exactly %i true positives", (truePositives) => {
    const { summary } = load(generatePack({ ...base, cases: 20, truePositives }));
    expect(summary.truePositives).toBe(truePositives);
    expect(summary.falsePositives).toBe(20 - truePositives);
  });

  it("are reproducible from the seed", () => {
    expect(generatePack(base)).toBe(generatePack(base));
    expect(generatePack(base)).not.toBe(generatePack({ ...base, seed: 12 }));
  });

  it("do not need the AI instructions block", () => {
    expect(generatePack(base)).not.toContain("aiInstructions");
  });

  it("add more everyday activity at higher difficulty", () => {
    const count = (difficulty: "easy" | "hard") =>
      load(generatePack({ ...base, difficulty }))
        .pack.scenarios.scenario.flatMap((item) => item.transactionRules.txRule)
        .reduce((sum, rule) => sum + rule.count, 0);
    expect(count("hard")).toBeGreaterThan(count("easy"));
  });

  it("use local payment methods", () => {
    const eu = generatePack({ ...base, jurisdiction: "eu" });
    expect(eu).not.toMatch(/faster_payments|chaps|bacs/);
    expect(eu).not.toContain("GBP");
  });

  it("reject impossible options", () => {
    expect(() => generatePack({ ...base, cases: 21 })).toThrow("between 1 and 20");
    expect(() => generatePack({ ...base, truePositives: 9 })).toThrow("between 0");
  });
});

describe("templates", () => {
  it("cover all 8 typologies and all 6 false positive archetypes", () => {
    expect(TEMPLATES.filter((item) => item.kind === "tp")).toHaveLength(8);
    expect(TEMPLATES.filter((item) => item.kind === "fp")).toHaveLength(6);
    expect(new Set(TEMPLATES.map((item) => item.pattern)).size).toBe(14);
  });

  it("are all used, have irregularities only when suspicious, and receive more than they spend", () => {
    const seen = new Set<string>();
    for (const seed of [1, 2, 3]) {
      const { pack } = load(generatePack({ ...base, cases: 14, truePositives: 8, difficulty: "hard", seed }));
      for (const answer of pack.answerKey!.answer) {
        seen.add(answer.typology ?? answer.archetype!);
        if (answer.outcome === "true_positive") expect(answer.irregularity.length).toBeGreaterThanOrEqual(3);
        else expect(answer.irregularity).toEqual([]);

        const rules = pack.scenarios.scenario.find((item) => item.id === answer.scenarioId)!.transactionRules.txRule;
        const total = (direction: string) =>
          rules.filter((rule) => rule.direction === direction).reduce((sum, rule) => sum + (rule.count * (rule.minAmount + rule.maxAmount)) / 2, 0);
        expect(total("in"), answer.typology ?? answer.archetype).toBeGreaterThan(total("out"));
      }
    }
    expect(seen.size).toBe(14);
  });

  it("give true and false positives the same document structure", () => {
    const { pack, warnings } = load(generatePack({ ...base, cases: 14, truePositives: 7 }));
    expect(new Set(pack.scenarios.scenario.map((item) => item.documents.document.length))).toEqual(new Set([6]));
    expect(warnings.filter((item) => item.message.includes("documents"))).toEqual([]);
  });
});
