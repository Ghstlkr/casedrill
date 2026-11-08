import {
  DECISIONS,
  FALSE_POSITIVE_ARCHETYPES,
  IRREGULARITY_CATEGORIES,
  JURISDICTIONS,
  LEVEL_RULES,
  LEVELS,
  RAILS,
  REPORT_SECTIONS,
  ROUTES,
  type TrainingPack,
  TYPOLOGIES,
} from "@casedrill/schema";
import { z } from "zod";
import euData from "../data/eu.json";
import levelsData from "../data/levels.json";
import optionsData from "../data/options.json";
import ukData from "../data/uk.json";

type Jurisdiction = (typeof JURISDICTIONS)[number];
type Level = (typeof LEVELS)[number];

const text = z.string().trim().min(1);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Content of the "i" button: what it is, when to use it and the common mistake. */
const info = z.strictObject({ what: text, when: text, mistake: text });

export const TABS = [
  "overview",
  "transactions",
  "documents",
  "network",
  "prior_work",
  "processing",
  "routing",
  "report",
] as const;

const profileSchema = z.strictObject({
  id: z.enum(JURISDICTIONS),
  name: text,
  profileVersion: text,
  asOfDate: isoDate,
  status: z.enum(["in_force", "prospective"]),
  notice: text,
  labels: z.strictObject({
    report: text,
    reportLong: text,
    fiu: text,
    fiuShort: text,
    nominated: text,
    nominatedShort: text,
  }),
  currencies: z.array(z.enum(["GBP", "EUR"])).min(1),
  rails: z.array(z.strictObject({ id: z.enum(RAILS), label: text })).min(1),
  routes: z
    .array(
      z.strictObject({
        id: z.enum(ROUTES),
        label: text,
        levels: z.array(z.enum(LEVELS)).min(1),
        info,
        /** Shown only in the results, so it can explain a trap without spoiling it. */
        debrief: text.optional(),
      }),
    )
    .min(1),
  reportForm: z.strictObject({
    autoFields: z.array(text).min(1),
    sections: z.array(z.strictObject({ id: z.enum(REPORT_SECTIONS), label: text, help: text })).min(1),
  }),
  glossaryCodes: z.array(z.strictObject({ code: text, label: text })),
  daml: z
    .strictObject({
      noticeWorkingDays: z.number().int().positive(),
      moratoriumDays: z.number().int().positive(),
      accountThresholdGbp: z.number().positive(),
    })
    .nullable(),
  legalReferences: z.array(z.strictObject({ topic: text, reference: text })).min(1),
  sources: z.array(z.strictObject({ title: text, url: z.string().url() })).min(1),
});

const weight = z.number().int().min(0).max(100);

const levelSchema = z.strictObject({
  id: z.enum(LEVELS),
  name: text,
  released: z.boolean(),
  info,
  tabs: z.array(z.enum(TABS)).min(1),
  canRequestDocuments: z.boolean(),
  decisions: z.array(z.strictObject({ id: z.enum(DECISIONS), label: text, info })).length(2),
  weights: z
    .strictObject({
      decision: weight,
      evidence: weight,
      routing: weight,
      report: weight,
      priorWork: weight,
      typology: weight,
      time: weight,
    })
    .refine((value) => Object.values(value).reduce((sum, item) => sum + item, 0) === 100, "Weights must total 100"),
});

const labelled = <T extends readonly [string, ...string[]]>(ids: T) =>
  z.array(z.strictObject({ id: z.enum(ids), label: text, info })).length(ids.length);

const optionsSchema = z.strictObject({
  categories: labelled(IRREGULARITY_CATEGORIES),
  typologies: labelled(TYPOLOGIES),
  archetypes: labelled(FALSE_POSITIVE_ARCHETYPES),
  actions: z.strictObject({ requestDocument: info }),
});

/** Labels and "i" text for the choices that are the same in every jurisdiction. */
export const options = optionsSchema.parse(optionsData);

export type JurisdictionProfile = z.infer<typeof profileSchema>;
export type LevelConfig = z.infer<typeof levelSchema>;

export const profiles: Record<Jurisdiction, JurisdictionProfile> = {
  uk: profileSchema.parse(ukData),
  eu: profileSchema.parse(euData),
};

const levels = z.array(levelSchema).length(LEVELS.length).parse(levelsData);

/** Replaces {report}, {fiu}, {nominated}, {fiuShort} and {nominatedShort} in every string. */
function applyLabels<T>(value: T, labels: JurisdictionProfile["labels"]): T {
  if (typeof value === "string") {
    return value.replace(/\{(\w+)\}/g, (match, key: string) =>
      key in labels ? labels[key as keyof typeof labels] : match,
    ) as T;
  }
  if (Array.isArray(value)) return value.map((item) => applyLabels(item, labels)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, applyLabels(item, labels)]),
    ) as T;
  }
  return value;
}

/** The level's screens, decisions and weights, worded for one jurisdiction. */
export function getLevelConfig(level: Level, jurisdiction: Jurisdiction): LevelConfig {
  const config = levels.find((item) => item.id === level);
  if (!config) throw new Error(`Unknown level: ${level}`);
  return applyLabels(config, profiles[jurisdiction].labels);
}

export function getRoutes(level: Level, jurisdiction: Jurisdiction) {
  return LEVEL_RULES[level].allowsRouting
    ? profiles[jurisdiction].routes.filter((route) => route.levels.includes(level))
    : [];
}

export function getReportSections(level: Level, jurisdiction: Jurisdiction) {
  const allowed: readonly string[] = LEVEL_RULES[level].sections;
  return profiles[jurisdiction].reportForm.sections.filter((section) => allowed.includes(section.id));
}

/** Checks a pack that already passed packSchema against what this version of the app offers. */
export function checkPackSupport(pack: TrainingPack): string[] {
  const { jurisdiction, level } = pack.parameters;
  const problems: string[] = [];

  const config = getLevelConfig(level, jurisdiction);
  if (!config.released) {
    problems.push(`This version of CaseDrill does not support ${level.toUpperCase()} packs yet.`);
  }

  const profile = profiles[jurisdiction];
  const scenarios = pack.scenarios.scenario;
  const usedRails = new Set(scenarios.flatMap((item) => item.transactionRules.txRule.map((rule) => rule.rail)));
  for (const rail of usedRails) {
    if (!profile.rails.some((item) => item.id === rail)) {
      problems.push(`The ${rail} payment method is not available in the ${profile.name} profile.`);
    }
  }

  if (!config.canRequestDocuments) {
    const hidden = scenarios.flatMap((item) => item.documents.document).filter((doc) => doc.availability === "on_request");
    if (hidden.length > 0) {
      problems.push(`${level.toUpperCase()} analysts cannot request documents. Set availability="initial" on every document.`);
    }
  }

  const routes = getRoutes(level, jurisdiction).map((route) => route.id);
  for (const answer of pack.answerKey?.answer ?? []) {
    for (const route of answer.routing) {
      if (!routes.includes(route)) {
        problems.push(`Scenario ${answer.scenarioId}: the route ${route} is not offered at ${level.toUpperCase()}.`);
      }
    }
  }

  return problems;
}
