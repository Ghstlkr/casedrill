import { clock } from "../format";
import { useStore } from "../store";

export function ShiftBar() {
  const shift = useStore((state) => state.shift);
  const view = useStore((state) => state.view);
  const togglePause = useStore((state) => state.togglePause);
  const screen = useStore((state) => state.screen);
  const showQueue = useStore((state) => state.showQueue);
  const results = useStore((state) => state.results);

  const remaining = shift && view ? view.parameters.sessionMinutes * 60_000 - shift.elapsedMs - shift.penaltyMs : 0;

  return (
    <header className="shift-bar">
      <div className="shift-bar-inner">
        <span className="brand">CaseDrill</span>
        {shift && view && !results && (
          <>
            <span className="shift-title">{view.parameters.title}</span>
            {screen === "case" && (
              <button type="button" className="bar-button" onClick={showQueue}>
                Back to queue
              </button>
            )}
            <span className={remaining < 0 ? "shift-clock over" : "shift-clock"} role="timer">
              {remaining < 0 ? `${clock(remaining)} over` : `${clock(remaining)} left`}
            </span>
            <button type="button" className="bar-button" onClick={togglePause}>
              {shift.paused ? "Resume" : "Pause"}
            </button>
          </>
        )}
      </div>
    </header>
  );
}
