import { readFileSync } from "node:fs";
import {
  EU_ONLY_ROUTES,
  LEVEL_RULES,
  LEVELS,
  NEVER_CORRECT_ROUTES,
  packSchema,
  UK_ONLY_ROUTES,
  xmlParserOptions,
} from "@casedrill/schema";
import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { checkPackSupport, getLevelConfig, getReportSections, getRoutes, profiles } from "../src";

const JURISDICTIONS = ["uk", "eu"] as const;

const xml = readFileSync(new URL("../../../templates/casedrill-template.xml", import.meta.url), "utf8");
const template = () => new XMLParser(xmlParserOptions).parse(xml).trainingPack;

describe("level configuration", () => {
  it("releases L1 and L2 but not L3", () => {
    expect(getLevelConfig("l1", "uk").released).toBe(true);
    expect(getLevelConfig("l2", "eu").released).toBe(true);
    expect(getLevelConfig("l3", "uk").released).toBe(false);
  });

  it.each(LEVELS)("offers exactly the decisions the validator accepts at %s", (level) => {
    const ids = getLevelConfig(level, "uk").decisions.map((item) => item.id);
    expect(ids.sort()).toEqual([LEVEL_RULES[level].negative, LEVEL_RULES[level].positive].sort());
  });

  it("gives routing weight only to levels with routing", () => {
    for (const level of LEVELS) {
      const hasWeight = getLevelConfig(level, "uk").weights.routing > 0;
      expect(hasWeight).toBe(LEVEL_RULES[level].allowsRouting);
    }
  });

  it("words decisions for each jurisdiction", () => {
    const label = (jurisdiction: "uk" | "eu") =>
      getLevelConfig("l2", jurisdiction).decisions.find((item) => item.id === "refer_to_mlro")?.label;
    expect(label("uk")).toBe("Refer to MLRO");
    expect(label("eu")).toBe("Refer to Compliance Officer");
  });

  it("leaves no unresolved placeholders", () => {
    for (const jurisdiction of JURISDICTIONS) {
      for (const level of LEVELS) {
        expect(JSON.stringify(getLevelConfig(level, jurisdiction))).not.toMatch(/\{[a-zA-Z]+\}/);
      }
    }
  });
});

describe("jurisdiction profiles", () => {
  it("keeps routes inside their jurisdiction", () => {
    const ids = (jurisdiction: "uk" | "eu") => profiles[jurisdiction].routes.map((route) => route.id as string);
    for (const route of EU_ONLY_ROUTES) expect(ids("uk")).not.toContain(route);
    for (const route of UK_ONLY_ROUTES) expect(ids("eu")).not.toContain(route);
  });

  it("marks the EU profile as prospective", () => {
    expect(profiles.eu.status).toBe("prospective");
    expect(profiles.eu.notice).toContain("10 July 2027");
  });

  it("shows no routes at L1", () => {
    expect(getRoutes("l1", "uk")).toEqual([]);
  });

  it("offers the internal report at L2 but not L3", () => {
    expect(getRoutes("l2", "uk").map((route) => route.id)).toContain("mlro");
    expect(getRoutes("l3", "uk").map((route) => route.id)).not.toContain("mlro");
  });

  it("has a form section for every section used at each level", () => {
    expect(getReportSections("l1", "uk").map((item) => item.id)).toEqual(["escalation_note"]);
    expect(getReportSections("l2", "uk").map((item) => item.id)).toContain("daml_request");
    expect(getReportSections("l2", "eu").map((item) => item.id)).not.toContain("daml_request");
  });

  it("does not ship unverified glossary codes", () => {
    expect(profiles.uk.glossaryCodes).toEqual([]);
  });

  it("only uses https sources", () => {
    for (const jurisdiction of JURISDICTIONS) {
      for (const source of profiles[jurisdiction].sources) expect(source.url).toMatch(/^https:/);
    }
  });
});

describe("trap routes", () => {
  const traps = JURISDICTIONS.flatMap((jurisdiction) =>
    profiles[jurisdiction].routes.filter((route) => (NEVER_CORRECT_ROUTES as readonly string[]).includes(route.id)),
  );

  it("exist in the profiles", () => {
    expect(traps.length).toBeGreaterThanOrEqual(3);
  });

  it("explain the trap in the results", () => {
    for (const route of traps) expect(route.debrief).toBeTruthy();
  });

  it("do not give the answer away in the info box", () => {
    for (const route of traps) {
      expect(Object.values(route.info).join(" ")).not.toMatch(/never|prohibit|offence|illegal|tipping/i);
    }
  });
});

describe("pack support", () => {
  it("accepts the template", () => {
    expect(checkPackSupport(packSchema.parse(template()))).toEqual([]);
  });

  it("rejects L3 packs for now", () => {
    const raw = template();
    raw.parameters.level = "l3";
    for (const answer of raw.answerKey.answer) {
      Object.assign(answer, answer.outcome === "true_positive"
        ? { decision: "file_report", routing: "nca_sar" }
        : { decision: "no_report" });
    }
    expect(checkPackSupport(packSchema.parse(raw))).toEqual([
      "This version of CaseDrill does not support L3 packs yet.",
    ]);
  });

  it("rejects hidden documents at Level 1", () => {
    const raw = template();
    raw.parameters.level = "l1";
    for (const scenario of raw.scenarios.scenario) {
      delete scenario.priorWork;
      for (const block of scenario.reportBlocks.block) block.section = "escalation_note";
    }
    for (const answer of raw.answerKey.answer) {
      if (answer.outcome === "true_positive") Object.assign(answer, { decision: "escalate", routing: "", correctBlocks: "B1" });
    }
    expect(checkPackSupport(packSchema.parse(raw)).join()).toContain("cannot request documents");
  });

  it("rejects a payment method missing from the profile", () => {
    const raw = template();
    raw.parameters.jurisdiction = "eu";
    for (const answer of raw.answerKey.answer) {
      if (answer.outcome === "true_positive") answer.routing = "mlro,national_fiu";
    }
    expect(checkPackSupport(packSchema.parse(raw)).join()).toContain("faster_payments");
  });
});
