import { getLevelConfig, options, profiles } from "@casedrill/profiles";
import { type Answer, type AnswerKey, LEVEL_RULES, type Scenario, type TrainingPack } from "@casedrill/schema";

export const PASS_MARK = 70;
const CRITICAL_CAP = 40;
const BORDERLINE_ALTERNATIVE_CREDIT = 0.6;
const WRONG_CATEGORY_CREDIT = 0.5;
const EXTRA_FLAG_PENALTY = 0.1;
const FLAG_ON_CLEAN_CASE_PENALTY = 0.25;
/** The time score reaches zero after this share of the shift has been exceeded. */
const OVERTIME_ALLOWANCE = 0.5;

export type WorkMark = { key: string; targetType: string; targetRef: string; label: string; category: string };

export type CaseInput = {
  decision: string | null;
  pattern: string | null;
  routing: string[];
  marks: WorkMark[];
  requestedDocs: string[];
  timeSpentMs: number;
  report: { blocks: Record<string, string | null>; freeText: string };
};

export type ComponentKey = "decision" | "evidence" | "routing" | "report" | "typology" | "time";
export type CriticalError = "missed_true_positive" | "tipping_off";

export type CaseResult = {
  scenarioId: string;
  customerName: string;
  outcome: Answer["outcome"];
  chosenDecision: string | null;
  expectedDecision: string;
  decisionCredit: number;
  score: number;
  critical: CriticalError[];
  components: { key: ComponentKey; weight: number; earned: number }[];
  found: { label: string; note: string; categoryCorrect: boolean }[];
  missed: string[];
  extraFlags: string[];
  routing: { expected: string[]; chosen: string[]; debriefs: string[] };
  report: { section: string; chosen: string | null; expected: string | null; correct: boolean }[];
  patternChosen: string | null;
  patternExpected: string | null;
  explanation: string;
  freeText: string;
  timeSpentMs: number;
};

export type ShiftResults = {
  score: number;
  passed: boolean;
  passMark: number;
  criticalCount: number;
  counts: {
    detected: number;
    missed: number;
    reportedFalsePositives: number;
    closedFalsePositives: number;
    borderline: number;
    undecided: number;
  };
  /** Share of true positives detected. Null when the pack has none. */
  recall: number | null;
  /** Share of positive decisions that were true positives. Null when there were none. */
  precision: number | null;
  byPattern: { id: string; label: string; total: number; correct: number }[];
  cases: CaseResult[];
  usedMs: number;
  allowedMs: number;
};

type Params = Pick<TrainingPack, "parameters"> & {
  scenarios: Scenario[];
  answerKey: AnswerKey;
  work: Record<string, CaseInput>;
  usedMs: number;
};

const patternLabel = (id: string | null | undefined) =>
  [...options.typologies, ...options.archetypes].find((item) => item.id === id)?.label ?? null;

const sameSets = (a: string[], b: string[]) => {
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 1;
  return a.filter((item) => b.includes(item)).length / union.size;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function scoreEvidence(work: CaseInput, answer: Answer) {
  const found: CaseResult["found"] = [];
  const missed: string[] = [];

  let credit = 0;
  for (const item of answer.irregularity) {
    const matches = work.marks.filter((mark) => mark.targetType === item.targetType && mark.targetRef === item.targetRef);
    const first = matches[0];
    if (!first) {
      missed.push(item.note);
      continue;
    }
    const categoryCorrect = matches.some((mark) => mark.category === item.category);
    credit += categoryCorrect ? 1 : WRONG_CATEGORY_CREDIT;
    found.push({ label: first.label, note: item.note, categoryCorrect });
  }

  const extra = work.marks.filter(
    (mark) => !answer.irregularity.some((item) => item.targetType === mark.targetType && item.targetRef === mark.targetRef),
  );
  const extraFlags = extra.map((mark) => mark.label);

  const earned =
    answer.irregularity.length === 0
      ? clamp(1 - extra.length * FLAG_ON_CLEAN_CASE_PENALTY)
      : clamp(credit / answer.irregularity.length - extra.length * EXTRA_FLAG_PENALTY);

  return { earned, found, missed, extraFlags };
}

function compareReport(work: CaseInput, answer: Answer, scenario: Scenario) {
  const blocks = scenario.reportBlocks.block;
  const sections = [...new Set(blocks.map((block) => block.section))];
  const text = (id: string | null | undefined) => blocks.find((block) => block.id === id)?.text ?? null;

  return sections.map((section) => {
    const expected = blocks.find((block) => block.section === section && answer.correctBlocks.includes(block.id));
    const chosen = work.report.blocks[section] ?? null;
    return { section, chosen: text(chosen), expected: expected?.text ?? null, correct: chosen === (expected?.id ?? null) };
  });
}

function scoreCase(params: Params, scenario: Scenario, answer: Answer, work: CaseInput, timeScore: number): CaseResult {
  const { level, jurisdiction } = params.parameters;
  const rules = LEVEL_RULES[level];
  const { weights } = getLevelConfig(level, jurisdiction);
  const profile = profiles[jurisdiction];
  const decided = work.decision !== null;

  const accepted = (answer.acceptable as string[] | undefined)?.includes(work.decision ?? "") ?? false;
  const decisionCredit = work.decision === answer.decision ? 1 : accepted ? BORDERLINE_ALTERNATIVE_CREDIT : 0;

  const evidence = scoreEvidence(work, answer);
  const report = compareReport(work, answer, scenario);
  const expectedPattern = answer.typology ?? answer.archetype ?? null;
  const patternRight =
    work.pattern !== null && (work.pattern === answer.typology || work.pattern === answer.archetype);
  const reportApplies = answer.decision === rules.positive;

  const components: CaseResult["components"] = [
    { key: "decision", weight: weights.decision, earned: decisionCredit },
    { key: "evidence", weight: weights.evidence, earned: evidence.earned },
    { key: "typology", weight: weights.typology, earned: patternRight ? 1 : 0 },
    { key: "time", weight: weights.time, earned: timeScore },
  ];
  if (rules.allowsRouting) {
    components.push({ key: "routing", weight: weights.routing, earned: sameSets(answer.routing, work.routing) });
  }
  if (reportApplies) {
    const right = report.filter((item) => item.correct).length;
    components.push({ key: "report", weight: weights.report, earned: report.length > 0 ? right / report.length : 0 });
  }

  const critical: CriticalError[] = [];
  if (answer.outcome === "true_positive" && work.decision !== rules.positive) critical.push("missed_true_positive");
  if (work.routing.includes("customer_notification")) critical.push("tipping_off");

  const available = components.reduce((sum, item) => sum + item.weight, 0);
  const earned = components.reduce((sum, item) => sum + item.weight * item.earned, 0);
  let score = decided && available > 0 ? Math.round((earned / available) * 100) : 0;
  if (critical.length > 0) score = Math.min(score, CRITICAL_CAP);

  const debriefs = profile.routes
    .filter((route) => route.debrief && work.routing.includes(route.id))
    .map((route) => route.debrief as string);

  return {
    scenarioId: scenario.id,
    customerName: scenario.customer.name,
    outcome: answer.outcome,
    chosenDecision: work.decision,
    expectedDecision: answer.decision,
    decisionCredit,
    score,
    critical,
    components: decided ? components : components.map((item) => ({ ...item, earned: 0 })),
    found: evidence.found,
    missed: evidence.missed,
    extraFlags: evidence.extraFlags,
    routing: { expected: answer.routing, chosen: work.routing, debriefs },
    report: reportApplies ? report : [],
    patternChosen: patternLabel(work.pattern),
    patternExpected: patternLabel(expectedPattern),
    explanation: answer.explanation,
    freeText: work.report.freeText,
    timeSpentMs: work.timeSpentMs,
  };
}

/** Pure scoring: the same pack and work always produce the same results. */
export function scoreShift(params: Params): ShiftResults {
  const { level, sessionMinutes } = params.parameters;
  const { positive } = LEVEL_RULES[level];
  const allowedMs = sessionMinutes * 60_000;
  const overtime = Math.max(0, params.usedMs - allowedMs);
  const timeScore = clamp(1 - overtime / (allowedMs * OVERTIME_ALLOWANCE));

  const cases = params.scenarios.map((scenario) => {
    const answer = params.answerKey.answer.find((item) => item.scenarioId === scenario.id) as Answer;
    return scoreCase(params, scenario, answer, params.work[scenario.id] as CaseInput, timeScore);
  });

  const count = (test: (item: CaseResult) => boolean) => cases.filter(test).length;
  const isPositive = (item: CaseResult) => item.chosenDecision === positive;
  const detected = count((item) => item.outcome === "true_positive" && isPositive(item));
  const missed = count((item) => item.outcome === "true_positive" && !isPositive(item));
  const reportedFalsePositives = count((item) => item.outcome === "false_positive" && isPositive(item));
  const closedFalsePositives = count((item) => item.outcome === "false_positive" && item.chosenDecision !== null && !isPositive(item));

  const byPattern = new Map<string, { id: string; label: string; total: number; correct: number }>();
  for (const answer of params.answerKey.answer) {
    const id = answer.typology ?? answer.archetype;
    const result = cases.find((item) => item.scenarioId === answer.scenarioId);
    if (!id || !result) continue;
    const entry = byPattern.get(id) ?? { id, label: patternLabel(id) ?? id, total: 0, correct: 0 };
    entry.total += 1;
    if (result.decisionCredit === 1) entry.correct += 1;
    byPattern.set(id, entry);
  }

  const score = Math.round(cases.reduce((sum, item) => sum + item.score, 0) / cases.length);
  const criticalCount = cases.reduce((sum, item) => sum + item.critical.length, 0);

  return {
    score,
    passed: score >= PASS_MARK && criticalCount === 0,
    passMark: PASS_MARK,
    criticalCount,
    counts: {
      detected,
      missed,
      reportedFalsePositives,
      closedFalsePositives,
      borderline: count((item) => item.outcome === "borderline"),
      undecided: count((item) => item.chosenDecision === null),
    },
    recall: detected + missed > 0 ? detected / (detected + missed) : null,
    precision: detected + reportedFalsePositives > 0 ? detected / (detected + reportedFalsePositives) : null,
    byPattern: [...byPattern.values()],
    cases,
    usedMs: params.usedMs,
    allowedMs,
  };
}
