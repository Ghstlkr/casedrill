import type { DECISIONS, LEVELS, REPORT_SECTIONS } from "./enums";

type Decision = (typeof DECISIONS)[number];
type Section = (typeof REPORT_SECTIONS)[number];

type LevelRule = {
  /** Correct decision for a true positive at this level. */
  positive: Decision;
  /** Correct decision for a false positive at this level. */
  negative: Decision;
  allowsRouting: boolean;
  sections: readonly Section[];
  priorWork: "forbidden" | "optional" | "required";
};

const FULL_REPORT = ["activity_summary", "reason_for_suspicion", "action_taken", "daml_request"] as const;

/** What makes an answer correct at each level. Screens and scoring live in @casedrill/profiles. */
export const LEVEL_RULES: Record<(typeof LEVELS)[number], LevelRule> = {
  l1: {
    positive: "escalate",
    negative: "close",
    allowsRouting: false,
    sections: ["escalation_note"],
    priorWork: "forbidden",
  },
  l2: {
    positive: "refer_to_mlro",
    negative: "close",
    allowsRouting: true,
    sections: FULL_REPORT,
    priorWork: "optional",
  },
  l3: {
    positive: "file_report",
    negative: "no_report",
    allowsRouting: true,
    sections: FULL_REPORT,
    priorWork: "required",
  },
};
