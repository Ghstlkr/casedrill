export type ScanFinding = { path: (string | number)[]; message: string };

function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/;
const UK_NINO = /\b[A-CEGHJ-PR-TW-Z]{2} ?\d{2} ?\d{2} ?\d{2} ?[A-D]\b/;
const UK_SORT_CODE = /\b\d{2}-\d{2}-\d{2}\b/;
const CARD = /\b\d(?:[ -]?\d){12,18}\b/g;
const EMAIL = /[\w.+-]+@([\w-]+(?:\.[\w-]+)+)/g;
const PHONE = /\+\d[\d\s()-]{7,}\d/;
const OUTCOME_WORDS = /\b(true[ _]positive|false[ _]positive)\b/i;

const RESERVED_EMAIL_DOMAIN = /(^|\.)example\.(com|org|net)$|\.(example|invalid|test)$/i;

const hasCardNumber = (value: string) =>
  [...value.matchAll(CARD)].some((match) => passesLuhn(match[0].replace(/[ -]/g, "")));

const hasRealEmail = (value: string) =>
  [...value.matchAll(EMAIL)].some((match) => !RESERVED_EMAIL_DOMAIN.test(match[1] ?? ""));

/** Each message names the kind of data only, so a real value is never repeated in a repair prompt. */
const PERSONAL_DATA_CHECKS: [(value: string) => boolean, string][] = [
  [(value) => IBAN.test(value), "Contains something that looks like an IBAN."],
  [(value) => UK_NINO.test(value), "Contains something that looks like a National Insurance number."],
  [(value) => UK_SORT_CODE.test(value), "Contains something that looks like a sort code."],
  [hasCardNumber, "Contains something that looks like a card number."],
  [hasRealEmail, "Contains something that looks like a real email address."],
  [(value) => PHONE.test(value), "Contains something that looks like a phone number."],
];

function walk(
  value: unknown,
  path: (string | number)[],
  visit: (text: string, path: (string | number)[]) => void,
) {
  if (typeof value === "string") visit(value, path);
  else if (Array.isArray(value)) value.forEach((item, index) => walk(item, [...path, index], visit));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) walk(item, [...path, key], visit);
  }
}

/** Looks for data that should never appear in a fictional pack. */
export function scanForPersonalData(root: unknown, rootPath: (string | number)[]): ScanFinding[] {
  const findings: ScanFinding[] = [];
  walk(root, rootPath, (text, path) => {
    for (const [isMatch, message] of PERSONAL_DATA_CHECKS) {
      if (isMatch(text)) findings.push({ path, message });
    }
  });
  return findings;
}

/** Looks for wording that states an outcome in text the trainee can see. */
export function scanForOutcomeLeaks(scenarios: unknown, rootPath: (string | number)[]): ScanFinding[] {
  const findings: ScanFinding[] = [];
  walk(scenarios, rootPath, (text, path) => {
    if (OUTCOME_WORDS.test(text)) findings.push({ path, message: "States the outcome in text the trainee can see." });
  });
  return findings;
}
