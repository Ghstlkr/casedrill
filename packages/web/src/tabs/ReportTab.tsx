import { seededShuffle } from "@casedrill/engine";
import { getReportSections } from "@casedrill/profiles";
import { LEVEL_RULES } from "@casedrill/schema";
import { useMemo } from "react";
import { categoryLabel } from "../components/FlagMenu";
import { longDate } from "../format";
import { useStore } from "../store";
import { useCase } from "./useCase";

export function ReportTab() {
  const { caseId, scenario, work, level, jurisdiction, profile, config } = useCase();
  const seed = useStore((state) => state.view!.parameters.seed);
  const setReportBlock = useStore((state) => state.setReportBlock);
  const setReportText = useStore((state) => state.setReportText);
  const rules = LEVEL_RULES[level];

  const blocks = useMemo(
    () => seededShuffle(scenario.reportBlocks.block, `${seed}:${scenario.id}:blocks`),
    [scenario, seed],
  );

  if (work.decision === rules.negative) {
    return <p className="empty">You decided that this case needs no report. Change your decision in Processing to write one.</p>;
  }

  const sections = getReportSections(level, jurisdiction).filter((section) =>
    blocks.some((block) => block.section === section.id),
  );
  const chosenText = (section: string) => blocks.find((block) => block.id === work.report.blocks[section])?.text;

  const accounts = scenario.accounts.account.map((account) => account.id).join(", ");
  const autoValues = [
    "CaseDrill Training Bank (fictional)",
    longDate(scenario.alert.raisedOn),
    `CD-${scenario.id}`,
    scenario.customer.name,
    accounts,
    scenario.alert.ruleName,
  ];
  const title = level === "l1" ? "Escalation note" : profile.labels.reportLong;

  return (
    <div className="report">
      <div className="report-form">
        {work.decision === null && <p className="warning">You have not made a decision yet. You can prepare the report first.</p>}
        {sections.map((section) => (
          <fieldset key={section.id} className="block-choice">
            <legend>{section.label}</legend>
            <p className="help">{section.help}</p>
            {blocks
              .filter((block) => block.section === section.id)
              .map((block) => (
                <label key={block.id}>
                  <input
                    type="radio"
                    name={`section-${section.id}`}
                    checked={work.report.blocks[section.id] === block.id}
                    onChange={() => setReportBlock(caseId, section.id, block.id)}
                  />
                  <span>{block.text}</span>
                </label>
              ))}
            <label>
              <input
                type="radio"
                name={`section-${section.id}`}
                checked={!work.report.blocks[section.id]}
                onChange={() => setReportBlock(caseId, section.id, null)}
              />
              <span>Leave this section out</span>
            </label>
          </fieldset>
        ))}

        <label className="stacked">
          Reason for suspicion in your own words (optional, not scored)
          <textarea rows={4} value={work.report.freeText} onChange={(event) => setReportText(caseId, event.target.value)} />
        </label>
      </div>

      <article className="report-sheet" aria-label="Report preview">
        <h2>{title}</h2>
        <dl className="facts">
          {profile.reportForm.autoFields.map((field, index) => (
            <div key={field} className="facts-row">
              <dt>{field}</dt>
              <dd>{autoValues[index]}</dd>
            </div>
          ))}
        </dl>
        {sections.map((section) =>
          chosenText(section.id) ? (
            <section key={section.id}>
              <h3>{section.label}</h3>
              <p>{chosenText(section.id)}</p>
            </section>
          ) : null,
        )}
        <section>
          <h3>Irregularities identified</h3>
          {work.marks.length === 0 ? (
            <p className="empty">Items you flag will appear here.</p>
          ) : (
            <ul className="report-marks">
              {work.marks.map((mark) => (
                <li key={mark.key}>
                  {mark.label}: {categoryLabel(mark.category).toLowerCase()}
                </li>
              ))}
            </ul>
          )}
        </section>
        {work.report.freeText && (
          <section>
            <h3>{config.id === "l1" ? "Analyst's note" : "Analyst's reasoning"}</h3>
            <p>{work.report.freeText}</p>
          </section>
        )}
      </article>
    </div>
  );
}
