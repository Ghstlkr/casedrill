import { readdirSync, readFileSync } from "node:fs";
import { importPack, type ImportedPack } from "@casedrill/importer";
import { parseAnswerKey, xmlParserOptions } from "@casedrill/schema";
import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { openAnswerKey, sealPack, toTraineeView } from "../src";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const template = read("templates/casedrill-template.xml");
const PASSWORD = "correct horse";

const load = (xml: string): ImportedPack => {
  const result = importPack(xml);
  if (!result.ok) throw new Error(result.repairPrompt);
  return result.pack;
};

const seal = async (xml = template, options = {}) => {
  const result = await sealPack(xml, options);
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result;
};
const errorsOf = async (xml: string, options = {}) => {
  const result = await sealPack(xml, options);
  if (result.ok) throw new Error("Expected sealing to fail");
  return result.errors.join("; ");
};

describe("sealing with the app key", () => {
  it("opens to the original answers", async () => {
    const opened = await openAnswerKey(load((await seal()).xml));
    expect(opened).toEqual({ ok: true, answerKey: load(template).answerKey });
  });

  it("removes the plain answers, AI instructions and comments", async () => {
    const withComment = template.replace("<scenarios>", "<!-- S7K2 is the irregular one --><scenarios>");
    const { xml } = await seal(withComment);
    expect(xml).not.toContain("<answerKey");
    expect(xml).not.toContain("aiInstructions");
    expect(xml).not.toContain("irregular one");
    expect(xml).not.toContain("documented property sale");
    expect(xml).not.toContain("<!--");
  });

  it("keeps the scenarios and shows the count", async () => {
    const result = await seal();
    expect(load(result.xml).scenarios).toEqual(load(template).scenarios);
    expect(result.summary.truePositiveLine).toBe("True positives: 1 of 2 alerts (50%)");
    expect(result.summary.sealed).toBe(true);
  });

  it("names the file after the pack", async () => {
    expect((await seal()).fileName).toBe("example-pack.sealed.xml");
  });

  it("produces different output each time", async () => {
    expect((await seal()).xml).not.toBe((await seal()).xml);
  });

  it.each(readdirSync(new URL("packs/curated/", root)))("seals %s", async (name) => {
    const xml = read(`packs/curated/${name}`);
    const opened = await openAnswerKey(load((await seal(xml)).xml));
    expect(opened.ok).toBe(true);
  });
});

describe("sealing with a password", () => {
  it("opens with the password", async () => {
    const pack = load((await seal(template, { password: PASSWORD })).xml);
    expect((await openAnswerKey(pack, { password: PASSWORD })).ok).toBe(true);
  });

  it("asks for a password when none is given", async () => {
    const pack = load((await seal(template, { password: PASSWORD })).xml);
    expect(await openAnswerKey(pack)).toMatchObject({ ok: false, reason: "password_required" });
  });

  it("refuses the wrong password", async () => {
    const pack = load((await seal(template, { password: PASSWORD })).xml);
    expect(await openAnswerKey(pack, { password: "wrong password" })).toMatchObject({ ok: false, reason: "cannot_open" });
  });

  it("rejects a short password", async () => {
    expect(await errorsOf(template, { password: "short" })).toContain("at least 8");
  });
});

describe("tamper detection", () => {
  const cannotOpen = { ok: false, reason: "cannot_open" };

  it("detects a changed answer block", async () => {
    const { xml } = await seal();
    const altered = xml.replace(/(<sealedAnswerKey[^>]*>)(.)(.)/, (_all, tag, first, second) =>
      `${tag}${first === "A" ? "B" : "A"}${second}`);
    expect(altered).not.toBe(xml);
    expect(await openAnswerKey(load(altered))).toMatchObject(cannotOpen);
  });

  it("detects a changed scenario", async () => {
    const altered = (await seal()).xml.replace("Sample Person A", "Sample Person Z");
    expect(await openAnswerKey(load(altered))).toMatchObject(cannotOpen);
  });

  it("detects a changed count", async () => {
    const altered = (await seal()).xml.replace('borderline="0"', 'borderline="1"');
    expect(await openAnswerKey(load(altered))).toMatchObject(cannotOpen);
  });

  it("refuses answers moved from another pack", async () => {
    const other = read("packs/curated/uk-l2-cash-business-review.xml");
    const donor = /<sealedAnswerKey[\s\S]*<\/sealedAnswerKey>/.exec((await seal(other)).xml)![0];
    const swapped = (await seal()).xml.replace(/<sealedAnswerKey[\s\S]*<\/sealedAnswerKey>/, () => donor);
    expect(await openAnswerKey(load(swapped))).toMatchObject(cannotOpen);
  });
});

describe("percentage range", () => {
  const options = { password: PASSWORD, range: { min: 30, max: 70 } };

  it("removes the exact counts from the file", async () => {
    const { xml, summary } = await seal(template, options);
    expect(xml).not.toMatch(/truePositives=|borderline=/);
    expect(xml).toContain('truePositiveRange="30-70"');
    expect(summary.truePositives).toBeNull();
    expect(summary.truePositiveLine).toBe("True positives: between 30% and 70% of 2 alerts");
  });

  it("still opens and validates the answers", async () => {
    const pack = load((await seal(template, options)).xml);
    expect((await openAnswerKey(pack, { password: PASSWORD })).ok).toBe(true);
  });

  it("needs a password", async () => {
    expect(await errorsOf(template, { range: { min: 30, max: 70 } })).toContain("needs a password");
  });

  it("must include the real share", async () => {
    expect(await errorsOf(template, { password: PASSWORD, range: { min: 10, max: 30 } })).toContain("real share");
  });

  it("must be a valid range", async () => {
    expect(await errorsOf(template, { password: PASSWORD, range: { min: 70, max: 30 } })).toContain("rise from");
  });

  it("is rejected in a pack that is not password-sealed", () => {
    const xml = template.replace('truePositives="1" borderline="0"', 'truePositiveRange="30-70"');
    const result = importPack(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.repairPrompt).toContain("only allowed in password-sealed packs");
  });
});

describe("invalid input", () => {
  it("reports import errors", async () => {
    expect(await errorsOf(template.replace('id="FICT-CUST-0001"', 'id="CUST-1"'))).toContain("customer > id");
  });

  it("does not seal twice", async () => {
    expect(await errorsOf((await seal()).xml)).toContain("already sealed");
  });
});

describe("decrypted answers", () => {
  const rawAnswers = () => new XMLParser(xmlParserOptions).parse(template).trainingPack.answerKey;

  it("are accepted when they match the pack", () => {
    expect(parseAnswerKey(rawAnswers(), load(template)).ok).toBe(true);
  });

  it("are rejected when the count differs", () => {
    const raw = rawAnswers();
    const pack = load(template);
    pack.parameters.truePositives = 2;
    expect(parseAnswerKey(raw, pack)).toMatchObject({ ok: false });
  });

  it("are rejected when they point to an unknown scenario", () => {
    const raw = rawAnswers();
    raw.answer[0].scenarioId = "NOPE";
    expect(parseAnswerKey(raw, load(template))).toMatchObject({ ok: false });
  });
});

describe("trainee view", () => {
  it("contains no answers", async () => {
    for (const pack of [load(template), load((await seal()).xml)]) {
      const view = toTraineeView(pack);
      expect(view).not.toHaveProperty("answerKey");
      expect(view).not.toHaveProperty("sealedAnswerKey");
      expect(view.scenarios.scenario.length).toBe(2);
    }
  });
});
