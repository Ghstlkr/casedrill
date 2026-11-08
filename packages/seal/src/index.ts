import { extractXml, importPack, type ImportedPack, type PackSummary } from "@casedrill/importer";
import { type AnswerKey, parseAnswerKey, xmlParserOptions } from "@casedrill/schema";
import { XMLParser } from "fast-xml-parser";

export const MIN_PASSWORD_LENGTH = 8;
const PBKDF2_ITERATIONS = 600_000;
const KDF_INFO = "casedrill-seal-v1";

/**
 * Not a secret: this code is public, so an app-sealed pack only prevents casual reading.
 * Real protection comes from a password, which is never stored in the file.
 */
const APP_KEY_MATERIAL = "casedrill-public-app-key-v1";

export type SealOptions = {
  /** Required for real protection, and for a percentage range. */
  password?: string;
  /** Shows "between min% and max%" instead of the exact counts. */
  range?: { min: number; max: number };
};

export type SealResult =
  | { ok: true; xml: string; fileName: string; summary: PackSummary }
  | { ok: false; errors: string[] };

export type OpenResult =
  | { ok: true; answerKey: AnswerKey }
  | { ok: false; reason: "password_required" | "cannot_open" | "invalid_answers"; message: string };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const buffer = (value: Uint8Array) => value as unknown as BufferSource;

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;
  if (!api) throw new Error("This browser cannot seal or open packs here. Open CaseDrill over HTTPS.");
  return api;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function deriveKey(keySource: "app" | "password", salt: Uint8Array, password?: string): Promise<CryptoKey> {
  const aes = { name: "AES-GCM", length: 256 };
  const usages: KeyUsage[] = ["encrypt", "decrypt"];

  if (keySource === "password") {
    const material = encoder.encode((password ?? "").normalize("NFKC"));
    const base = await subtle().importKey("raw", buffer(material), "PBKDF2", false, ["deriveKey"]);
    return subtle().deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt: buffer(salt), iterations: PBKDF2_ITERATIONS },
      base,
      aes,
      false,
      usages,
    );
  }

  const base = await subtle().importKey("raw", buffer(encoder.encode(APP_KEY_MATERIAL)), "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: buffer(salt), info: buffer(encoder.encode(KDF_INFO)) },
    base,
    aes,
    false,
    usages,
  );
}

/** Ties the answers to the visible pack, so changing either one stops the file from opening. */
const bindingData = (pack: ImportedPack) =>
  encoder.encode(JSON.stringify({ parameters: pack.parameters, scenarios: pack.scenarios }));

const slug = (title: string) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "casedrill-pack";

function checkOptions({ password, range }: SealOptions): string[] {
  const errors: string[] = [];
  if (password !== undefined && password.normalize("NFKC").length < MIN_PASSWORD_LENGTH) {
    errors.push(`The password must have at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (range) {
    if (password === undefined) errors.push("A percentage range needs a password.");
    if (!Number.isInteger(range.min) || !Number.isInteger(range.max) || range.min < 0 || range.min >= range.max || range.max > 100) {
      errors.push("The range must rise from a lower to a higher whole percentage, up to 100.");
    }
  }
  return errors;
}

const ATTRIBUTE = /\s(?:truePositives|borderline)\s*=\s*(?:"[^"]*"|'[^']*')/g;
const PARAMETERS_TAG = /<parameters\b(?:[^>"']|"[^"]*"|'[^']*')*>/;

function removeUnsealedContent(xml: string): string {
  return xml
    .replace(/<aiInstructions\s*>[\s\S]*?<\/aiInstructions\s*>/, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->/g, (match) => (match.startsWith("<!--") ? "" : match));
}

function applyRange(xml: string, range: SealOptions["range"]): string {
  if (!range) return xml;
  return xml.replace(PARAMETERS_TAG, (tag) =>
    tag.replace(ATTRIBUTE, "").replace(/<parameters\b/, `<parameters truePositiveRange="${range.min}-${range.max}"`),
  );
}

/** Returns a copy of the pack with the answers encrypted and the AI instructions removed. */
export async function sealPack(input: string, options: SealOptions = {}): Promise<SealResult> {
  const optionErrors = checkOptions(options);
  if (optionErrors.length > 0) return { ok: false, errors: optionErrors };

  const imported = importPack(input);
  if (!imported.ok) return { ok: false, errors: imported.errors.map((item) => `${item.location}: ${item.message}`) };
  if (imported.summary.sealed || !imported.pack.answerKey) return { ok: false, errors: ["This pack is already sealed."] };

  if (options.range) {
    const share = ((imported.summary.truePositives ?? 0) / imported.summary.cases) * 100;
    if (share < options.range.min || share > options.range.max) {
      return { ok: false, errors: ["The range must include the pack's real share of true positives."] };
    }
  }

  const source = extractXml(input.replace(/^﻿/, "")) as string;
  const rawAnswers = new XMLParser(xmlParserOptions).parse(source).trainingPack.answerKey;

  const keySource = options.password === undefined ? "app" : "password";
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const element = (content: string) =>
    `<sealedAnswerKey alg="AES-256-GCM" keySource="${keySource}" salt="${toBase64(salt)}" iv="${toBase64(iv)}">${content}</sealedAnswerKey>`;

  const skeleton = applyRange(removeUnsealedContent(source), options.range);
  const swapAnswers = (content: string) =>
    skeleton.replace(/<answerKey\s*>[\s\S]*<\/answerKey\s*>/, () => element(content));

  const draft = importPack(swapAnswers("PENDING"));
  if (!draft.ok) return { ok: false, errors: draft.errors.map((item) => `${item.location}: ${item.message}`) };

  const key = await deriveKey(keySource, salt, options.password);
  const cipher = await subtle().encrypt(
    { name: "AES-GCM", iv: buffer(iv), additionalData: buffer(bindingData(draft.pack)) },
    key,
    buffer(encoder.encode(JSON.stringify(rawAnswers))),
  );
  const xml = swapAnswers(toBase64(new Uint8Array(cipher)));

  const failed = await findSealingProblem(xml, imported.pack.answerKey, options.password);
  if (failed) return { ok: false, errors: [failed] };

  const final = importPack(xml);
  if (!final.ok) return { ok: false, errors: ["The sealed file could not be verified."] };
  return { ok: true, xml, fileName: `${slug(imported.summary.title)}.sealed.xml`, summary: final.summary };
}

/** A sealed file is delivered only if it opens to the same answers and contains no plain answers. */
async function findSealingProblem(xml: string, expected: AnswerKey, password?: string): Promise<string | undefined> {
  const reopened = importPack(xml);
  if (!reopened.ok) return "The sealed file could not be verified.";

  const opened = await openAnswerKey(reopened.pack, { password });
  if (!opened.ok || JSON.stringify(opened.answerKey) !== JSON.stringify(expected)) {
    return "The sealed file did not open to the original answers.";
  }

  const leaked = /<answerKey|<aiInstructions|<!--/.test(xml) || expected.answer.some((item) => xml.includes(item.explanation));
  return leaked ? "Plain answers were found in the sealed file, so it was not created." : undefined;
}

/** Returns the answers. Call this only when the session has been closed. */
export async function openAnswerKey(pack: ImportedPack, options: { password?: string } = {}): Promise<OpenResult> {
  if (pack.answerKey) return { ok: true, answerKey: pack.answerKey };

  const sealed = pack.sealedAnswerKey;
  if (!sealed) return { ok: false, reason: "cannot_open", message: "This pack has no answers." };
  if (sealed.keySource === "password" && !options.password) {
    return { ok: false, reason: "password_required", message: "Enter the instructor's password to see the results." };
  }

  let raw: unknown;
  try {
    const key = await deriveKey(sealed.keySource, fromBase64(sealed.salt), options.password);
    const plain = await subtle().decrypt(
      { name: "AES-GCM", iv: buffer(fromBase64(sealed.iv)), additionalData: buffer(bindingData(pack)) },
      key,
      buffer(fromBase64(sealed.text)),
    );
    raw = JSON.parse(decoder.decode(plain));
  } catch {
    const message =
      sealed.keySource === "password"
        ? "The answers could not be opened. The password is wrong or the file was changed."
        : "The answers could not be opened because the file was changed.";
    return { ok: false, reason: "cannot_open", message };
  }

  const parsed = parseAnswerKey(raw, pack);
  if (!parsed.ok) {
    return { ok: false, reason: "invalid_answers", message: `The answers in this file are not valid: ${parsed.messages[0]}` };
  }
  return { ok: true, answerKey: parsed.answerKey };
}

/** The part of a pack that is safe to give to the training screens. */
export function toTraineeView(pack: ImportedPack): Omit<ImportedPack, "answerKey" | "sealedAnswerKey"> {
  const { answerKey: _answers, sealedAnswerKey: _sealed, ...view } = pack;
  return view;
}
