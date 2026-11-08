import { createRandom, hash, seededShuffle } from "@casedrill/engine";
import { profiles } from "@casedrill/profiles";
import { type Body, type DocSpec, type Flag, type RuleSpec, type Template, TEMPLATES } from "./templates";

export { TEMPLATES };

export type GenerateOptions = {
  jurisdiction: "uk" | "eu";
  level: "l1" | "l2";
  cases: number;
  truePositives: number;
  difficulty: "easy" | "medium" | "hard";
  seed: number;
};

export const MAX_GENERATED_CASES = 20;

const NOISE: Record<GenerateOptions["difficulty"], number> = { easy: 6, medium: 18, hard: 40 };
const FIRST_NAMES = ["Alex", "Sam", "Robin", "Jamie", "Chris", "Drew", "Quinn", "Reese", "Skyler", "Charlie", "Finley", "Jesse", "Kai", "Logan", "Micah", "Nico", "Oakley", "Peyton", "Remy", "Shay"];
const HIGHER_RISK = "Republic of Exampleland";

const BAD_SUMMARY = "The customer made several payments during the review period.";
const BAD_REASON_SECTOR = "This type of customer is high risk, so the funds are likely to be criminal.";
const BAD_REASON_PROOF = "The customer could not give a satisfactory explanation, which proves that the funds are criminal proceeds.";
const TIP_OFF = "The customer was told that a report would be made, so that they could explain.";

const esc = (value: string | number) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const attrs = (values: Record<string, string | number | undefined>) =>
  Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ` ${key}="${esc(value as string | number)}"`)
    .join("");

const element = (tag: string, values: Record<string, string | number | undefined>, text?: string) =>
  text === undefined ? `<${tag}${attrs(values)}/>` : `<${tag}${attrs(values)}>${esc(text)}</${tag}>`;

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type Built = { scenario: string; answer: string };

/** Builds one scenario and its answer. Ids are assigned after shuffling, so order reveals nothing. */
function buildCase(template: Template, options: GenerateOptions, index: number, name: string, asOf: string): Built {
  const { jurisdiction, level } = options;
  const key = `${options.seed}:${index}:${template.pattern}`;
  const random = createRandom(hash(key));
  const scale = Math.round((0.8 + random() * 0.45) * 100) / 100;
  const currency = jurisdiction === "uk" ? "GBP" : "EUR";
  const uk = jurisdiction === "uk";
  const round = (value: number) => (value < 100 ? Math.round(value) : Math.round(value / 10) * 10);
  const m = (amount: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(round(amount * scale));

  const body: Body = template.build({
    m,
    fast: uk ? "faster_payments" : "sepa",
    high: uk ? "chaps" : "sepa",
    salary: uk ? "bacs" : "sepa",
    person: name,
  });

  const profile = profiles[jurisdiction];
  const home = uk ? "United Kingdom" : "Fictland (EU Member State)";
  const number = String(index + 1).padStart(2, "0");
  const scenarioId = `S${hash(key).toString(36).toUpperCase().slice(0, 5)}${number}`;
  const customerId = `FICT-CUST-${number}01`;
  const accountId = `FICT-ACC-${number}01`;
  const raisedOn = addDays(asOf, -(1 + Math.floor(random() * 25)));
  const onboardedOn = addDays(raisedOn, -(200 + Math.floor(random() * 2000)));

  const noiseParties = { merchant: { name: "Exemplar Supermarket", kind: "merchant" as const }, utility: { name: "Fictia Energy", kind: "merchant" as const } };
  const parties = { ...body.parties, ...noiseParties };
  const partyIds = new Map(Object.keys(parties).map((partyKey, position) => [partyKey, `FICT-CP-${number}${String(position + 1).padStart(2, "0")}`]));

  const noiseRules: RuleSpec[] = [
    { parties: ["merchant"], dir: "out", rail: "card", n: NOISE[options.difficulty], min: 4, max: 70, from: -85, to: 0, ref: "Card purchase" },
    { parties: ["utility"], dir: "out", rail: uk ? "bacs" : "sepa", n: 3, min: 60, max: 110, from: -80, to: -5, ref: "Utilities" },
  ];

  const flagged: { type: string; ref: string; flag: Flag }[] = [];

  const ruleEntries = seededShuffle([...body.rules, ...noiseRules], `${key}:rules`).map((rule, position) => {
    const id = `R${position + 1}`;
    if (rule.flag) flagged.push({ type: "transaction", ref: id, flag: rule.flag });
    return element("txRule", {
      id,
      accountId,
      counterpartyIds: rule.parties.map((party) => partyIds.get(party)).join(","),
      direction: rule.dir,
      rail: rule.rail,
      count: rule.n,
      minAmount: round(rule.min * scale),
      maxAmount: round(rule.max * scale),
      fromDay: rule.from,
      toDay: rule.to,
      reference: rule.ref,
    });
  });

  const onFile = body.docs.slice(0, 3);
  const onRequest = body.docs.slice(3);
  const minutes = seededShuffle([5, 5, 10], `${key}:minutes`);
  const docEntries = [...seededShuffle(onFile, `${key}:file`), ...seededShuffle(onRequest, `${key}:request`)].map((doc: DocSpec, position) => {
    const id = `D${position + 1}`;
    if (doc.flag) flagged.push({ type: "document", ref: id, flag: doc.flag });
    const later = level === "l2" && position >= 3;
    return element(
      "document",
      { id, kind: doc.kind, title: doc.title, availability: later ? "on_request" : "initial", requestMinutes: later ? minutes[position - 3] : undefined },
      doc.text,
    );
  });

  const positive = template.kind === "tp";
  const blockSpecs: { section: string; text: string; correct: boolean }[] =
    level === "l1"
      ? [
          { section: "escalation_note", text: body.reason, correct: positive },
          { section: "escalation_note", text: BAD_SUMMARY, correct: false },
          { section: "escalation_note", text: BAD_REASON_SECTOR, correct: false },
          { section: "escalation_note", text: BAD_REASON_PROOF, correct: false },
        ]
      : [
          { section: "activity_summary", text: body.summary, correct: positive },
          { section: "activity_summary", text: BAD_SUMMARY, correct: false },
          { section: "reason_for_suspicion", text: body.reason, correct: positive },
          { section: "reason_for_suspicion", text: BAD_REASON_SECTOR, correct: false },
          { section: "reason_for_suspicion", text: BAD_REASON_PROOF, correct: false },
          { section: "action_taken", text: `The case was referred to the ${profile.labels.nominatedShort} with the supporting documents. The customer has not been told about the referral.`, correct: positive },
          { section: "action_taken", text: TIP_OFF, correct: false },
          ...(uk ? [{ section: "daml_request", text: "A defence is requested so that the account can continue to operate normally.", correct: false }] : []),
        ];

  const correctBlocks: string[] = [];
  const blockEntries = seededShuffle(blockSpecs, `${key}:blocks`).map((block, position) => {
    const id = `B${position + 1}`;
    if (block.correct) correctBlocks.push(id);
    return element("block", { id, section: block.section }, block.text);
  });

  const customer = body.customer;
  const partyEntries = Object.entries(parties).map(([partyKey, party]) =>
    element("counterparty", {
      id: partyIds.get(partyKey),
      name: party.name,
      kind: party.kind,
      country: "foreign" in party && party.foreign ? HIGHER_RISK : home,
    }),
  );

  const scenario = [
    `<scenario id="${scenarioId}">`,
    element("customer", { id: customerId, type: customer.type, name: customer.name, country: home, riskRating: customer.risk, onboardedOn, occupation: customer.occupation, declaredAnnualIncome: round(customer.income * scale), currency }, customer.text),
    `<accounts>${element("account", { id: accountId, type: customer.type === "company" ? "business" : "current", currency, openedOn: onboardedOn })}</accounts>`,
    `<counterparties>${partyEntries.join("")}</counterparties>`,
    element("alert", { id: "A1", ruleName: body.alert[0], raisedOn, severity: "medium" }, body.alert[1]),
    level === "l2" ? element("priorWork", { author: "L1 analyst" }, "Alert checked against the profile. Escalated for full review of the account activity.") : "",
    `<transactionRules>${ruleEntries.join("")}</transactionRules>`,
    `<documents>${docEntries.join("")}</documents>`,
    `<reportBlocks>${blockEntries.join("")}</reportBlocks>`,
    "</scenario>",
  ].join("\n");

  const decision = positive ? (level === "l1" ? "escalate" : "refer_to_mlro") : "close";
  const routing = positive && level === "l2" ? (uk ? "mlro,nca_sar" : "mlro,national_fiu") : undefined;
  const answer = [
    `<answer${attrs({
      scenarioId,
      outcome: positive ? "true_positive" : "false_positive",
      decision,
      typology: positive ? template.pattern : undefined,
      archetype: positive ? undefined : template.pattern,
      routing,
      correctBlocks: correctBlocks.length > 0 ? correctBlocks.join(",") : undefined,
    })}>`,
    element("explanation", {}, body.explanation),
    ...flagged.map((item) => element("irregularity", { targetType: item.type, targetRef: item.ref, category: item.flag[0], note: item.flag[1] })),
    "</answer>",
  ].join("\n");

  return { scenario, answer };
}

/** Creates a complete training pack as XML, without using AI. */
export function generatePack(options: GenerateOptions): string {
  const { cases, truePositives, jurisdiction, level, difficulty, seed } = options;
  if (cases < 1 || cases > MAX_GENERATED_CASES) throw new Error(`Choose between 1 and ${MAX_GENERATED_CASES} alerts.`);
  if (truePositives < 0 || truePositives > cases) throw new Error("True positives must be between 0 and the number of alerts.");

  const pick = (kind: "tp" | "fp", count: number) => {
    const pool = seededShuffle(TEMPLATES.filter((item) => item.kind === kind), `${seed}:${kind}`);
    return Array.from({ length: count }, (_unused, index) => pool[index % pool.length] as Template);
  };

  const chosen = seededShuffle([...pick("tp", truePositives), ...pick("fp", cases - truePositives)], `${seed}:order`);
  const names = seededShuffle(FIRST_NAMES, `${seed}:names`);
  const asOf = profiles[jurisdiction].asOfDate;
  const built = chosen.map((template, index) => buildCase(template, options, index, `${names[index % names.length]} Sample`, asOf));
  const answers = seededShuffle(built.map((item) => item.answer), `${seed}:answers`);

  const place = jurisdiction === "uk" ? "UK" : "EU";
  const minutes = Math.max(5, Math.min(240, cases * (level === "l1" ? 3 : 15)));

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<trainingPack schemaVersion="1.0">',
    element("parameters", {
      title: `Practice queue (${place}, ${cases} ${cases === 1 ? "alert" : "alerts"})`,
      cases,
      truePositives,
      borderline: 0,
      jurisdiction,
      level,
      asOfDate: asOf,
      difficulty,
      seed,
      lang: "en-GB",
      sessionMinutes: minutes,
    }),
    `<scenarios>${built.map((item) => item.scenario).join("\n")}</scenarios>`,
    `<answerKey>${answers.join("\n")}</answerKey>`,
    "</trainingPack>",
    "",
  ].join("\n");
}
