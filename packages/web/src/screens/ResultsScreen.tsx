import { getLevelConfig, profiles } from "@casedrill/profiles";
import type { CaseResult } from "@casedrill/scoring";
import { clock, STAMP_TEXT } from "../format";
import { useStore } from "../store";

const COMPONENT_LABELS: Record<string, string> = {
  decision: "Decision",
  evidence: "Evidence",
  routing: "Routing",
  report: "Report",
  typology: "Pattern",
  time: "Time",
};

const OUTCOME_LABELS: Record<string, string> = {
  true_positive: "True positive",
  false_positive: "False positive",
  borderline: "Borderline",
};

const SELF_CHECK = ["Who was involved?", "What happened?", "Where did it happen?", "When did it happen?", "Why is it suspicious?", "How was it done?"];

const CRITICAL_TEXT: Record<string, string> = {
  missed_true_positive: "Critical error: a true positive was not sent forward.",
  tipping_off: "Critical error: you selected informing the customer.",
};

const percent = (value: number | null) => (value === null ? "Not applicable" : `${Math.round(value * 100)}%`);

function CaseDetail({ item }: { item: CaseResult }) {
  const jurisdiction = useStore((state) => state.view!.parameters.jurisdiction);
  const routes = profiles[jurisdiction].routes;
  const routeLabels = (ids: string[]) =>
    ids.length === 0 ? "None" : ids.map((id) => routes.find((route) => route.id === id)?.label ?? id).join("; ");

  return (
    <details className="case-result">
      <summary>
        <span className="case-result-name">{item.customerName}</span>
        <span>{OUTCOME_LABELS[item.outcome]}</span>
        <span className="case-result-score">{item.score} of 100</span>
      </summary>
      <div className="case-result-body">
        {item.critical.map((error) => (
          <p key={error} className="critical">
            {CRITICAL_TEXT[error]}
          </p>
        ))}
        <p className="lead">{item.explanation}</p>

        <dl className="facts">
          <dt>Your decision</dt>
          <dd>{item.chosenDecision ? STAMP_TEXT[item.chosenDecision] : "Not decided"}</dd>
          <dt>Expected decision</dt>
          <dd>{STAMP_TEXT[item.expectedDecision]}</dd>
          <dt>Your pattern</dt>
          <dd>{item.patternChosen ?? "None selected"}</dd>
          <dt>Expected pattern</dt>
          <dd>{item.patternExpected ?? "None"}</dd>
          <dt>Time on this case</dt>
          <dd>{clock(item.timeSpentMs)}</dd>
        </dl>

        <table className="ledger score-table">
          <thead>
            <tr>
              <th scope="col">Part</th>
              <th scope="col" className="num">Weight</th>
              <th scope="col" className="num">Earned</th>
            </tr>
          </thead>
          <tbody>
            {item.components.map((component) => (
              <tr key={component.key}>
                <td>{COMPONENT_LABELS[component.key]}</td>
                <td className="num">{component.weight}</td>
                <td className="num">{Math.round(component.earned * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>

        {item.found.length > 0 && (
          <section>
            <h3>Evidence you found</h3>
            <ul>
              {item.found.map((entry) => (
                <li key={entry.note}>
                  {entry.note}
                  {!entry.categoryCorrect && " The category you chose was different."}
                </li>
              ))}
            </ul>
          </section>
        )}
        {item.missed.length > 0 && (
          <section>
            <h3>Evidence you missed</h3>
            <ul>
              {item.missed.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>
        )}
        {item.extraFlags.length > 0 && (
          <section>
            <h3>Flags that were not needed</h3>
            <ul>
              {item.extraFlags.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3>Routing</h3>
          <p>Yours: {routeLabels(item.routing.chosen)}</p>
          <p>Expected: {routeLabels(item.routing.expected)}</p>
          {item.routing.debriefs.map((text) => (
            <p key={text} className="critical">
              {text}
            </p>
          ))}
        </section>

        {item.report.length > 0 && (
          <section>
            <h3>Report</h3>
            {item.report.map((entry) => (
              <div key={entry.section} className={entry.correct ? "report-compare" : "report-compare wrong"}>
                <p>{entry.correct ? "Correct" : "Different from the expected text"}</p>
                <p>Yours: {entry.chosen ?? "Left out"}</p>
                {!entry.correct && <p>Expected: {entry.expected ?? "Leave this section out"}</p>}
              </div>
            ))}
          </section>
        )}

        {item.freeText && (
          <section>
            <h3>Check your own wording</h3>
            <blockquote>{item.freeText}</blockquote>
            <p className="help">This text is not scored. Does it answer each question?</p>
            <ul className="self-check">
              {SELF_CHECK.map((question) => (
                <li key={question}>
                  <label>
                    <input type="checkbox" /> {question}
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </details>
  );
}

export function ResultsScreen() {
  const results = useStore((state) => state.results);
  const summary = useStore((state) => state.summary);
  const leaveShift = useStore((state) => state.leaveShift);
  if (!results || !summary) return null;

  const level = getLevelConfig(summary.level, summary.jurisdiction);
  const { counts } = results;
  const overtime = results.usedMs - results.allowedMs;

  return (
    <main className="results">
      <header className="results-head">
        <div>
          <h1>Shift results</h1>
          <p className="results-score">{results.score} of 100</p>
          <p>
            You need {results.passMark} and no critical errors to pass. {summary.truePositiveLine}.
          </p>
          <p className="help">
            {summary.title}. {level.name}.
          </p>
        </div>
        <span className={results.passed ? "stamp pass" : "stamp"}>{results.passed ? "Passed" : "Not passed"}</span>
      </header>

      <div className="results-grid">
        <section>
          <h2>Your decisions</h2>
          <table className="ledger">
            <tbody>
              <tr>
                <th scope="row">True positives detected</th>
                <td className="num">{counts.detected}</td>
              </tr>
              <tr>
                <th scope="row">True positives missed</th>
                <td className="num">{counts.missed}</td>
              </tr>
              <tr>
                <th scope="row">False positives sent forward</th>
                <td className="num">{counts.reportedFalsePositives}</td>
              </tr>
              <tr>
                <th scope="row">False positives closed</th>
                <td className="num">{counts.closedFalsePositives}</td>
              </tr>
              {counts.borderline > 0 && (
                <tr>
                  <th scope="row">Borderline cases</th>
                  <td className="num">{counts.borderline}</td>
                </tr>
              )}
              <tr>
                <th scope="row">Alerts left undecided</th>
                <td className="num">{counts.undecided}</td>
              </tr>
              <tr>
                <th scope="row">Critical errors</th>
                <td className="num">{results.criticalCount}</td>
              </tr>
              <tr>
                <th scope="row">Detection rate (recall)</th>
                <td className="num">{percent(results.recall)}</td>
              </tr>
              <tr>
                <th scope="row">Accuracy of cases sent forward (precision)</th>
                <td className="num">{percent(results.precision)}</td>
              </tr>
              <tr>
                <th scope="row">Time used, including document requests</th>
                <td className="num">
                  {clock(results.usedMs)}
                  {overtime > 0 ? ` (${clock(overtime)} over)` : ""}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2>By pattern</h2>
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">Pattern</th>
                <th scope="col" className="num">Right decisions</th>
              </tr>
            </thead>
            <tbody>
              {results.byPattern.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.label}</td>
                  <td className="num">
                    {entry.correct} of {entry.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="results-cases">
        <h2>Case by case</h2>
        {results.cases.map((item) => (
          <CaseDetail key={item.scenarioId} item={item} />
        ))}
      </section>

      <button type="button" className="primary" onClick={leaveShift}>
        Finish and start a new shift
      </button>
    </main>
  );
}
