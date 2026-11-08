import type { Scenario } from "@casedrill/schema";

type Rule = Scenario["transactionRules"]["txRule"][number];

export type GeneratedTransaction = {
  id: string;
  /** Used only for scoring. Never show it, because it groups related payments. */
  ruleId: string;
  date: string;
  time: string;
  accountId: string;
  counterpartyId: string;
  counterpartyName: string;
  direction: Rule["direction"];
  rail: Rule["rail"];
  amount: number;
  currency: "GBP" | "EUR";
  reference: string;
};

export function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/** Small seeded generator (mulberry32), so a pack always expands to the same transactions. */
export function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function pickAmount(rule: Rule, random: () => number): number {
  if (rule.minAmount === rule.maxAmount) return rule.minAmount;
  const value = rule.minAmount + random() * (rule.maxAmount - rule.minAmount);
  if (rule.rail === "cash") {
    const rounded = Math.round(value / 5) * 5;
    return Math.min(rule.maxAmount, Math.max(rule.minAmount, rounded));
  }
  return Math.round(value * 100) / 100;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** Turns a scenario's rules into its transactions, oldest first, with ids that do not reveal the rule. */
export function expandScenario(scenario: Scenario, seed: number): GeneratedTransaction[] {
  const parties = new Map(scenario.counterparties.counterparty.map((party) => [party.id, party.name]));
  const currencies = new Map(scenario.accounts.account.map((account) => [account.id, account.currency]));

  const generated = scenario.transactionRules.txRule.flatMap((rule) => {
    const random = createRandom(hash(`${seed}:${scenario.id}:${rule.id}`));
    return Array.from({ length: rule.count }, () => {
      const day = rule.fromDay + Math.floor(random() * (rule.toDay - rule.fromDay + 1));
      const counterpartyId = rule.counterpartyIds[Math.floor(random() * rule.counterpartyIds.length)] as string;
      return {
        sortKey: random(),
        ruleId: rule.id,
        date: addDays(scenario.alert.raisedOn, day),
        time: `${pad(8 + Math.floor(random() * 10))}:${pad(Math.floor(random() * 60))}`,
        accountId: rule.accountId,
        counterpartyId,
        counterpartyName: parties.get(counterpartyId) ?? counterpartyId,
        direction: rule.direction,
        rail: rule.rail,
        amount: pickAmount(rule, random),
        currency: currencies.get(rule.accountId) ?? "GBP",
        reference: rule.reference ?? "",
      };
    });
  });

  return generated
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`) || a.sortKey - b.sortKey)
    .map(({ sortKey: _sortKey, ...item }, index) => ({ id: `T${String(index + 1).padStart(4, "0")}`, ...item }));
}

/** Reorders items the same way every time for the same key. */
export function seededShuffle<T>(items: readonly T[], key: string): T[] {
  const random = createRandom(hash(key));
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other] as T, result[index] as T];
  }
  return result;
}
