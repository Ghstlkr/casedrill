import { useEffect } from "react";
import { ShiftBar } from "./components/ShiftBar";
import { CaseScreen } from "./screens/CaseScreen";
import { ImportScreen } from "./screens/ImportScreen";
import { QueueScreen } from "./screens/QueueScreen";
import { ResultsScreen } from "./screens/ResultsScreen";
import { useStore } from "./store";

const TICK_MS = 1000;

export function App() {
  const screen = useStore((state) => state.screen);
  const paused = useStore((state) => state.shift?.paused ?? false);
  const running = useStore((state) => Boolean(state.shift && !state.results));
  const tick = useStore((state) => state.tick);
  const togglePause = useStore((state) => state.togglePause);

  useEffect(() => {
    if (!running || paused) return undefined;
    const timer = setInterval(() => tick(TICK_MS), TICK_MS);
    return () => clearInterval(timer);
  }, [running, paused, tick]);

  return (
    <>
      <ShiftBar />
      {paused ? (
        <main className="paused">
          <h1>Shift paused</h1>
          <p>The clock has stopped and the case is hidden.</p>
          <button type="button" className="primary" onClick={togglePause}>
            Resume shift
          </button>
        </main>
      ) : (
        <>
          {screen === "import" && (
            <>
              <ImportScreen />
              <footer className="site-footer">
                <p>
                  CaseDrill by{" "}
                  <a href="https://apexbankingadvisor.com" rel="noreferrer">
                    Apex Banking Advisor
                  </a>
                  . Free and open source. For training only, and not legal advice.
                </p>
              </footer>
            </>
          )}
          {screen === "queue" && <QueueScreen />}
          {screen === "case" && <CaseScreen />}
          {screen === "results" && <ResultsScreen />}
        </>
      )}
    </>
  );
}
