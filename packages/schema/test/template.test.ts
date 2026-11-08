import { readFileSync } from "node:fs";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { beforeEach, describe, expect, it } from "vitest";
import { packSchema, xmlParserOptions } from "../src";

const xml = readFileSync(new URL("../../../templates/casedrill-template.xml", import.meta.url), "utf8");

// The tests edit raw parsed XML, so its shape is intentionally loose here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pack: any;

const messages = () => {
  const result = packSchema.safeParse(pack);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};
const answerFor = (id: string) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pack.answerKey.answer.find((item: any) => item.scenarioId === id);

const SEALED = { alg: "AES-256-GCM", keySource: "app", salt: "abc", iv: "def", text: "ghi" };

beforeEach(() => {
  pack = new XMLParser(xmlParserOptions).parse(xml).trainingPack;
});

describe("template", () => {
  it("is well-formed XML", () => {
    expect(XMLValidator.validate(xml)).toBe(true);
  });

  it("passes the schema", () => {
    expect(messages()).toEqual([]);
  });

  it("converts attribute values and lists", () => {
    const parsed = packSchema.parse(pack);
    expect(parsed.parameters.truePositives).toBe(1);
    const answer = parsed.answerKey?.answer.find((item) => item.scenarioId === "S7K2");
    expect(answer?.routing).toEqual(["mlro", "nca_sar"]);
  });

  it("documents every outcome in the instructions", () => {
    expect(pack.aiInstructions).toContain("true_positive, false_positive, borderline");
  });
});

describe("counts", () => {
  it("rejects a wrong true positive count", () => {
    pack.parameters.truePositives = "2";
    expect(messages().join()).toContain("the answer key has 1");
  });

  it("rejects a wrong scenario count", () => {
    pack.parameters.cases = "3";
    expect(messages().join()).toContain("the file has 2 scenarios");
  });

  it("rejects too many generated transactions", () => {
    for (const rule of pack.scenarios.scenario[0].transactionRules.txRule) rule.count = "200";
    for (const rule of pack.scenarios.scenario[1].transactionRules.txRule) rule.count = "200";
    expect(messages()).toEqual([]);
    const copies = Array.from({ length: 8 }, (_, index) => {
      const copy = structuredClone(pack.scenarios.scenario[0]);
      copy.id = `X${index}`;
      return copy;
    });
    pack.scenarios.scenario.push(...copies);
    expect(messages().join()).toContain("the limit is 5000");
  });
});

describe("references", () => {
  it("rejects an unknown account", () => {
    pack.scenarios.scenario[0].transactionRules.txRule[0].accountId = "FICT-ACC-9999";
    expect(messages().join()).toContain("Unknown account");
  });

  it("rejects an unknown irregularity target", () => {
    answerFor("S7K2").irregularity[0].targetRef = "R99";
    expect(messages().join()).toContain("Unknown transaction");
  });

  it("rejects an unknown report block", () => {
    answerFor("S7K2").correctBlocks = "B1,B99";
    expect(messages().join()).toContain("Unknown report block");
  });

  it("rejects a scenario without an answer", () => {
    pack.answerKey.answer = [answerFor("S7K2")];
    expect(messages().join()).toContain("Missing answer for scenario: S3M9");
  });
});

describe("answer rules", () => {
  it("does not allow a true positive to be closed", () => {
    answerFor("S7K2").decision = "close";
    expect(messages().join()).toContain("At L2, a true positive must be refer_to_mlro");
  });

  it("does not allow a false positive to be referred", () => {
    answerFor("S3M9").decision = "refer_to_mlro";
    expect(messages().join()).toContain("At L2, a false positive must be close");
  });

  it("requires two acceptable decisions on borderline cases", () => {
    Object.assign(answerFor("S3M9"), { outcome: "borderline", acceptable: "close" });
    pack.parameters.borderline = "1";
    expect(messages().join()).toContain("at least two acceptable decisions");
  });

  it("accepts a valid borderline case", () => {
    Object.assign(answerFor("S3M9"), { outcome: "borderline", acceptable: "close,refer_to_mlro" });
    pack.parameters.borderline = "1";
    expect(messages()).toEqual([]);
  });

  it("rejects a borderline decision from another level", () => {
    Object.assign(answerFor("S3M9"), { outcome: "borderline", acceptable: "close,escalate" });
    pack.parameters.borderline = "1";
    expect(messages().join()).toContain("escalate is not available in L2 packs");
  });

  it("never accepts tipping off as correct", () => {
    answerFor("S7K2").routing = "mlro,customer_notification";
    expect(messages().join()).toContain("customer_notification can never be a correct route");
  });

  it("rejects NCA routing in an EU pack", () => {
    pack.parameters.jurisdiction = "eu";
    expect(messages().join()).toContain("nca_sar is UK only");
  });

  it("requires a distractor among report blocks", () => {
    answerFor("S7K2").correctBlocks = "B1,B2,B3,B4,B5,B6";
    expect(messages().join()).toContain("at least one distractor");
  });
});

describe("levels", () => {
  const scenarios = () => pack.scenarios.scenario;

  const toL1 = () => {
    pack.parameters.level = "l1";
    for (const item of scenarios()) {
      delete item.priorWork;
      for (const block of item.reportBlocks.block) block.section = "escalation_note";
    }
    Object.assign(answerFor("S7K2"), { decision: "escalate", correctBlocks: "B1" });
    delete answerFor("S7K2").routing;
  };

  const toL3 = () => {
    pack.parameters.level = "l3";
    Object.assign(answerFor("S7K2"), { decision: "file_report", routing: "nca_sar" });
    answerFor("S3M9").decision = "no_report";
  };

  it("accepts a valid L1 pack", () => {
    toL1();
    expect(messages()).toEqual([]);
  });

  it("rejects routing in L1", () => {
    toL1();
    answerFor("S7K2").routing = "mlro";
    expect(messages().join()).toContain("L1 packs cannot have routing");
  });

  it("rejects prior work in L1", () => {
    toL1();
    scenarios()[0].priorWork = { author: "Analyst", text: "Notes" };
    expect(messages().join()).toContain("priorWork is not allowed in L1");
  });

  it("rejects a full report section in L1", () => {
    toL1();
    scenarios()[0].reportBlocks.block[0].section = "reason_for_suspicion";
    expect(messages().join()).toContain("not used in L1");
  });

  it("accepts a valid L3 pack with prior work errors", () => {
    toL3();
    answerFor("S7K2").priorWorkError = [{ note: "The review period was too short." }];
    expect(messages()).toEqual([]);
  });

  it("requires prior work in L3", () => {
    toL3();
    delete scenarios()[0].priorWork;
    expect(messages().join()).toContain("priorWork is required in L3");
  });

  it("requires an external route on an L3 filing", () => {
    toL3();
    answerFor("S7K2").routing = "mlro";
    expect(messages().join()).toContain("needs an external reporting route");
  });

  it("allows prior work errors only in L3", () => {
    answerFor("S7K2").priorWorkError = [{ note: "A mistake." }];
    expect(messages().join()).toContain("only allowed in L3");
  });

  it("rejects a DAML section in an EU pack", () => {
    pack.parameters.jurisdiction = "eu";
    answerFor("S7K2").routing = "mlro,national_fiu";
    scenarios()[0].reportBlocks.block[0].section = "daml_request";
    expect(messages()).toEqual(["daml_request is UK only"]);
  });
});

describe("safety", () => {
  it("rejects identifiers that do not look fictional", () => {
    pack.scenarios.scenario[0].customer.id = "CUST-0001";
    expect(messages().join()).toContain("must look fictional");
  });

  it("rejects answer fields placed inside a scenario", () => {
    pack.scenarios.scenario[0].outcome = "true_positive";
    expect(messages().join().toLowerCase()).toContain("unrecognized key");
  });

  it("rejects impossible dates", () => {
    pack.parameters.asOfDate = "2026-02-31";
    expect(messages().join()).toContain("Not a real calendar date");
  });
});

describe("sealed packs", () => {
  it("accepts a sealed answer key on its own", () => {
    delete pack.answerKey;
    pack.sealedAnswerKey = SEALED;
    expect(messages()).toEqual([]);
  });

  it("rejects a pack with both keys", () => {
    pack.sealedAnswerKey = SEALED;
    expect(messages().join()).toContain("exactly one");
  });

  it("rejects a pack with neither key", () => {
    delete pack.answerKey;
    expect(messages().join()).toContain("exactly one");
  });
});
