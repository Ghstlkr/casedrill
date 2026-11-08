import { getLevelConfig, profiles } from "@casedrill/profiles";
import { useStore } from "../store";

/** The open case. Tabs render only while a case is open, so these values always exist. */
export function useCase() {
  const view = useStore((state) => state.view)!;
  const caseId = useStore((state) => state.activeCaseId)!;
  const work = useStore((state) => state.shift!.cases[caseId])!;
  const transactions = useStore((state) => state.transactions[caseId]) ?? [];
  const scenario = view.scenarios.scenario.find((item) => item.id === caseId)!;
  const { level, jurisdiction } = view.parameters;

  return {
    caseId,
    scenario,
    work,
    transactions,
    level,
    jurisdiction,
    config: getLevelConfig(level, jurisdiction),
    profile: profiles[jurisdiction],
  };
}
