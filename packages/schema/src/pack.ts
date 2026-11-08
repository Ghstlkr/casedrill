import { z } from "zod";
import * as E from "./enums";
import { LEVEL_RULES } from "./levels";

export const LIMITS = {
  maxCases: 50,
  recommendedCases: 20,
  maxTransactionsPerRule: 200,
  maxTransactionsPerPack: 5000,
} as const;

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const amount = z.coerce.number().positive().max(1_000_000_000);
const text = z.string().trim().min(1);

const localId = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_-]{0,31}$/, "Use letters, digits, - or _, starting with a letter");

const fictId = z
  .string()
  .regex(/^FICT-[A-Z0-9]+(-[A-Z0-9]+)*$/, "Identifiers must look fictional, e.g. FICT-CUST-0001");

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Not a real calendar date");

/** XML attributes hold lists as comma-separated values: routing="mlro,nca_sar". */
const commaList = z.string().transform((value) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);

const enumList = <T extends readonly [string, ...string[]]>(values: T) =>
  commaList.pipe(z.array(z.enum(values)));

const parameters = z.strictObject({
  title: text,
  cases: int(1, LIMITS.maxCases),
  truePositives: int(0, LIMITS.maxCases).optional(),
  borderline: int(0, LIMITS.maxCases).optional(),
  /** Percentage range shown instead of exact counts, e.g. "10-30". Password-sealed packs only. */
  truePositiveRange: z.string().regex(/^\d{1,3}-\d{1,3}$/, "Use a percentage range such as 10-30").optional(),
  jurisdiction: z.enum(E.JURISDICTIONS),
  level: z.enum(E.LEVELS),
  asOfDate: isoDate,
  difficulty: z.enum(E.DIFFICULTIES),
  seed: int(0, 2_147_483_647),
  lang: z.literal("en-GB"),
  sessionMinutes: int(5, 240),
});

const customer = z.strictObject({
  id: fictId,
  type: z.enum(E.CUSTOMER_TYPES),
  name: text,
  country: text,
  riskRating: z.enum(E.RISK_RATINGS),
  onboardedOn: isoDate,
  occupation: text,
  declaredAnnualIncome: amount,
  currency: z.enum(E.CURRENCIES),
  text,
});

const account = z.strictObject({
  id: fictId,
  type: z.enum(E.ACCOUNT_TYPES),
  currency: z.enum(E.CURRENCIES),
  openedOn: isoDate,
});

const counterparty = z.strictObject({
  id: fictId,
  name: text,
  kind: z.enum(E.COUNTERPARTY_KINDS),
  country: text,
});

const alert = z.strictObject({
  id: localId,
  ruleName: text,
  raisedOn: isoDate,
  severity: z.enum(E.SEVERITIES),
  text,
});

/** Expanded into transactions by the app. Day 0 is the alert date; earlier days are negative. */
const txRule = z.strictObject({
  id: localId,
  accountId: fictId,
  counterpartyIds: commaList.pipe(z.array(fictId).min(1)),
  direction: z.enum(E.DIRECTIONS),
  rail: z.enum(E.RAILS),
  count: int(1, LIMITS.maxTransactionsPerRule),
  minAmount: amount,
  maxAmount: amount,
  fromDay: int(-730, 0),
  toDay: int(-730, 0),
  reference: text.optional(),
});

const document = z.strictObject({
  id: localId,
  kind: z.enum(E.DOCUMENT_KINDS),
  title: text,
  availability: z.enum(E.DOCUMENT_AVAILABILITY),
  requestMinutes: int(1, 120).optional(),
  text,
});

const reportBlock = z.strictObject({
  id: localId,
  section: z.enum(E.REPORT_SECTIONS),
  text,
});

/** Everything a trainee can see. Strict: an answer field placed here is rejected. */
const scenario = z.strictObject({
  id: localId,
  customer,
  accounts: z.strictObject({ account: z.array(account).min(1) }),
  counterparties: z.strictObject({ counterparty: z.array(counterparty).min(1) }),
  alert,
  priorWork: z.strictObject({ author: text, text }).optional(),
  transactionRules: z.strictObject({ txRule: z.array(txRule).min(1) }),
  documents: z.strictObject({ document: z.array(document).min(1) }),
  reportBlocks: z.strictObject({ block: z.array(reportBlock).min(3) }),
});

const irregularity = z.strictObject({
  targetType: z.enum(E.IRREGULARITY_TARGETS),
  targetRef: text,
  category: z.enum(E.IRREGULARITY_CATEGORIES),
  note: text,
});

const answer = z.strictObject({
  scenarioId: localId,
  outcome: z.enum(E.OUTCOMES),
  decision: z.enum(E.DECISIONS),
  acceptable: enumList(E.DECISIONS).optional(),
  typology: z.enum(E.TYPOLOGIES).optional(),
  archetype: z.enum(E.FALSE_POSITIVE_ARCHETYPES).optional(),
  routing: enumList(E.ROUTES).default(""),
  correctBlocks: commaList.pipe(z.array(localId)).default(""),
  explanation: text,
  irregularity: z.array(irregularity).default([]),
  priorWorkError: z.array(z.strictObject({ note: text })).default([]),
});

const answerKey = z.strictObject({ answer: z.array(answer).min(1) });

const sealedAnswerKey = z.strictObject({
  alg: z.literal("AES-256-GCM"),
  keySource: z.enum(E.SEAL_KEY_SOURCES),
  salt: text,
  iv: text,
  text,
});

const duplicates = (values: string[]) =>
  [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];

type RawPack = {
  parameters: z.infer<typeof parameters>;
  scenarios: { scenario: z.infer<typeof scenario>[] };
  answerKey?: z.infer<typeof answerKey>;
  sealedAnswerKey?: z.infer<typeof sealedAnswerKey>;
};

function checkScenario(
  item: z.infer<typeof scenario>,
  params: z.infer<typeof parameters>,
  path: (string | number)[],
  fail: (path: (string | number)[], message: string) => void,
) {
  const rule = LEVEL_RULES[params.level];
  if (rule.priorWork === "forbidden" && item.priorWork) {
    fail([...path, "priorWork"], `priorWork is not allowed in ${params.level.toUpperCase()} packs`);
  }
  if (rule.priorWork === "required" && !item.priorWork) {
    fail([...path, "priorWork"], `priorWork is required in ${params.level.toUpperCase()} packs`);
  }
  item.reportBlocks.block.forEach((block, index) => {
    const blockPath = [...path, "reportBlocks", "block", index, "section"];
    if (!rule.sections.includes(block.section)) {
      fail(blockPath, `Section ${block.section} is not used in ${params.level.toUpperCase()} packs`);
    }
    if (block.section === "daml_request" && params.jurisdiction !== "uk") {
      fail(blockPath, "daml_request is UK only");
    }
  });

  const accounts = item.accounts.account.map((entry) => entry.id);
  const counterparties = item.counterparties.counterparty.map((entry) => entry.id);
  const rules = item.transactionRules.txRule;
  const documents = item.documents.document;

  const groups: [string, string[]][] = [
    ["account", accounts],
    ["counterparty", counterparties],
    ["txRule", rules.map((rule) => rule.id)],
    ["document", documents.map((entry) => entry.id)],
    ["block", item.reportBlocks.block.map((block) => block.id)],
  ];
  for (const [label, ids] of groups) {
    for (const id of duplicates(ids)) fail(path, `Duplicate ${label} id: ${id}`);
  }

  rules.forEach((rule, index) => {
    const rulePath = [...path, "transactionRules", "txRule", index];
    if (!accounts.includes(rule.accountId)) {
      fail([...rulePath, "accountId"], `Unknown account: ${rule.accountId}`);
    }
    for (const id of rule.counterpartyIds) {
      if (!counterparties.includes(id)) fail([...rulePath, "counterpartyIds"], `Unknown counterparty: ${id}`);
    }
    if (rule.minAmount > rule.maxAmount) fail(rulePath, "minAmount cannot exceed maxAmount");
    if (rule.fromDay > rule.toDay) fail(rulePath, "fromDay cannot be later than toDay");
  });

  documents.forEach((entry, index) => {
    const onRequest = entry.availability === "on_request";
    if (onRequest !== (entry.requestMinutes !== undefined)) {
      fail(
        [...path, "documents", "document", index, "requestMinutes"],
        "requestMinutes is required for on_request documents and not allowed otherwise",
      );
    }
  });
}

function checkAnswer(
  item: z.infer<typeof answer>,
  target: z.infer<typeof scenario>,
  { jurisdiction, level }: z.infer<typeof parameters>,
  path: (string | number)[],
  fail: (path: (string | number)[], message: string) => void,
) {
  const has = (list: readonly string[], value: string) => list.includes(value);
  const { positive, negative, allowsRouting } = LEVEL_RULES[level];
  const label = level.toUpperCase();
  const allowed = (decision: string) => decision === positive || decision === negative;

  if (!allowed(item.decision)) fail(path, `${label} packs only allow ${negative} or ${positive}`);

  if (item.outcome === "true_positive") {
    if (!item.typology) fail(path, "A true positive needs a typology");
    if (item.decision !== positive) fail(path, `At ${label}, a true positive must be ${positive}`);
    if (item.irregularity.length === 0) fail(path, "A true positive needs at least one irregularity");
  }
  if (item.outcome === "false_positive") {
    if (!item.archetype) fail(path, "A false positive needs an archetype");
    if (item.decision !== negative) fail(path, `At ${label}, a false positive must be ${negative}`);
    if (item.irregularity.length > 0) fail(path, "A false positive cannot list irregularities");
  }
  if (item.outcome === "borderline") {
    if (!item.typology && !item.archetype) fail(path, "A borderline case needs a typology or an archetype");
    if (!item.acceptable || item.acceptable.length < 2 || !item.acceptable.includes(item.decision)) {
      fail(path, "A borderline case needs at least two acceptable decisions, including the best one");
    }
    for (const decision of item.acceptable ?? []) {
      if (!allowed(decision)) fail(path, `${decision} is not available in ${label} packs`);
    }
  } else if (item.acceptable) {
    fail(path, "acceptable is only allowed on borderline cases");
  }

  if (item.decision === negative) {
    if (item.routing.length > 0) fail(path, `A case decided as ${negative} cannot have routing`);
    if (item.correctBlocks.length > 0) fail(path, `A case decided as ${negative} cannot have correct report blocks`);
  }
  if (item.decision === positive && item.correctBlocks.length === 0) {
    fail(path, `A case decided as ${positive} needs correct report blocks`);
  }
  if (!allowsRouting && item.routing.length > 0) fail(path, `${label} packs cannot have routing`);
  if (level === "l2" && item.decision === positive && !item.routing.includes("mlro")) {
    fail(path, "A referral must route to the MLRO");
  }
  if (level === "l3" && item.decision === positive && !item.routing.some((route) => has(E.EXTERNAL_REPORT_ROUTES, route))) {
    fail(path, "A filed report needs an external reporting route");
  }
  if (level !== "l3" && item.priorWorkError.length > 0) {
    fail(path, "priorWorkError is only allowed in L3 packs");
  }

  for (const route of item.routing) {
    if (has(E.NEVER_CORRECT_ROUTES, route)) fail(path, `${route} can never be a correct route`);
    if (jurisdiction === "eu" && has(E.UK_ONLY_ROUTES, route)) fail(path, `${route} is UK only`);
    if (jurisdiction === "uk" && has(E.EU_ONLY_ROUTES, route)) fail(path, `${route} is EU only`);
  }

  const blocks = target.reportBlocks.block;
  for (const id of item.correctBlocks) {
    if (!blocks.some((block) => block.id === id)) fail(path, `Unknown report block: ${id}`);
  }
  const correctSections = item.correctBlocks.flatMap((id) => blocks.filter((block) => block.id === id).map((block) => block.section));
  for (const section of duplicates(correctSections)) fail(path, `Only one report block can be correct in section ${section}`);
  if (item.correctBlocks.length >= blocks.length && blocks.length > 0) {
    fail(path, "Report blocks need at least one distractor");
  }

  item.irregularity.forEach((entry, index) => {
    const validTargets: Record<(typeof E.IRREGULARITY_TARGETS)[number], string[]> = {
      transaction: target.transactionRules.txRule.map((rule) => rule.id),
      document: target.documents.document.map((doc) => doc.id),
      customer: [target.customer.id],
      network: target.counterparties.counterparty.map((party) => party.id),
    };
    if (!validTargets[entry.targetType].includes(entry.targetRef)) {
      fail([...path, "irregularity", index, "targetRef"], `Unknown ${entry.targetType}: ${entry.targetRef}`);
    }
  });
}

function checkPack(pack: RawPack, ctx: z.RefinementCtx) {
  const fail = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: "custom", path, message });

  const { parameters: params } = pack;
  const scenarios = pack.scenarios.scenario;

  if (params.cases !== scenarios.length) {
    fail(["parameters", "cases"], `cases is ${params.cases}, but the file has ${scenarios.length} scenarios`);
  }
  checkDisclosure(pack, fail);
  if ((params.truePositives ?? 0) + (params.borderline ?? 0) > params.cases) {
    fail(["parameters"], "truePositives + borderline cannot exceed cases");
  }
  for (const id of duplicates(scenarios.map((item) => item.id))) {
    fail(["scenarios"], `Duplicate scenario id: ${id}`);
  }

  const total = scenarios
    .flatMap((item) => item.transactionRules.txRule)
    .reduce((sum, rule) => sum + rule.count, 0);
  if (total > LIMITS.maxTransactionsPerPack) {
    fail(["scenarios"], `The pack would create ${total} transactions; the limit is ${LIMITS.maxTransactionsPerPack}`);
  }

  scenarios.forEach((item, index) => checkScenario(item, params, ["scenarios", "scenario", index], fail));

  if (Boolean(pack.answerKey) === Boolean(pack.sealedAnswerKey)) {
    fail([], "A pack needs exactly one of answerKey or sealedAnswerKey");
  }
  if (pack.answerKey) checkAnswers(pack.answerKey.answer, scenarios, params, fail);
}

type Fail = (path: (string | number)[], message: string) => void;

export function parseRange(range: string): { min: number; max: number } {
  const [min, max] = range.split("-").map(Number);
  return { min: min ?? 0, max: max ?? 0 };
}

function checkDisclosure(pack: RawPack, fail: Fail) {
  const { truePositives, borderline, truePositiveRange } = pack.parameters;

  if (truePositiveRange === undefined) {
    if (truePositives === undefined) fail(["parameters", "truePositives"], "Required");
    if (borderline === undefined) fail(["parameters", "borderline"], "Required");
    return;
  }

  const path = ["parameters", "truePositiveRange"];
  if (pack.sealedAnswerKey?.keySource !== "password") {
    fail(path, "A percentage range is only allowed in password-sealed packs");
  }
  if (truePositives !== undefined || borderline !== undefined) {
    fail(path, "A percentage range replaces truePositives and borderline");
  }
  const { min, max } = parseRange(truePositiveRange);
  if (min >= max || max > 100) fail(path, "The range must rise from a lower to a higher percentage, up to 100");
}

function checkAnswers(
  answers: z.infer<typeof answer>[],
  scenarios: z.infer<typeof scenario>[],
  params: z.infer<typeof parameters>,
  fail: Fail,
) {
  for (const id of duplicates(answers.map((item) => item.scenarioId))) {
    fail(["answerKey"], `Duplicate answer for scenario: ${id}`);
  }
  for (const item of scenarios) {
    if (!answers.some((entry) => entry.scenarioId === item.id)) {
      fail(["answerKey"], `Missing answer for scenario: ${item.id}`);
    }
  }

  const count = (outcome: (typeof E.OUTCOMES)[number]) =>
    answers.filter((item) => item.outcome === outcome).length;
  if (params.truePositiveRange !== undefined) {
    const { min, max } = parseRange(params.truePositiveRange);
    const share = (count("true_positive") / params.cases) * 100;
    if (share < min || share > max) fail(["parameters", "truePositiveRange"], "The true positive share is outside the range");
  } else if (count("true_positive") !== params.truePositives) {
    fail(
      ["parameters", "truePositives"],
      `truePositives is ${params.truePositives}, but the answer key has ${count("true_positive")}`,
    );
  }
  if (params.truePositiveRange === undefined && count("borderline") !== params.borderline) {
    fail(
      ["parameters", "borderline"],
      `borderline is ${params.borderline}, but the answer key has ${count("borderline")}`,
    );
  }

  answers.forEach((item, index) => {
    const target = scenarios.find((entry) => entry.id === item.scenarioId);
    const path = ["answerKey", "answer", index];
    if (!target) {
      fail([...path, "scenarioId"], `Unknown scenario: ${item.scenarioId}`);
      return;
    }
    checkAnswer(item, target, params, path, fail);
  });
}

export const packSchema = z
  .strictObject({
    schemaVersion: z.literal("1.0"),
    aiInstructions: z.string().optional(),
    parameters,
    scenarios: z.strictObject({ scenario: z.array(scenario).min(1).max(LIMITS.maxCases) }),
    answerKey: answerKey.optional(),
    sealedAnswerKey: sealedAnswerKey.optional(),
  })
  .superRefine(checkPack);

/** Validates a decrypted answer key against the visible part of its pack. */
export function parseAnswerKey(
  raw: unknown,
  pack: { parameters: z.infer<typeof parameters>; scenarios: { scenario: z.infer<typeof scenario>[] } },
): { ok: true; answerKey: z.infer<typeof answerKey> } | { ok: false; messages: string[] } {
  const parsed = answerKey.safeParse(raw);
  if (!parsed.success) return { ok: false, messages: parsed.error.issues.map((issue) => issue.message) };

  const messages: string[] = [];
  checkAnswers(parsed.data.answer, pack.scenarios.scenario, pack.parameters, (_path, message) => messages.push(message));
  return messages.length > 0 ? { ok: false, messages } : { ok: true, answerKey: parsed.data };
}

export type TrainingPack = z.infer<typeof packSchema>;
export type AnswerKey = z.infer<typeof answerKey>;
export type Scenario = z.infer<typeof scenario>;
export type Answer = z.infer<typeof answer>;
