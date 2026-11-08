import { getLevelConfig } from "@casedrill/profiles";
import { type KeyboardEvent, lazy, Suspense, useMemo, useRef } from "react";
import { longDate, STAMP_TEXT, TAB_LABELS } from "../format";
import { useStore } from "../store";
import { DocumentsTab } from "../tabs/DocumentsTab";
import { OverviewTab } from "../tabs/OverviewTab";
import { PriorWorkTab } from "../tabs/PriorWorkTab";
import { ProcessingTab } from "../tabs/ProcessingTab";
import { ReportTab } from "../tabs/ReportTab";
import { RoutingTab } from "../tabs/RoutingTab";
import { TransactionsTab } from "../tabs/TransactionsTab";

const NetworkTab = lazy(() => import("../tabs/NetworkTab"));

export function CaseScreen() {
  const view = useStore((state) => state.view);
  const caseId = useStore((state) => state.activeCaseId);
  const shift = useStore((state) => state.shift);
  const activeTab = useStore((state) => state.activeTab);
  const setTab = useStore((state) => state.setTab);
  const openCase = useStore((state) => state.openCase);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const scenarios = view?.scenarios.scenario ?? [];
  const index = scenarios.findIndex((item) => item.id === caseId);
  const scenario = scenarios[index];
  const work = caseId ? shift?.cases[caseId] : undefined;

  const tabs = useMemo(() => {
    if (!view || !scenario) return [];
    const config = getLevelConfig(view.parameters.level, view.parameters.jurisdiction);
    return config.tabs.filter((tab) => tab !== "prior_work" || Boolean(scenario.priorWork));
  }, [view, scenario]);

  if (!view || !scenario || !work) return null;

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const position = tabs.indexOf(activeTab as (typeof tabs)[number]);
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = tabs[(position + step + tabs.length) % tabs.length];
    if (next) {
      setTab(next);
      tabRefs.current[next]?.focus();
    }
  };

  const previous = scenarios[index - 1];
  const next = scenarios[index + 1];

  return (
    <main className="case">
      <aside className="case-file">
        <h1>{scenario.customer.name}</h1>
        <p>{scenario.alert.ruleName}</p>
        <p className="case-date">Raised {longDate(scenario.alert.raisedOn)}</p>
        <p className="case-count">
          {work.marks.length} {work.marks.length === 1 ? "item" : "items"} flagged
        </p>
        <div className="stamp-slot">{work.decision && <span key={work.decision} className="stamp">{STAMP_TEXT[work.decision]}</span>}</div>
        <nav className="case-nav" aria-label="Move between alerts">
          <button type="button" disabled={!previous} onClick={() => previous && openCase(previous.id)}>
            Previous alert
          </button>
          <button type="button" disabled={!next} onClick={() => next && openCase(next.id)}>
            Next alert
          </button>
        </nav>
      </aside>

      <section className="case-body">
        <div className="tabs" role="tablist" aria-label="Case sections">
          {tabs.map((tab) => (
            <button
              key={tab}
              ref={(element) => {
                tabRefs.current[tab] = element;
              }}
              id={`tab-${tab}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              tabIndex={activeTab === tab ? 0 : -1}
              onClick={() => setTab(tab)}
              onKeyDown={onTabKey}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
        <div className="tab-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
          {activeTab === "overview" && <OverviewTab />}
          {activeTab === "transactions" && <TransactionsTab />}
          {activeTab === "documents" && <DocumentsTab />}
          {activeTab === "network" && (
            <Suspense fallback={<p>Loading the network view.</p>}>
              <NetworkTab />
            </Suspense>
          )}
          {activeTab === "prior_work" && <PriorWorkTab />}
          {activeTab === "processing" && <ProcessingTab />}
          {activeTab === "routing" && <RoutingTab />}
          {activeTab === "report" && <ReportTab />}
        </div>
      </section>
    </main>
  );
}
