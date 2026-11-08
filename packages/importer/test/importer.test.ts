import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importPack, MAX_PACK_BYTES } from "../src";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const template = read("templates/casedrill-template.xml");
const NOW = new Date("2026-11-08T12:00:00Z");

const run = (xml: string) => importPack(xml, { now: NOW });
const errorsOf = (xml: string) => {
  const result = run(xml);
  if (result.ok) throw new Error("Expected the import to fail");
  return result.errors;
};
const firstError = (xml: string) => errorsOf(xml)[0]!;
const okOf = (xml: string) => {
  const result = run(xml);
  if (!result.ok) throw new Error(result.repairPrompt);
  return result;
};
const withText = (text: string) => template.replace("Opened an account online.", text);

describe("valid files", () => {
  it("imports the template", () => {
    expect(okOf(template).summary.title).toBe("Example pack");
  });

  it.each(readdirSync(new URL("packs/curated/", root)))("imports %s", (name) => {
    expect(okOf(read(`packs/curated/${name}`)).warnings).toEqual([]);
  });

  it("states the true positive count clearly", () => {
    const { summary } = okOf(template);
    expect(summary.truePositiveLine).toBe("True positives: 1 of 2 alerts (50%)");
    expect(summary.falsePositives).toBe(1);
    expect(summary.borderline).toBe(0);
  });

  it("discards the AI instructions", () => {
    expect(okOf(template).pack).not.toHaveProperty("aiInstructions");
  });

  it("accepts a sealed pack and still shows the count", () => {
    const sealed = template.replace(
      /<answerKey>\s*<answer [\s\S]*<\/answerKey>/,
      '<sealedAnswerKey alg="AES-256-GCM" keySource="app" salt="abc" iv="def">ghi</sealedAnswerKey>',
    );
    const result = okOf(sealed);
    expect(result.summary.sealed).toBe(true);
    expect(result.summary.truePositives).toBe(1);
  });
});

describe("text around the XML", () => {
  it("removes a byte order mark", () => {
    expect(run(`﻿${template}`).ok).toBe(true);
  });

  it("removes code fences and chat text", () => {
    expect(run(`Here is your file:\n\`\`\`xml\n${template}\n\`\`\`\nEnjoy!`).ok).toBe(true);
  });
});

describe("unusable files", () => {
  it("rejects unrelated text", () => {
    expect(firstError("hello").message).toContain("not a CaseDrill pack");
  });

  it("detects a file that was cut off", () => {
    expect(firstError(template.slice(0, 4000)).message).toContain("cut off");
  });

  it("rejects an oversized file", () => {
    expect(firstError(" ".repeat(MAX_PACK_BYTES + 1)).message).toContain("limit");
  });

  it("reports the line of malformed XML", () => {
    const error = firstError(template.replace("<accounts>", "<accounts"));
    expect(error.location).toMatch(/^Line \d+/);
    expect(error.message).toContain("Invalid XML");
  });
});

describe("unsafe markup", () => {
  it("rejects a DOCTYPE with entities", () => {
    const attack = template.replace(
      "<trainingPack schemaVersion",
      '<!DOCTYPE a [<!ENTITY x "y">]><trainingPack schemaVersion',
    );
    expect(firstError(attack).message).toContain("DOCTYPE");
  });

  it("rejects a __proto__ attribute", () => {
    expect(firstError(template.replace("<scenarios>", '<scenarios __proto__="x">')).message).toContain("__proto__");
  });

  it("allows those words inside CDATA", () => {
    expect(run(template.replace("WHAT TO DO", "Never add <!DOCTYPE to the file. WHAT TO DO")).ok).toBe(true);
  });
});

describe("validation messages", () => {
  it("names the scenario and field", () => {
    const error = firstError(template.replace('id="FICT-CUST-0001"', 'id="CUST-1"'));
    expect(error.location).toBe("Scenario 1 (S7K2) > customer > id");
    expect(error.revealsAnswers).toBe(false);
  });

  it("explains a missing field", () => {
    const error = firstError(template.replace('occupation="Teacher"', ""));
    expect(error.message).toBe("This field is missing.");
  });

  it("flags errors that mention the answers", () => {
    const error = firstError(template.replace('truePositives="1"', 'truePositives="2"'));
    expect(error.revealsAnswers).toBe(true);
  });

  it("builds a prompt to paste back to the AI", () => {
    const result = run(template.replace('id="FICT-CUST-0001"', 'id="CUST-1"'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.repairPrompt).toContain("return the complete XML");
      expect(result.repairPrompt).toContain("Scenario 1 (S7K2) > customer > id");
    }
  });

  it("rejects L3 packs in this version", () => {
    const xml = template
      .replace('level="l2"', 'level="l3"')
      .replace('decision="refer_to_mlro"', 'decision="file_report"')
      .replace('routing="mlro,nca_sar"', 'routing="nca_sar"')
      .replace('decision="close"', 'decision="no_report"');
    expect(firstError(xml).message).toContain("does not support L3");
  });
});

describe("fictional data checks", () => {
  it.each([
    ["an IBAN", "Account GB29 NWBK 6016 1331 9268 19 was used.", "IBAN"],
    ["a National Insurance number", "NI number AB 12 34 56 C.", "National Insurance"],
    ["a sort code", "Sort code 20-00-00.", "sort code"],
    ["a card number", "Card 4111 1111 1111 1111 was used.", "card number"],
    ["a real email address", "Contact person@bigbank.co.uk today.", "email"],
    ["a phone number", "Call +44 20 7946 0000 today.", "phone"],
  ])("rejects %s without repeating it", (_label, text, expected) => {
    const result = run(withText(text));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.message).toContain(expected);
      expect(result.repairPrompt).not.toContain(text);
    }
  });

  it("allows reserved example email addresses", () => {
    expect(run(withText("Contact sample@example.com today.")).ok).toBe(true);
  });

  it("ignores ordinary long numbers that fail the card check", () => {
    expect(run(withText("Reference 1234 5678 9012 3456 was quoted.")).ok).toBe(true);
  });

  it("rejects outcome wording in the scenario", () => {
    expect(firstError(withText("This is a false positive.")).message).toContain("States the outcome");
  });
});

describe("warnings", () => {
  const manyCases = (count: number, positives: number) => {
    const scenarioXml = /<scenario id="S7K2">[\s\S]*?<\/scenario>/.exec(template)![0];
    const answerXml = /<answer scenarioId="S7K2"[\s\S]*?<\/answer>/.exec(template)![0];
    const fpAnswerXml = /<answer scenarioId="S3M9"[\s\S]*?<\/answer>/.exec(template)![0];
    const fpScenarioXml = /<scenario id="S3M9">[\s\S]*?<\/scenario>/.exec(template)![0];

    const scenarios: string[] = [];
    const answers: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const id = `X${index}`;
      const positive = index < positives;
      scenarios.push((positive ? scenarioXml : fpScenarioXml).replace(/<scenario id="\w+">/, `<scenario id="${id}">`));
      answers.push((positive ? answerXml : fpAnswerXml).replace(/scenarioId="\w+"/, `scenarioId="${id}"`));
    }
    return template
      .replace(/<scenarios>[\s\S]*<\/scenarios>/, `<scenarios>${scenarios.join("")}</scenarios>`)
      .replace(/<answerKey>\s*<answer [\s\S]*<\/answerKey>/, `<answerKey>${answers.join("")}</answerKey>`)
      .replace('cases="2"', `cases="${count}"`)
      .replace('truePositives="1"', `truePositives="${positives}"`);
  };

  it("warns about very large packs", () => {
    const messages = okOf(manyCases(25, 3)).warnings.map((item) => item.message);
    expect(messages.join()).toContain("25 cases");
  });

  it("warns when most alerts are true positives", () => {
    const messages = okOf(manyCases(4, 3)).warnings.map((item) => item.message);
    expect(messages.join()).toContain("Most alerts");
  });

  it("warns about old packs", () => {
    const old = template.replace('asOfDate="2026-11-08"', 'asOfDate="2024-01-01"');
    expect(okOf(old).warnings[0]?.message).toContain("2024-01-01");
  });

  it("warns when document counts differ by outcome", () => {
    const fewer = template.replace(/<document id="D3" kind="source_of_funds"[\s\S]*?<\/document>/, "");
    expect(okOf(fewer).warnings.map((item) => item.message).join()).toContain("different numbers of documents");
  });
});
