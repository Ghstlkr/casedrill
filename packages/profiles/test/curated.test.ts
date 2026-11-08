import { readdirSync, readFileSync } from "node:fs";
import { packSchema, type TrainingPack, xmlParserOptions } from "@casedrill/schema";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { checkPackSupport } from "../src";

const folder = new URL("../../../packs/curated/", import.meta.url);
const files = readdirSync(folder).filter((name) => name.endsWith(".xml"));

const read = (name: string) => readFileSync(new URL(name, folder), "utf8");
const load = (name: string): TrainingPack =>
  packSchema.parse(new XMLParser(xmlParserOptions).parse(read(name)).trainingPack);

type Rule = TrainingPack["scenarios"]["scenario"][number]["transactionRules"]["txRule"][number];
const expectedValue = (rule: Rule) => (rule.count * (rule.minAmount + rule.maxAmount)) / 2;
const rulesOf = (name: string) => load(name).scenarios.scenario[0]!.transactionRules.txRule;
const total = (rules: Rule[], direction: "in" | "out") =>
  rules.filter((rule) => rule.direction === direction).reduce((sum, rule) => sum + expectedValue(rule), 0);

const UK = "uk-l2-cash-business-review.xml";
const EU = "eu-l2-cash-business-review.xml";

describe.each(files)("%s", (name) => {
  it("is well-formed", () => {
    expect(XMLValidator.validate(read(name))).toBe(true);
  });

  it("passes the schema and the app support check", () => {
    expect(checkPackSupport(load(name))).toEqual([]);
  });

  it("does not state the outcome in anything the trainee can see", () => {
    const visible = JSON.stringify(load(name).scenarios).toLowerCase();
    expect(visible).not.toMatch(/true positive|false positive|true_positive|false_positive|money laundering/);
  });

  it("does not spend more than it receives", () => {
    const rules = load(name).scenarios.scenario[0]!.transactionRules.txRule;
    expect(total(rules, "in")).toBeGreaterThan(total(rules, "out"));
  });
});

describe("the paired cases", () => {
  const [uk, eu] = [load(UK).scenarios.scenario[0]!, load(EU).scenarios.scenario[0]!];

  it("cover a true positive and a false positive", () => {
    expect(load(UK).answerKey?.answer[0]?.outcome).toBe("true_positive");
    expect(load(EU).answerKey?.answer[0]?.outcome).toBe("false_positive");
  });

  it("give both the same shape, so the structure reveals nothing", () => {
    expect(uk.documents.document.map((item) => item.availability)).toEqual(
      eu.documents.document.map((item) => item.availability),
    );
    expect(uk.alert.ruleName).toBe(eu.alert.ruleName);
    expect(uk.alert.severity).toBe(eu.alert.severity);
  });
});

describe("figures quoted in the UK explanation", () => {
  const cash = rulesOf(UK).find((rule) => rule.rail === "cash")!;

  it("implies more than 100 washes a day", () => {
    expect(expectedValue(cash) / 90 / 12).toBeGreaterThan(100);
  });

  it("is several times the cash declared at onboarding", () => {
    const declaredQuarterlyCash = (165000 * 0.4) / 4;
    expect(expectedValue(cash) / declaredQuarterlyCash).toBeGreaterThan(5);
  });
});

describe("figures quoted in the EU explanation", () => {
  it("fit the declared seasonal turnover", () => {
    const received = total(rulesOf(EU), "in");
    const seasonalTurnover = 190000 * 0.7;
    expect(received / seasonalTurnover).toBeGreaterThan(0.85);
    expect(received / seasonalTurnover).toBeLessThan(1.15);
  });
});
