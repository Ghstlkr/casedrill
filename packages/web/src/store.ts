import { expandScenario, type GeneratedTransaction } from "@casedrill/engine";
import { type ImportedPack, importPack, type PackSummary } from "@casedrill/importer";
import { scoreShift, type ShiftResults } from "@casedrill/scoring";
import { openAnswerKey, toTraineeView } from "@casedrill/seal";
import { del as idbDel, get as idbGet, set as idbSet } from "idb-keyval";
import { z } from "zod";
import { create } from "zustand";

export type TraineeView = ReturnType<typeof toTraineeView>;
export type TargetType = "transaction" | "document" | "customer" | "network";

const markSchema = z.object({
  key: z.string(),
  targetType: z.enum(["transaction", "document", "customer", "network"]),
  /** The id the answer key uses: a rule, document, customer or counterparty. */
  targetRef: z.string(),
  label: z.string(),
  category: z.string(),
});

const caseWorkSchema = z.object({
  opened: z.boolean(),
  decision: z.string().nullable(),
  pattern: z.string().nullable(),
  routing: z.array(z.string()),
  marks: z.array(markSchema),
  requestedDocs: z.array(z.string()),
  timeSpentMs: z.number().min(0),
  report: z.object({ blocks: z.record(z.string().nullable()), freeText: z.string() }),
});

const shiftSchema = z.object({
  elapsedMs: z.number().min(0),
  penaltyMs: z.number().min(0),
  paused: z.boolean(),
  cases: z.record(caseWorkSchema),
  events: z.array(z.object({ atMs: z.number(), caseId: z.string(), type: z.string(), detail: z.string().optional() })),
});

const shiftFileSchema = z.object({
  format: z.literal("casedrill-shift"),
  version: z.literal(1),
  xml: z.string(),
  shift: shiftSchema,
});

export type Mark = z.infer<typeof markSchema>;
export type CaseWork = z.infer<typeof caseWorkSchema>;
export type LogEvent = z.infer<typeof shiftSchema>["events"][number];
export type Shift = z.infer<typeof shiftSchema>;

type Saved = { xml: string; title: string; shift: Shift; results: ShiftResults | null };

export type Target = { key: string; targetType: TargetType; targetRef: string; label: string };

type State = {
  screen: "import" | "queue" | "case" | "results";
  xml: string | null;
  pack: ImportedPack | null;
  summary: PackSummary | null;
  /** Everything the training screens use. It never includes the answers. */
  view: TraineeView | null;
  transactions: Record<string, GeneratedTransaction[]>;
  shift: Shift | null;
  results: ShiftResults | null;
  activeCaseId: string | null;
  activeTab: string;
  saved: Saved | null;

  loadSaved: () => Promise<void>;
  startShift: (xml: string, pack: ImportedPack, summary: PackSummary) => void;
  resumeShift: () => void;
  leaveShift: () => void;
  openCase: (caseId: string) => void;
  showQueue: () => void;
  setTab: (tab: string) => void;
  tick: (ms: number) => void;
  togglePause: () => void;
  flag: (caseId: string, target: Target, category: string) => void;
  unflag: (caseId: string, key: string) => void;
  requestDocument: (caseId: string, documentId: string, minutes: number) => void;
  setDecision: (caseId: string, decision: string | null) => void;
  setPattern: (caseId: string, pattern: string | null) => void;
  toggleRoute: (caseId: string, route: string) => void;
  setReportBlock: (caseId: string, section: string, blockId: string | null) => void;
  setReportText: (caseId: string, text: string) => void;
  /** Opens the answers and scores the shift. Returns a message if the answers cannot be opened. */
  endShift: (password?: string) => Promise<string | null>;
  buildShiftFile: () => string;
  /** Returns a message if the file cannot be used. */
  importShiftFile: (text: string) => string | null;
};

const SAVE_KEY = "casedrill-shift";

/** Browser storage can be missing or blocked. Training still works, without saved progress. */
function safely(action: () => Promise<unknown>) {
  try {
    action().catch(() => undefined);
  } catch {
    // Nothing to do: the shift continues in memory.
  }
}

const emptyCase = (): CaseWork => ({
  opened: false,
  decision: null,
  pattern: null,
  routing: [],
  marks: [],
  requestedDocs: [],
  timeSpentMs: 0,
  report: { blocks: {}, freeText: "" },
});

function expandAll(view: TraineeView) {
  return Object.fromEntries(
    view.scenarios.scenario.map((scenario) => [scenario.id, expandScenario(scenario, view.parameters.seed)]),
  );
}

const CLEARED = {
  screen: "import",
  xml: null,
  pack: null,
  summary: null,
  view: null,
  transactions: {},
  shift: null,
  results: null,
  activeCaseId: null,
  saved: null,
} as const;

export const useStore = create<State>((set, get) => {
  /** Applies a change to one case and records what the analyst did. */
  const updateCase = (caseId: string, change: (work: CaseWork) => CaseWork, event?: Omit<LogEvent, "atMs" | "caseId">) => {
    const { shift } = get();
    const work = shift?.cases[caseId];
    if (!shift || !work) return;
    set({
      shift: {
        ...shift,
        cases: { ...shift.cases, [caseId]: change(work) },
        events: event ? [...shift.events, { atMs: shift.elapsedMs + shift.penaltyMs, caseId, ...event }] : shift.events,
      },
    });
  };

  const activate = (xml: string, pack: ImportedPack, summary: PackSummary, shift: Shift, results: ShiftResults | null = null) => {
    const view = toTraineeView(pack);
    set({
      screen: results ? "results" : "queue",
      xml,
      pack,
      summary,
      view,
      transactions: expandAll(view),
      shift,
      results,
      activeCaseId: null,
      saved: null,
    });
  };

  return {
    ...CLEARED,
    activeTab: "overview",

    loadSaved: async () => {
      try {
        const saved = await idbGet<Saved>(SAVE_KEY);
        if (saved) set({ saved });
      } catch {
        // Browser storage can be unavailable. The app still works without a saved shift.
      }
    },

    startShift: (xml, pack, summary) => {
      const cases = Object.fromEntries(pack.scenarios.scenario.map((scenario) => [scenario.id, emptyCase()]));
      activate(xml, pack, summary, { elapsedMs: 0, penaltyMs: 0, paused: false, cases, events: [] });
    },

    resumeShift: () => {
      const { saved } = get();
      if (!saved) return;
      const imported = importPack(saved.xml);
      if (imported.ok) {
        activate(saved.xml, imported.pack, imported.summary, { ...saved.shift, paused: !saved.results }, saved.results);
      }
    },

    leaveShift: () => {
      safely(() => idbDel(SAVE_KEY));
      set(CLEARED);
    },

    openCase: (caseId) => {
      const work = get().shift?.cases[caseId];
      updateCase(caseId, (item) => ({ ...item, opened: true }), work?.opened ? undefined : { type: "case_opened" });
      set({ screen: "case", activeCaseId: caseId, activeTab: "overview" });
    },

    showQueue: () => set({ screen: "queue", activeCaseId: null }),
    setTab: (activeTab) => set({ activeTab }),

    tick: (ms) => {
      const { shift, activeCaseId, results } = get();
      if (!shift || shift.paused || results) return;
      const work = activeCaseId ? shift.cases[activeCaseId] : undefined;
      set({
        shift: {
          ...shift,
          elapsedMs: shift.elapsedMs + ms,
          cases:
            activeCaseId && work
              ? { ...shift.cases, [activeCaseId]: { ...work, timeSpentMs: work.timeSpentMs + ms } }
              : shift.cases,
        },
      });
    },

    togglePause: () => {
      const { shift } = get();
      if (shift) set({ shift: { ...shift, paused: !shift.paused } });
    },

    flag: (caseId, target, category) =>
      updateCase(
        caseId,
        (work) => ({
          ...work,
          marks: [...work.marks.filter((mark) => mark.key !== target.key), { ...target, category }],
        }),
        { type: "flag_added", detail: `${target.key}:${category}` },
      ),

    unflag: (caseId, key) =>
      updateCase(caseId, (work) => ({ ...work, marks: work.marks.filter((mark) => mark.key !== key) }), {
        type: "flag_removed",
        detail: key,
      }),

    requestDocument: (caseId, documentId, minutes) => {
      const { shift } = get();
      if (!shift || shift.cases[caseId]?.requestedDocs.includes(documentId)) return;
      set({ shift: { ...shift, penaltyMs: shift.penaltyMs + minutes * 60_000 } });
      updateCase(caseId, (work) => ({ ...work, requestedDocs: [...work.requestedDocs, documentId] }), {
        type: "document_requested",
        detail: documentId,
      });
    },

    setDecision: (caseId, decision) =>
      updateCase(caseId, (work) => ({ ...work, decision }), { type: "decision_set", detail: decision ?? "cleared" }),

    setPattern: (caseId, pattern) => updateCase(caseId, (work) => ({ ...work, pattern })),

    toggleRoute: (caseId, route) =>
      updateCase(caseId, (work) => ({
        ...work,
        routing: work.routing.includes(route) ? work.routing.filter((item) => item !== route) : [...work.routing, route],
      })),

    setReportBlock: (caseId, section, blockId) =>
      updateCase(caseId, (work) => ({
        ...work,
        report: { ...work.report, blocks: { ...work.report.blocks, [section]: blockId } },
      })),

    setReportText: (caseId, freeText) =>
      updateCase(caseId, (work) => ({ ...work, report: { ...work.report, freeText } })),

    endShift: async (password) => {
      const { pack, shift } = get();
      if (!pack || !shift) return "There is no shift to end.";
      const opened = await openAnswerKey(pack, { password });
      if (!opened.ok) return opened.message;

      const results = scoreShift({
        parameters: pack.parameters,
        scenarios: pack.scenarios.scenario,
        answerKey: opened.answerKey,
        work: shift.cases,
        usedMs: shift.elapsedMs + shift.penaltyMs,
      });
      set({ results, screen: "results", activeCaseId: null, shift: { ...shift, paused: false } });
      return null;
    },

    buildShiftFile: () => {
      const { xml, shift } = get();
      return JSON.stringify({ format: "casedrill-shift", version: 1, xml, shift });
    },

    importShiftFile: (text) => {
      const notUsable = "This is not a CaseDrill shift file.";
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        return notUsable;
      }
      const parsed = shiftFileSchema.safeParse(data);
      if (!parsed.success) return notUsable;

      const imported = importPack(parsed.data.xml);
      if (!imported.ok) return notUsable;

      const ids = imported.pack.scenarios.scenario.map((item) => item.id).sort();
      if (JSON.stringify(ids) !== JSON.stringify(Object.keys(parsed.data.shift.cases).sort())) {
        return "This shift file does not match its training pack.";
      }
      activate(parsed.data.xml, imported.pack, imported.summary, { ...parsed.data.shift, paused: true });
      return null;
    },
  };
});

let saveTimer: ReturnType<typeof setTimeout> | undefined;

useStore.subscribe((state) => {
  if (!state.xml || !state.shift || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    const { xml, shift, results, summary } = useStore.getState();
    if (xml && shift && summary) {
      safely(() => idbSet(SAVE_KEY, { xml, title: summary.title, shift, results }));
    }
  }, 2000);
});
