import type { Scenario } from "@casedrill/schema";
import { describe, expect, it } from "vitest";
import { expandScenario } from "../src";

const scenario = {
  id: "S1",
  alert: { raisedOn: "2026-10-19" },
  accounts: { account: [{ id: "FICT-ACC-1", currency: "GBP" }] },
  counterparties: {
    counterparty: [
      { id: "FICT-CP-1", name: "Party One" },
      { id: "FICT-CP-2", name: "Party Two" },
    ],
  },
  transactionRules: {
    txRule: [
      { id: "R1", accountId: "FICT-ACC-1", counterpartyIds: ["FICT-CP-1", "FICT-CP-2"], direction: "in", rail: "cash", count: 40, minAmount: 1900, maxAmount: 4800, fromDay: -90, toDay: -1, reference: "Takings" },
      { id: "R2", accountId: "FICT-ACC-1", counterpartyIds: ["FICT-CP-1"], direction: "out", rail: "bacs", count: 3, minAmount: 2400, maxAmount: 2400, fromDay: -30, toDay: 0 },
    ],
  },
} as unknown as Scenario;

describe("expandScenario", () => {
  it("creates the requested number of transactions", () => {
    expect(expandScenario(scenario, 1)).toHaveLength(43);
  });

  it("is reproducible for the same seed", () => {
    expect(expandScenario(scenario, 42)).toEqual(expandScenario(scenario, 42));
  });

  it("changes with the seed", () => {
    expect(expandScenario(scenario, 42)).not.toEqual(expandScenario(scenario, 43));
  });

  it("keeps amounts inside the rule's limits", () => {
    for (const item of expandScenario(scenario, 7).filter((row) => row.ruleId === "R1")) {
      expect(item.amount).toBeGreaterThanOrEqual(1900);
      expect(item.amount).toBeLessThanOrEqual(4800);
      expect(item.amount % 5).toBe(0);
    }
  });

  it("uses the exact amount for fixed payments", () => {
    for (const item of expandScenario(scenario, 7).filter((row) => row.ruleId === "R2")) {
      expect(item.amount).toBe(2400);
    }
  });

  it("keeps dates inside the rule's window and sorts them", () => {
    const items = expandScenario(scenario, 7);
    const dates = items.map((item) => item.date);
    expect(dates).toEqual([...dates].sort());
    expect(dates[0]! >= "2026-07-21").toBe(true);
    expect(dates.at(-1)! <= "2026-10-19").toBe(true);
  });

  it("uses ids that follow date order, not the rules", () => {
    const items = expandScenario(scenario, 7);
    expect(items.map((item) => item.id)).toEqual(items.map((_item, index) => `T${String(index + 1).padStart(4, "0")}`));
    const firstFixed = items.findIndex((item) => item.ruleId === "R2");
    expect(firstFixed).toBeGreaterThan(0);
  });

  it("uses every counterparty in a rule", () => {
    const names = new Set(expandScenario(scenario, 7).map((item) => item.counterpartyName));
    expect(names).toEqual(new Set(["Party One", "Party Two"]));
  });
});
