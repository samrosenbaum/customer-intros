import { useEffect, useRef, useState } from "react";
import type { Customer } from "../data";
import type { ResearchConfig, ResearchOutcome } from "../research-contract";
export type ResearchProgress = {
  status:
    | "queued"
    | "researching"
    | "matches"
    | "needs-review"
    | "no-evidence"
    | "failed"
    | "cancelled";
  message: string;
};
export function ResearchPanel({
  customers,
  progress,
  onProgress,
  onOutcome,
  onClose,
  onImport,
}: {
  customers: Customer[];
  progress: Record<string, ResearchProgress>;
  onProgress: (domain: string, progress: ResearchProgress) => void;
  onOutcome: (outcome: ResearchOutcome) => void;
  onClose: () => void;
  onImport: () => void;
}) {
  const [config, setConfig] = useState<ResearchConfig | null>(null),
    [configError, setConfigError] = useState(""),
    [selected, setSelected] = useState<string[]>(() =>
      customers
        .filter((c) => !progress[c.domain])
        .slice(0, 5)
        .map((c) => c.domain),
    ),
    [consent, setConsent] = useState(false),
    [accessCode, setAccessCode] = useState(""),
    [running, setRunning] = useState(false);
  const unfinished = useRef<Set<string>>(new Set());
  const controller = useRef<AbortController | null>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const abort = new AbortController();
    void fetch("/api/research", { cache: "no-store", signal: abort.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const data: ResearchConfig = await r.json();
        if (mounted.current) setConfig(data);
      })
      .catch(() => {
        if (!abort.signal.aborted && mounted.current)
          setConfigError(
            "Could not load research configuration. Check the local server and reopen this panel.",
          );
      });
    return () => {
      mounted.current = false;
      abort.abort();
      controller.current?.abort();
    };
  }, []);
  async function start() {
    if (running || !config?.enabled || !consent || !selected.length) return;
    const chosen = customers
      .filter((c) => selected.includes(c.domain))
      .slice(0, 5);
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    unfinished.current = new Set(chosen.map((c) => c.domain));
    for (const c of chosen)
      onProgress(c.domain, {
        status: "queued",
        message: "Waiting for this batch.",
      });
    for (const c of chosen) {
      if (abort.signal.aborted) break;
      onProgress(c.domain, {
        status: "researching",
        message:
          "Searching sources and checking supported investor relationships…",
      });
      try {
        const response = await fetch("/api/research", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessCode ? { "x-research-access-code": accessCode } : {}),
          },
          body: JSON.stringify({
            customer: { name: c.name, domain: c.domain },
          }),
          signal: abort.signal,
          cache: "no-store",
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Research could not be completed.");
        if (!mounted.current || abort.signal.aborted) break;
        const outcome = body as ResearchOutcome;
        if (
          outcome.domain !== c.domain ||
          !["matches", "needs-review", "no-evidence"].includes(outcome.status)
        )
          throw new Error("Research returned an unexpected company or status.");
        onProgress(c.domain, {
          status: outcome.status,
          message: outcome.message,
        });
        onOutcome(outcome);
        unfinished.current.delete(c.domain);
      } catch (e) {
        if (!mounted.current) break;
        if (abort.signal.aborted) {
          onProgress(c.domain, {
            status: "cancelled",
            message: "Cancelled. No completed research outcome recorded.",
          });
          break;
        }
        unfinished.current.delete(c.domain);
        onProgress(c.domain, {
          status: "failed",
          message: e instanceof Error ? e.message : "Research failed.",
        });
      }
    }
    if (mounted.current) {
      if (abort.signal.aborted)
        for (const c of chosen.filter((c) => unfinished.current.has(c.domain)))
          onProgress(c.domain, {
            status: "cancelled",
            message:
              "Batch cancelled. Previously completed results are retained; unfinished work was not marked researched.",
          });
      setRunning(false);
      setConsent(false);
    }
    controller.current = null;
  }
  return (
    <section className="guide research-options" aria-label="Research customers">
      <div className="section-title">
        <h2>Research the investors behind your customers.</h2>
        <button
          className="text-button"
          onClick={() => {
            if (running) {
              controller.current?.abort();
              for (const domain of unfinished.current)
                onProgress(domain, {
                  status: "cancelled",
                  message:
                    "Batch closed. Unfinished research was cancelled; completed results are retained.",
                });
            }
            onClose();
          }}
        >
          {running ? "Cancel & close" : "Close"}
        </button>
      </div>
      <p>
        Two focused web searches per company, then a source-grounded extraction.
        Results are machine-extracted and need your review. This is a limited
        search, not a complete funding history.
      </p>
      {!config && !configError && (
        <p role="status">Checking server configuration…</p>
      )}
      {configError && (
        <p role="alert" className="message error">
          {configError}
        </p>
      )}
      {config && !config.enabled && (
        <div className="message">
          <strong>Connect your research providers to start.</strong>
          <p>
            Add {config.missing.join(", ")} to the server environment (locally:
            .env.local), then restart. Never enter provider keys in this page.
            Customer and evidence imports work without keys.
          </p>
        </div>
      )}
      <fieldset className="research-selection" disabled={running}>
        <legend>Select up to five customers</legend>
        {!customers.length ? (
          <p>Add a customer first.</p>
        ) : (
          customers.map((c) => (
            <label className="research-company" key={c.domain}>
              <input
                type="checkbox"
                checked={selected.includes(c.domain)}
                disabled={!selected.includes(c.domain) && selected.length >= 5}
                onChange={(e) => {
                  setSelected((prev) =>
                    e.target.checked
                      ? [...prev, c.domain]
                      : prev.filter((d) => d !== c.domain),
                  );
                  setConsent(false);
                }}
              />
              <span>
                <strong>{c.name}</strong>
                <small>{c.domain}</small>
              </span>
              <span
                className={`research-status ${progress[c.domain]?.status ?? ""}`}
              >
                {progress[c.domain]?.status?.replaceAll("-", " ") ??
                  "not started"}
              </span>
              {progress[c.domain] && (
                <small className="research-progress-message">
                  {progress[c.domain].message}
                </small>
              )}
            </label>
          ))
        )}
      </fieldset>
      <div className="research-disclosure">
        <strong>You control what leaves this page.</strong>
        <p>
          Only the selected company names and domains go to this app’s server
          and Tavily Search. Those identities and search-source passages go
          through Vercel AI Gateway to the configured model provider. Raw CSVs,
          contacts, deal values, happiness labels and shortlists are not sent.
          Provider processing and retention policies apply.
        </p>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={consent}
            disabled={running}
            onChange={(e) => setConsent(e.target.checked)}
          />
          I agree to send these selected company identities for external
          research.
        </label>
      </div>
      {config?.requiresAccessCode && (
        <label className="access-code">
          Private research access code
          <input
            type="password"
            autoComplete="off"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            disabled={running}
          />
        </label>
      )}
      <div className="entry-actions">
        <button
          className="primary"
          disabled={
            running ||
            !config?.enabled ||
            !consent ||
            !selected.length ||
            (config.requiresAccessCode && !accessCode)
          }
          onClick={() => void start()}
        >
          {running
            ? "Researching…"
            : `Research ${selected.length} customer${selected.length === 1 ? "" : "s"}`}
        </button>
        {running && (
          <button
            className="secondary"
            onClick={() => controller.current?.abort()}
          >
            Cancel batch
          </button>
        )}
        <button className="text-button" disabled={running} onClick={onImport}>
          Import evidence instead
        </button>
      </div>
      <p className="list-note">
        At most {selected.length * 2} basic searches and {selected.length}{" "}
        extraction calls in this batch. Existing findings remain on retry;
        errors are never recorded as “no investors.” Cancelling stops further
        work but cannot undo provider usage already incurred.
      </p>
    </section>
  );
}
