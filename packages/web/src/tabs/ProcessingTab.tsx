import { options } from "@casedrill/profiles";
import { LEVEL_RULES } from "@casedrill/schema";
import { categoryLabel } from "../components/FlagMenu";
import { InfoButton } from "../components/InfoButton";
import { useStore } from "../store";
import { useCase } from "./useCase";

type Option = (typeof options.typologies)[number] | (typeof options.archetypes)[number];

export function ProcessingTab() {
  const { caseId, work, level, config } = useCase();
  const unflag = useStore((state) => state.unflag);
  const setDecision = useStore((state) => state.setDecision);
  const setPattern = useStore((state) => state.setPattern);

  const patternGroup = (legend: string, items: readonly Option[]) => (
    <fieldset className="patterns">
      <legend>{legend}</legend>
      {items.map((item) => (
        <div key={item.id} className="option-row">
          <label>
            <input type="radio" name="pattern" checked={work.pattern === item.id} onChange={() => setPattern(caseId, item.id)} /> {item.label}
          </label>
          <InfoButton label={item.label} info={item.info} />
        </div>
      ))}
    </fieldset>
  );

  return (
    <div className="processing">
      <section>
        <h2>Flagged items</h2>
        {work.marks.length === 0 ? (
          <p className="empty">Nothing flagged yet. Use Flag on a transaction, document or party.</p>
        ) : (
          <ul className="marks">
            {work.marks.map((mark) => (
              <li key={mark.key}>
                <span>{mark.label}</span>
                <span className="flag-chip">
                  {categoryLabel(mark.category)}
                  <button type="button" aria-label={`Remove flag from ${mark.label}`} onClick={() => unflag(caseId, mark.key)}>
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Best explanation for this activity</h2>
        <div className="pattern-grid">
          {patternGroup("Suspicious patterns", options.typologies)}
          {patternGroup("Legitimate explanations", options.archetypes)}
        </div>
        {work.pattern && (
          <button type="button" className="text-button" onClick={() => setPattern(caseId, null)}>
            Clear selection
          </button>
        )}
      </section>

      <section>
        <h2>Decision</h2>
        <div className="decisions">
          {config.decisions.map((decision) => (
            <div key={decision.id} className="decision">
              <button
                type="button"
                aria-pressed={work.decision === decision.id}
                className={work.decision === decision.id ? "decision-button chosen" : "decision-button"}
                onClick={() => setDecision(caseId, decision.id)}
              >
                {decision.label}
              </button>
              <InfoButton label={decision.label} info={decision.info} />
            </div>
          ))}
        </div>
        {work.decision === LEVEL_RULES[level].positive && work.marks.length === 0 && (
          <p className="warning">Flag the evidence that supports this decision.</p>
        )}
        {work.decision && (
          <button type="button" className="text-button" onClick={() => setDecision(caseId, null)}>
            Clear decision
          </button>
        )}
      </section>
    </div>
  );
}
