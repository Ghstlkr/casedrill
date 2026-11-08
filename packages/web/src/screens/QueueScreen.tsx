import { getLevelConfig } from "@casedrill/profiles";
import { useState } from "react";
import { InfoButton } from "../components/InfoButton";
import { longDate, STAMP_TEXT } from "../format";
import { useStore } from "../store";

const SEVERITY: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };

function EndShift({ undecided, passwordNeeded }: { undecided: number; passwordNeeded: boolean }) {
  const endShift = useStore((state) => state.endShift);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <p className="end-shift">
        <button type="button" className="primary" onClick={() => setOpen(true)}>
          End shift
        </button>
      </p>
    );
  }

  return (
    <form
      className="panel end-shift-panel"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(await endShift(passwordNeeded ? password : undefined));
      }}
    >
      <h2>End this shift?</h2>
      <p>
        {undecided > 0
          ? `${undecided} ${undecided === 1 ? "alert has" : "alerts have"} no decision and will score zero. `
          : "All alerts have a decision. "}
        You cannot change your work after this.
      </p>
      {passwordNeeded && (
        <label className="stacked">
          Instructor's password
          <input type="password" value={password} autoComplete="off" onChange={(event) => setPassword(event.target.value)} />
        </label>
      )}
      {error && <p className="critical" role="alert">{error}</p>}
      <div className="button-row">
        <button type="submit" className="primary">
          End shift and see results
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          Keep working
        </button>
      </div>
    </form>
  );
}

export function QueueScreen() {
  const view = useStore((state) => state.view);
  const summary = useStore((state) => state.summary);
  const shift = useStore((state) => state.shift);
  const openCase = useStore((state) => state.openCase);
  const leaveShift = useStore((state) => state.leaveShift);
  const buildShiftFile = useStore((state) => state.buildShiftFile);
  const pack = useStore((state) => state.pack);
  const [confirming, setConfirming] = useState(false);

  if (!view || !shift || !summary) return null;
  const scenarios = view.scenarios.scenario;
  const decided = scenarios.filter((item) => shift.cases[item.id]?.decision).length;
  const level = getLevelConfig(view.parameters.level, view.parameters.jurisdiction);
  const passwordNeeded = pack?.sealedAnswerKey?.keySource === "password";

  const saveFile = () => {
    const url = URL.createObjectURL(new Blob([buildShiftFile()], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "casedrill-shift.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="queue">
      <div className="queue-head">
        <h1>Alert queue</h1>
        <p>
          {decided} of {scenarios.length} decided
        </p>
        <p className="tp-line">{summary.truePositiveLine}</p>
        <p>
          {level.name} <InfoButton label={level.name} info={level.info} />
        </p>
      </div>

      <div className="table-scroll" tabIndex={0} role="region" aria-label="Alert queue">
        <table className="register">
          <thead>
            <tr>
              <th scope="col">Customer</th>
              <th scope="col">Alert</th>
              <th scope="col">Severity</th>
              <th scope="col">Raised</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((scenario) => {
              const work = shift.cases[scenario.id];
              return (
                <tr key={scenario.id}>
                  <td>
                    <button type="button" className="link" onClick={() => openCase(scenario.id)}>
                      {scenario.customer.name}
                    </button>
                  </td>
                  <td>{scenario.alert.ruleName}</td>
                  <td>
                    <span className={`severity ${scenario.alert.severity}`}>{SEVERITY[scenario.alert.severity]}</span>
                  </td>
                  <td className="nowrap">{longDate(scenario.alert.raisedOn)}</td>
                  <td>
                    {work?.decision ? (
                      <span className="stamp small">{STAMP_TEXT[work.decision]}</span>
                    ) : work?.opened ? (
                      "In progress"
                    ) : (
                      "New"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <EndShift undecided={scenarios.length - decided} passwordNeeded={passwordNeeded} />

      <div className="queue-foot">
        <button type="button" onClick={saveFile}>
          Save progress to a file
        </button>
        {confirming ? (
          <>
            <span>Leave this shift? Your progress will be deleted.</span>
            <button type="button" className="danger" onClick={leaveShift}>
              Delete shift
            </button>
            <button type="button" onClick={() => setConfirming(false)}>
              Keep working
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirming(true)}>
            Leave shift
          </button>
        )}
      </div>
    </main>
  );
}
