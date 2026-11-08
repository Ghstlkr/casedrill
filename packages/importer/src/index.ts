import { checkPackSupport } from "@casedrill/profiles";
import { collectCrossFieldIssues, LIMITS, packSchema, parseRange, type TrainingPack, xmlParserOptions } from "@casedrill/schema";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { scanForOutcomeLeaks, scanForPersonalData, type ScanFinding } from "./scan";

export const MAX_PACK_BYTES = 2 * 1024 * 1024;
const MAX_ERRORS = 40;

export type ImportIssue = {
  location: string;
  message: string;
  /** The UI can hide these from a trainee, because they mention the answers. */
  revealsAnswers: boolean;
};

export type ImportedPack = Omit<TrainingPack, "aiInstructions">;

export type PackSummary = {
  title: string;
  jurisdiction: TrainingPack["parameters"]["jurisdiction"];
  level: TrainingPack["parameters"]["level"];
  cases: number;
  /** Null when an instructor chose to show only a percentage range. */
  truePositives: number | null;
  borderline: number | null;
  falsePositives: number | null;
  truePositivePercent: number | null;
  /** Shown before the session starts and again in the results. */
  truePositiveLine: string;
  sealed: boolean;
};

export type ImportResult =
  | { ok: true; pack: ImportedPack; summary: PackSummary; warnings: ImportIssue[] }
  | { ok: false; errors: ImportIssue[]; repairPrompt: string };

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Path = (string | number)[];

const WRAPPERS = new Set([
  "scenarios",
  "answerKey",
  "accounts",
  "counterparties",
  "transactionRules",
  "documents",
  "reportBlocks",
]);

function describePath(path: Path, raw: Raw): string {
  let head = "";
  let rest = path;
  const index = typeof path[2] === "number" ? path[2] : undefined;

  if (path[0] === "scenarios" && path[1] === "scenario" && index !== undefined) {
    const id = raw.scenarios?.scenario?.[index]?.id;
    head = `Scenario ${index + 1}${id ? ` (${id})` : ""}`;
    rest = path.slice(3);
  } else if (path[0] === "answerKey" && path[1] === "answer" && index !== undefined) {
    head = `Answer for ${raw.answerKey?.answer?.[index]?.scenarioId ?? `scenario ${index + 1}`}`;
    rest = path.slice(3);
  }

  const parts: string[] = [];
  for (const part of rest) {
    if (typeof part === "number") parts[parts.length - 1] = `${parts.at(-1) ?? "item"} ${part + 1}`;
    else if (!WRAPPERS.has(part)) parts.push(part);
  }
  return [head, ...parts].filter(Boolean).join(" > ") || "Pack";
}

const revealsAnswers = (path: Path) =>
  path[0] === "answerKey" || path.includes("truePositives") || path.includes("borderline");

function friendlyMessage(message: string): string {
  if (message === "Required") return "This field is missing.";
  return message.replace(/^Unrecognized key\(s\) in object: /, "Field not allowed here: ");
}

function buildRepairPrompt(errors: ImportIssue[]): string {
  return [
    "CaseDrill could not import this XML file. Fix only the problems below and return the complete XML as a downloadable file.",
    "Do not describe the scenarios or the answers in your message. Keep following the aiInstructions block.",
    "",
    ...errors.map((error) => `- ${error.location}: ${error.message}`),
  ].join("\n");
}

function fail(issues: ImportIssue[]): ImportResult {
  const unique = [...new Map(issues.map((item) => [`${item.location}|${item.message}`, item])).values()];
  const errors = unique.slice(0, MAX_ERRORS);
  if (unique.length > MAX_ERRORS) {
    errors.push({
      location: "Pack",
      message: `There are ${unique.length - MAX_ERRORS} more problems. Fix these first, then import again.`,
      revealsAnswers: false,
    });
  }
  return { ok: false, errors, repairPrompt: buildRepairPrompt(errors) };
}

const failure = (message: string) => fail([{ location: "File", message, revealsAnswers: false }]);

/** Removes a BOM, chat text or code fences that often surround XML returned by an AI. */
export function extractXml(input: string): string | ImportResult {
  const startMatch = /<\?xml|<trainingPack[\s>]/.exec(input);
  if (!startMatch) return failure("This is not a CaseDrill pack: no <trainingPack> element was found.");

  const closing = "</trainingPack>";
  const end = input.lastIndexOf(closing);
  if (end === -1) {
    return failure("The file ends before </trainingPack>, so it appears to have been cut off. Ask for fewer scenarios.");
  }
  return input.slice(startMatch.index, end + closing.length);
}

function checkUnsafeMarkup(xml: string): ImportResult | undefined {
  const active = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  if (/<!DOCTYPE|<!ENTITY/i.test(active)) return failure("DOCTYPE and ENTITY declarations are not allowed.");
  if (/[<\s]__proto__[\s=>/]/.test(active)) return failure("The name __proto__ is not allowed.");
  return undefined;
}

const alerts = (count: number) => `${count} ${count === 1 ? "alert" : "alerts"}`;

function buildSummary(pack: ImportedPack): PackSummary {
  const { title, jurisdiction, level, cases, truePositiveRange } = pack.parameters;
  const shared = { title, jurisdiction, level, cases, sealed: Boolean(pack.sealedAnswerKey) };

  if (truePositiveRange !== undefined) {
    const { min, max } = parseRange(truePositiveRange);
    return {
      ...shared,
      truePositives: null,
      borderline: null,
      falsePositives: null,
      truePositivePercent: null,
      truePositiveLine: `True positives: between ${min}% and ${max}% of ${alerts(cases)}`,
    };
  }

  const truePositives = pack.parameters.truePositives ?? 0;
  const borderline = pack.parameters.borderline ?? 0;
  const truePositivePercent = Math.round((truePositives / cases) * 100);
  return {
    ...shared,
    truePositives,
    borderline,
    falsePositives: cases - truePositives - borderline,
    truePositivePercent,
    truePositiveLine: `True positives: ${truePositives} of ${alerts(cases)} (${truePositivePercent}%)`,
  };
}

function buildWarnings(pack: ImportedPack, now: Date): ImportIssue[] {
  const warnings: ImportIssue[] = [];
  const add = (message: string, reveals = false) =>
    warnings.push({ location: "Pack", message, revealsAnswers: reveals });
  const { cases, truePositives, asOfDate } = pack.parameters;

  if (cases > LIMITS.recommendedCases) {
    add(`This pack has ${cases} cases. Packs of ${LIMITS.recommendedCases} or fewer are easier to generate and complete.`);
  }
  if (truePositives !== undefined && cases >= 4 && truePositives / cases > 0.5) {
    add("Most alerts in this pack are true positives. Real queues usually contain far more false positives.", true);
  }
  const days = (now.getTime() - new Date(`${asOfDate}T00:00:00Z`).getTime()) / 86_400_000;
  if (days > 365) add(`This pack was written for the rules as of ${asOfDate}. They may have changed.`);

  const documentCounts = (outcome: string) =>
    (pack.answerKey?.answer ?? [])
      .filter((answer) => answer.outcome === outcome)
      .map(
        (answer) =>
          pack.scenarios.scenario.find((item) => item.id === answer.scenarioId)?.documents.document.length ?? 0,
      );
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const positives = documentCounts("true_positive");
  const negatives = documentCounts("false_positive");
  if (positives.length > 0 && negatives.length > 0 && Math.abs(mean(positives) - mean(negatives)) >= 1) {
    add("True and false positives have different numbers of documents, which can give away the answers.", true);
  }
  return warnings;
}

export function importPack(input: string, options: { now?: Date } = {}): ImportResult {
  if (new TextEncoder().encode(input).length > MAX_PACK_BYTES) {
    return failure(`The file is larger than the ${MAX_PACK_BYTES / 1024 / 1024} MB limit.`);
  }

  const xml = extractXml(input.replace(/^﻿/, ""));
  if (typeof xml !== "string") return xml;

  const unsafe = checkUnsafeMarkup(xml);
  if (unsafe) return unsafe;

  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    return fail([
      { location: `Line ${validation.err.line}`, message: `Invalid XML: ${validation.err.msg}`, revealsAnswers: false },
    ]);
  }

  const document = new XMLParser(xmlParserOptions).parse(xml) as Raw;
  const raw = document.trainingPack as Raw | undefined;
  if (!raw || typeof raw !== "object") return failure("This is not a CaseDrill pack: the root must be <trainingPack>.");

  const parsed = packSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(
      [...parsed.error.issues, ...collectCrossFieldIssues(raw)].map((issue) => ({
        location: describePath(issue.path, raw),
        message: friendlyMessage(issue.message),
        revealsAnswers: revealsAnswers(issue.path),
      })),
    );
  }

  const { aiInstructions: _ignored, ...pack } = parsed.data;

  const findings: ScanFinding[] = [
    ...scanForPersonalData(pack.scenarios, ["scenarios"]),
    ...scanForPersonalData(pack.answerKey, ["answerKey"]),
    ...scanForOutcomeLeaks(pack.scenarios, ["scenarios"]),
  ];
  const issues: ImportIssue[] = [
    ...findings.map(({ path, message }) => ({
      location: describePath(path, raw),
      message,
      revealsAnswers: revealsAnswers(path),
    })),
    ...checkPackSupport(parsed.data).map((message) => ({ location: "Pack", message, revealsAnswers: false })),
  ];
  if (issues.length > 0) return fail(issues);

  return { ok: true, pack, summary: buildSummary(pack), warnings: buildWarnings(pack, options.now ?? new Date()) };
}
