import { generatePack, MAX_GENERATED_CASES } from "@casedrill/generator";
import { importPack, type ImportResult } from "@casedrill/importer";
import { getLevelConfig, profiles } from "@casedrill/profiles";
import { MIN_PASSWORD_LENGTH, sealPack } from "@casedrill/seal";
import { useEffect, useRef, useState } from "react";
import euSample from "../../../../packs/curated/sample-eu-l2.xml?raw";
import ukSample from "../../../../packs/curated/sample-uk-l2.xml?raw";
import templateXml from "../../../../templates/casedrill-template.xml?raw";
import { InfoButton } from "../components/InfoButton";
import { useStore } from "../store";

function download(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/xml" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function GenerateForm({ onGenerate }: { onGenerate: (xml: string) => void }) {
  const [jurisdiction, setJurisdiction] = useState<"uk" | "eu">("uk");
  const [level, setLevel] = useState<"l1" | "l2">("l2");
  const [cases, setCases] = useState(8);
  const [truePositives, setTruePositives] = useState(2);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [error, setError] = useState<string | null>(null);

  const generate = () => {
    try {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]! % 2_147_483_647;
      onGenerate(generatePack({ jurisdiction, level, cases, truePositives, difficulty, seed }));
      setError(null);
    } catch (problem) {
      setError((problem as Error).message);
    }
  };

  return (
    <details className="seal">
      <summary>Create a practice queue without AI</summary>
      <div className="generate-fields">
        <label className="stacked">
          <span>
            Jurisdiction
            <InfoButton label="Jurisdiction" info={{ what: "The reporting rules and payment methods used in the queue.", when: "Choose the regime you want to practise.", mistake: "Assuming that EU training reflects one Member State's exact procedures." }} />
          </span>
          <select value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value as "uk" | "eu")}>
            <option value="uk">United Kingdom</option>
            <option value="eu">European Union</option>
          </select>
        </label>
        <label className="stacked">
          <span>
            Level
            <InfoButton label="Level" info={{ what: "The role you take in the shift.", when: "Choose Level 1 for triage, or Level 2 for full investigations with routing and a report.", mistake: "Starting at Level 2 without being comfortable reading a customer's activity." }} />
          </span>
          <select value={level} onChange={(event) => setLevel(event.target.value as "l1" | "l2")}>
            <option value="l1">Level 1: Alert triage</option>
            <option value="l2">Level 2: Investigation</option>
          </select>
        </label>
        <label className="stacked">
          <span>
            Alerts
            <InfoButton label="Alerts" info={{ what: "The number of cases in the shift.", when: `Choose up to ${MAX_GENERATED_CASES}. Level 2 allows about 15 minutes for each alert.`, mistake: "Choosing more alerts than you have time to finish. Undecided alerts score zero." }} />
          </span>
          <input type="number" min={1} max={MAX_GENERATED_CASES} value={cases} onChange={(event) => setCases(Number(event.target.value))} />
        </label>
        <label className="stacked">
          <span>
            True positives
            <InfoButton label="True positives" info={{ what: "How many of the alerts are really suspicious. This number is fixed and shown to you.", when: "Keep it low to reflect a real queue, where most alerts are false positives.", mistake: "Stopping once you have found this number, instead of reviewing every alert." }} />
          </span>
          <input type="number" min={0} max={cases} value={truePositives} onChange={(event) => setTruePositives(Number(event.target.value))} />
        </label>
        <label className="stacked">
          <span>
            Difficulty
            <InfoButton label="Difficulty" info={{ what: "How much everyday activity surrounds the important payments.", when: "Raise it when you can find the key payments quickly.", mistake: "Thinking that a harder queue changes the law or the answers. It only adds more to read." }} />
          </span>
          <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as "easy" | "medium" | "hard")}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
      </div>
      <button type="button" onClick={generate}>
        Create queue
      </button>
      {error && <p className="critical" role="alert">{error}</p>}
    </details>
  );
}

const AI_PROMPT =
  "Fill in this CaseDrill template by following the aiInstructions block in the file. Use 15 alerts, 3 true positives, Level 2 and the UK. Return the complete XML as a file and do not describe the scenarios or answers in your message.";

function AiSteps() {
  const [copied, setCopied] = useState(false);

  return (
    <details className="seal">
      <summary>Create a pack with an AI assistant</summary>
      <ol className="ai-steps">
        <li>
          <button type="button" onClick={() => download("casedrill-template.xml", templateXml)}>
            Download the template
          </button>
        </li>
        <li>Upload the template to an AI assistant such as Claude.</li>
        <li>
          Send this message, changing the numbers if you wish.
          <blockquote>{AI_PROMPT}</blockquote>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(AI_PROMPT);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy message"}
          </button>
        </li>
        <li>Import the XML file it returns, using the box above.</li>
      </ol>
    </details>
  );
}

function Problems({ result }: { result: Extract<ImportResult, { ok: false }> }) {
  const [copied, setCopied] = useState(false);
  const open = result.errors.filter((item) => !item.revealsAnswers);
  const hidden = result.errors.filter((item) => item.revealsAnswers);

  const copy = async () => {
    await navigator.clipboard.writeText(result.repairPrompt);
    setCopied(true);
  };

  return (
    <section className="panel problems" aria-live="polite">
      <h2>This file needs fixing</h2>
      <p>Copy the message below, paste it to the AI that made the file, then import the file it returns.</p>
      {open.length > 0 && (
        <ul>
          {open.map((item) => (
            <li key={`${item.location}${item.message}`}>
              <strong>{item.location}:</strong> {item.message}
            </li>
          ))}
        </ul>
      )}
      {hidden.length > 0 && (
        <details>
          <summary>Show {hidden.length} problems that mention the answers</summary>
          <ul>
            {hidden.map((item) => (
              <li key={`${item.location}${item.message}`}>
                <strong>{item.location}:</strong> {item.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      <button type="button" className="primary" onClick={copy}>
        {copied ? "Copied" : "Copy message for the AI"}
      </button>
    </section>
  );
}

function SealForm({ source }: { source: string }) {
  const [mode, setMode] = useState<"app" | "password">("app");
  const [password, setPassword] = useState("");
  const [useRange, setUseRange] = useState(false);
  const [min, setMin] = useState(10);
  const [max, setMax] = useState(30);
  const [message, setMessage] = useState("");

  const seal = async () => {
    const result = await sealPack(source, {
      password: mode === "password" ? password : undefined,
      range: mode === "password" && useRange ? { min, max } : undefined,
    });
    if (result.ok) {
      download(result.fileName, result.xml);
      setMessage(`Sealed and downloaded ${result.fileName}. Share that file, not the original.`);
    } else {
      setMessage(result.errors.join(" "));
    }
  };

  return (
    <details className="seal">
      <summary>Seal this pack for someone else</summary>
      <p>Sealing encrypts the answers, so another person can train without seeing them.</p>
      <fieldset>
        <legend>Protection</legend>
        <label>
          <input type="radio" checked={mode === "app"} onChange={() => setMode("app")} /> Without a password
          <InfoButton
            label="Sealing without a password"
            info={{
              what: "Hides the answers from casual reading.",
              when: "Use it for self-study and for sharing with people you trust.",
              mistake: "Using it for an assessment. CaseDrill's code is public, so a determined person can open the file.",
            }}
          />
        </label>
        <label>
          <input type="radio" checked={mode === "password"} onChange={() => setMode("password")} /> With a password
          <InfoButton
            label="Sealing with a password"
            info={{
              what: "Encrypts the answers with a password that is not stored in the file.",
              when: "Use it for training groups and assessments. Give out the password when the shift ends.",
              mistake: "Losing the password. The answers cannot be recovered without it.",
            }}
          />
        </label>
      </fieldset>
      {mode === "password" && (
        <>
          <label className="stacked">
            Password, {MIN_PASSWORD_LENGTH} characters or more
            <input type="password" value={password} autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} />
          </label>
          <label>
            <input type="checkbox" checked={useRange} onChange={(event) => setUseRange(event.target.checked)} /> Show a range instead of the exact number of true positives
            <InfoButton
              label="Showing a range"
              info={{
                what: "Replaces the exact count with a percentage range and removes the count from the file.",
                when: "Use it when knowing the exact count would let someone stop looking early.",
                mistake: "Choosing a range that does not include the real share. CaseDrill will refuse it.",
              }}
            />
          </label>
          {useRange && (
            <div className="range-fields">
              <label className="stacked">
                From %
                <input type="number" min={0} max={100} value={min} onChange={(event) => setMin(Number(event.target.value))} />
              </label>
              <label className="stacked">
                To %
                <input type="number" min={0} max={100} value={max} onChange={(event) => setMax(Number(event.target.value))} />
              </label>
            </div>
          )}
        </>
      )}
      <button type="button" onClick={seal}>
        Seal and download
      </button>
      {message && <p role="status">{message}</p>}
    </details>
  );
}

function Summary({ result, source }: { result: Extract<ImportResult, { ok: true }>; source: string }) {
  const startShift = useStore((state) => state.startShift);
  const { summary, warnings, pack } = result;
  const profile = profiles[summary.jurisdiction];
  const level = getLevelConfig(summary.level, summary.jurisdiction);
  const visible = warnings.filter((item) => !item.revealsAnswers);
  const hidden = warnings.filter((item) => item.revealsAnswers);

  return (
    <section className="panel summary" aria-live="polite">
      <h2>{summary.title}</h2>
      <p className="tp-line">{summary.truePositiveLine}</p>
      <dl className="facts">
        <dt>Jurisdiction</dt>
        <dd>{profile.name}</dd>
        <dt>Level</dt>
        <dd>
          {level.name} <InfoButton label={level.name} info={level.info} />
        </dd>
        <dt>Alerts</dt>
        <dd>{summary.cases}</dd>
        <dt>Borderline cases</dt>
        <dd>{summary.borderline ?? "Not shown"}</dd>
        <dt>Shift length</dt>
        <dd>{pack.parameters.sessionMinutes} minutes</dd>
        <dt>Answers</dt>
        <dd>{summary.sealed ? "Sealed" : "Not sealed"}</dd>
      </dl>
      <p className="notice">{profile.notice}</p>
      {visible.map((item) => (
        <p key={item.message} className="warning">
          {item.message}
        </p>
      ))}
      {hidden.length > 0 && (
        <details>
          <summary>Show {hidden.length} notes that mention the answers</summary>
          {hidden.map((item) => (
            <p key={item.message}>{item.message}</p>
          ))}
        </details>
      )}
      <button type="button" className="primary" onClick={() => startShift(source, pack, summary)}>
        Start shift
      </button>
      {!summary.sealed && <SealForm source={source} />}
    </section>
  );
}

export function ImportScreen() {
  const saved = useStore((state) => state.saved);
  const resumeShift = useStore((state) => state.resumeShift);
  const loadSaved = useStore((state) => state.loadSaved);
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  const importShiftFile = useStore((state) => state.importShiftFile);
  const shiftInput = useRef<HTMLInputElement>(null);
  const [shiftError, setShiftError] = useState<string | null>(null);

  const load = (text: string) => {
    setSource(text);
    setResult(importPack(text));
  };
  const loadFile = async (file?: File) => {
    if (file) load(await file.text());
  };

  return (
    <main className="import-layout">
      <div className="hero">
        <h1>Clear the alert queue, then find out what you missed.</h1>
        <p>
          CaseDrill is a free simulator for anti-money laundering analysts. Every customer and payment is fictional, and your work stays in this
          browser.
        </p>
        {saved && (
          <p className="resume">
            <button type="button" className="primary" onClick={resumeShift}>
              Resume your shift
            </button>
            <span>{saved.title}</span>
          </p>
        )}
      </div>

      <div className="import-actions">
        <button
          type="button"
          className={dragging ? "dropzone active" : "dropzone"}
          onClick={() => input.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void loadFile(event.dataTransfer.files[0]);
          }}
        >
          <strong>Import a training pack</strong>
          <span>Drop an XML file here or choose one</span>
          <span>Use fictional data only. Never import real customer data.</span>
        </button>
        <input
          ref={input}
          type="file"
          accept=".xml,text/xml,application/xml"
          hidden
          onChange={(event) => {
            void loadFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <div className="samples">
          <span>Or try a sample:</span>
          <button type="button" onClick={() => load(ukSample)}>
            UK queue
          </button>
          <button type="button" onClick={() => load(euSample)}>
            EU queue
          </button>
        </div>

        <GenerateForm onGenerate={load} />
        <AiSteps />

        <div className="samples">
          <span>Saved your progress?</span>
          <button type="button" onClick={() => shiftInput.current?.click()}>
            Open a shift file
          </button>
          <input
            ref={shiftInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) setShiftError(importShiftFile(await file.text()));
            }}
          />
        </div>
        {shiftError && <p className="critical" role="alert">{shiftError}</p>}

        {result && !result.ok && <Problems result={result} />}
        {result && result.ok && <Summary key={source} result={result} source={source} />}
      </div>
    </main>
  );
}
