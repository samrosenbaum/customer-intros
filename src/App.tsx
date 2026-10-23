"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  Download,
  FileUp,
  GitFork,
  LockKeyhole,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  customersFrom,
  customerStatus,
  evidenceFrom,
  parseCSV,
  rankInvestors,
  introExport,
  type CustomerRelationship,
  type PathPreference,
  type Customer,
  type Evidence,
  type Issue,
  type Research,
  type Sheet,
} from "./data";
import { CustomerPaths } from "./components/CustomerPaths";
import { CustomerEntry } from "./components/CustomerEntry";
import { EvidenceEntry } from "./components/EvidenceEntry";
import { EvidenceSources } from "./components/EvidenceSources";
import {
  ResearchPanel,
  type ResearchProgress,
} from "./components/ResearchPanel";
import type { ResearchOutcome } from "./research-contract";
function download(name: string, text: string) {
  const u = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export default function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [relationships, setRelationships] = useState<
    Record<string, CustomerRelationship>
  >({});
  const [preferences, setPreferences] = useState<
    Record<string, PathPreference>
  >({});
  const [entering, setEntering] = useState(false);
  const [addingEvidence, setAddingEvidence] = useState<Customer | null>(null);
  const [researchOptions, setResearchOptions] = useState(false);
  const [researchProgress, setResearchProgress] = useState<
    Record<string, ResearchProgress>
  >({});
  function acceptResearch(outcome: ResearchOutcome) {
    if (outcome.evidence.length) addEvidence(outcome.evidence);
    if (outcome.status === "no-evidence")
      setResearch((prev) => [
        ...prev.filter((r) => r.domain !== outcome.domain),
        {
          domain: outcome.domain,
          reviewed: outcome.searchedAt.slice(0, 10),
          status: "no-evidence",
          message: outcome.message,
        },
      ]);
  }
  const researchPanel = useRef<HTMLElement>(null);
  function showResearch() {
    setResearchOptions(true);
    setTimeout(
      () =>
        researchPanel.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        }),
      0,
    );
  }
  function addEvidence(records: Evidence[]) {
    setEvidence((prev) => {
      const seen = new Set<string>();
      return [...prev, ...records].filter((e) => {
        const key = JSON.stringify(e);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
    setTab("Customer paths");
  }
  const [customers, setCustomers] = useState<Customer[]>([]),
    [evidence, setEvidence] = useState<Evidence[]>([]),
    [research, setResearch] = useState<Research[]>([]);
  const [sheet, setSheet] = useState<Sheet | null>(null),
    [nameCol, setNameCol] = useState(0),
    [domainCol, setDomainCol] = useState(1);
  const [customerIssues, setCustomerIssues] = useState<Issue[]>([]),
    [evidenceIssues, setEvidenceIssues] = useState<Issue[]>([]),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("Customer paths"),
    [query, setQuery] = useState(""),
    [guide, setGuide] = useState(false);
  const crmRef = useRef<HTMLInputElement>(null),
    evidenceRef = useRef<HTMLInputElement>(null),
    generation = useRef(0);
  const issues = [
    ...customerIssues.map((i) => ({
      ...i,
      reason: `Customer import: ${i.reason}`,
    })),
    ...evidenceIssues.map((i) => ({
      ...i,
      reason: `Evidence import: ${i.reason}`,
    })),
  ];
  const automaticReviews = customers.filter(
    (c) => researchProgress[c.domain]?.status === "needs-review",
  );
  const reviewCount = issues.length + automaticReviews.length;
  const investors = rankInvestors(evidence),
    matched = new Set(evidence.map((e) => e.domain)).size;
  async function load(file: File | undefined, kind: "customers" | "evidence") {
    if (!file) return;
    setError("");
    setNotice("");
    setBusy(true);
    const gen = generation.current;
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error(
          "Use a CSV smaller than 5 MB. Split larger exports before importing.",
        );
      const text = await file.text();
      if (gen !== generation.current) return;
      const parsed = parseCSV(text);
      if (parsed.rows.length > 20000)
        throw new Error("Import up to 20,000 rows at a time.");
      if (kind === "customers") {
        setSheet(parsed);
        const n = parsed.headers.findIndex((h) =>
          /company|account|name/i.test(h),
        );
        const d = parsed.headers.findIndex((h) =>
          /website|domain|url/i.test(h),
        );
        setNameCol(n < 0 ? 0 : n);
        setDomainCol(d < 0 ? -1 : d);
      } else {
        const result = evidenceFrom(parsed, customers);
        setEvidenceIssues(result.issues);
        addEvidence(result.records);
        setNotice(
          `${result.records.length} valid evidence rows imported; ${result.duplicates} duplicate rows skipped. Researcher-supplied, not independently verified.`,
        );
      }
    } catch (e) {
      if (gen === generation.current) setError((e as Error).message);
    } finally {
      if (gen === generation.current) setBusy(false);
    }
  }
  function confirm() {
    if (!sheet) return;
    const r = customersFrom(sheet, nameCol, domainCol);
    setCustomers(r.records);
    setEvidence([]);
    setResearch([]);
    setResearchProgress({});
    setResearchOptions(false);
    setRelationships({});
    setPreferences({});
    setAddingEvidence(null);
    setCustomerIssues(r.issues);
    setEvidenceIssues([]);
    setSheet(null);
    setNotice(
      `${r.records.length} distinct customers imported · ${r.duplicates} duplicate domains skipped · ${r.issues.length} rows need review. Other columns discarded.`,
    );
    setTab("Customer paths");
  }
  function reset() {
    generation.current++;
    setCustomers([]);
    setEvidence([]);
    setResearch([]);
    setResearchProgress({});
    setResearchOptions(false);
    setRelationships({});
    setPreferences({});
    setAddingEvidence(null);
    setSheet(null);
    setCustomerIssues([]);
    setEvidenceIssues([]);
    setNotice("Session cleared. All imported data has been removed.");
    setError("");
    setQuery("");
    setBusy(false);
    setTab("Customer paths");
    setEntering(false);
    setResearchOptions(false);
  }
  const filteredInvestors = investors.filter((i) =>
    [
      i.name,
      ...i.domains,
      ...customers.filter((c) => i.domains.has(c.domain)).map((c) => c.name),
    ]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <header className="topbar">
        <a href="#" className="brand">
          <span className="brand-icon">
            <GitFork size={21} />
          </span>
          Customer Investor Map<span className="beta">PRIVATE PILOT</span>
        </a>
        <div className="top-actions">
          <span className="private">
            <LockKeyhole size={13} /> Session data in memory
          </span>
          <button className="text-button" onClick={() => setGuide(!guide)}>
            How it works <ArrowUpRight size={14} />
          </button>
        </div>
      </header>
      <main data-ready={ready}>
        <div className="eyebrow">
          <span /> CUSTOMER-LED FUNDRAISING
        </div>
        <section className="heading">
          <div>
            <h1>
              Your next investor could be
              <br className="desktop" /> one happy customer away.
            </h1>
            <p>
              Find the investors behind your customers.
              <br />
              Build a sourced shortlist of possible warm introductions.
            </p>
          </div>
        </section>
        {guide && (
          <section className="guide">
            <button
              aria-label="Close guide"
              className="icon-button"
              onClick={() => setGuide(false)}
            >
              <X size={18} />
            </button>
            <h2>From customer list to possible introduction</h2>
            <p>
              1. Add customers or map a CRM export. 2. Identify happy customers.
              3. Add source-backed funding research. 4. Review investors grouped
              under each customer, and confirm whether that customer can
              introduce you.
            </p>
            <p>
              Opt-in research uses Tavily Search and Vercel AI Gateway when
              server keys are configured. Machine-extracted results are not
              independently verified. Manual source import remains available. No
              live CRM connection is made. SEC Form D is not a dependable
              investor list.
            </p>
          </section>
        )}
        <section className="import-grid">
          <article className="import-card">
            <div className="step">
              01 <span>START WITH YOUR CUSTOMERS</span>
              <FileUp size={19} />
            </div>
            <h2>Add your customers.</h2>
            <p>
              Add company names and websites, or upload your CRM export. Start
              with the customers who love your product.
            </p>
            <div className="card-actions">
              <button
                className="primary"
                disabled={!ready || busy}
                onClick={() => setEntering(!entering)}
              >
                <Plus size={16} />
                Enter customers
              </button>
              <button
                className="secondary"
                onClick={() => crmRef.current?.click()}
                disabled={!ready || busy}
              >
                <Plus size={16} />
                Upload CRM export
              </button>
              <a
                href="/templates/customers.csv"
                download
                title="Fictional company examples only; no funding evidence"
              >
                Sample CSV <Download size={13} />
              </a>
            </div>
            <span className="card-foot">
              Company + domain only · No contact details needed
            </span>
          </article>
          <article className="import-card evidence-card">
            <div className="step">
              02 <span>RESEARCH THEIR INVESTORS</span>
              <GitFork size={19} />
            </div>
            <h2>Research their investors.</h2>
            <p>
              Research your selected customers to find source-backed investors.
              Review the results before asking for an introduction.
            </p>
            <div className="card-actions">
              <button
                className="secondary"
                disabled={!customers.length}
                onClick={showResearch}
              >
                Research customers <ArrowRight size={14} />
              </button>
              <button
                className="text-button"
                disabled={!customers.length || busy}
                onClick={() => evidenceRef.current?.click()}
              >
                <Plus size={16} />
                Import evidence
              </button>
              <a href="/templates/evidence.csv" download>
                CSV template <Download size={13} />
              </a>
            </div>
            <span className="card-foot">
              Opt-in web research · Manual evidence import available
            </span>
          </article>
        </section>
        {entering && (
          <CustomerEntry
            customers={customers}
            onClose={() => setEntering(false)}
            onAdd={(customer) => {
              setCustomers((prev) => [...prev, customer]);
              setNotice(
                `${customer.name} added. Mark your relationship, then add investor research.`,
              );
              setTab("Customer paths");
            }}
          />
        )}
        {addingEvidence && (
          <EvidenceEntry
            customer={addingEvidence}
            onClose={() => setAddingEvidence(null)}
            onAdd={addEvidence}
          />
        )}
        {researchOptions && (
          <section ref={researchPanel}>
            <ResearchPanel
              customers={customers}
              progress={researchProgress}
              onProgress={(domain, progress) =>
                setResearchProgress((prev) => ({ ...prev, [domain]: progress }))
              }
              onOutcome={acceptResearch}
              onClose={() => setResearchOptions(false)}
              onImport={() => evidenceRef.current?.click()}
            />
          </section>
        )}
        <input
          ref={crmRef}
          aria-label="Customer CSV file"
          type="file"
          accept=".csv,text/csv"
          hidden
          disabled={!ready}
          onChange={(e) => {
            void load(e.target.files?.[0], "customers");
            e.target.value = "";
          }}
        />
        <input
          ref={evidenceRef}
          aria-label="Evidence CSV file"
          type="file"
          accept=".csv,text/csv"
          hidden
          disabled={!ready}
          onChange={(e) => {
            void load(e.target.files?.[0], "evidence");
            e.target.value = "";
          }}
        />
        {busy && (
          <p role="status" className="message">
            Reading CSV in your browser…
          </p>
        )}
        {error && (
          <p role="alert" className="message error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="message">
            {notice}
          </p>
        )}
        {sheet && (
          <section className="mapping">
            <div className="section-title">
              <h2>Preview & map columns</h2>
              <button className="text-button" onClick={() => setSheet(null)}>
                Cancel <X size={15} />
              </button>
            </div>
            <p>
              Only the two confirmed columns are retained. Other columns stay
              local and are discarded. Confirming replaces the current session
              dataset.
            </p>
            <div className="mapping-fields">
              <label>
                Company name
                <select
                  value={nameCol}
                  onChange={(e) => setNameCol(+e.target.value)}
                >
                  <option value={-1}>Choose a column</option>
                  {sheet.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || "(blank header)"} · column {i + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Website / domain
                <select
                  value={domainCol}
                  onChange={(e) => setDomainCol(+e.target.value)}
                >
                  <option value={-1}>Choose a column</option>
                  {sheet.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || "(blank header)"} · column {i + 1}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Company name</th>
                    <th>Website / domain</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.slice(0, 5).map((r) => (
                    <tr key={r.line}>
                      <td>{r.line}</td>
                      <td>{r.cells[nameCol] || "—"}</td>
                      <td>{r.cells[domainCol] || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mapping-bottom">
              <span>
                Showing {Math.min(5, sheet.rows.length)} of {sheet.rows.length}{" "}
                rows
              </span>
              <button
                className="primary"
                disabled={nameCol < 0 || domainCol < 0 || nameCol === domainCol}
                onClick={confirm}
              >
                Confirm mapping <ArrowRight size={15} />
              </button>
            </div>
          </section>
        )}
        <section className="stats">
          <div>
            <span>Customers</span>
            <strong>
              {customers.length}
              <small>distinct companies</small>
            </strong>
          </div>
          <div>
            <span>Investors in evidence</span>
            <strong>
              {investors.length}
              <small>in imported evidence</small>
            </strong>
          </div>
          <div>
            <span>Customers with evidence</span>
            <strong>
              {matched}
              <small>of {customers.length} customers</small>
            </strong>
          </div>
          <div>
            <span>Needs review</span>
            <strong>
              {reviewCount}
              <small>rows or identities</small>
            </strong>
          </div>
        </section>
        <section className="workspace">
          <div className="workspace-top">
            <div className="tabs" role="tablist" aria-label="Results view">
              {["Customer paths", "Investors", "Customers", "Needs review"].map(
                (t) => (
                  <button
                    role="tab"
                    aria-selected={tab === t}
                    key={t}
                    onClick={() => setTab(t)}
                  >
                    {t}
                    <span>
                      {t === "Investors"
                        ? investors.length
                        : t === "Customers" || t === "Customer paths"
                          ? customers.length
                          : reviewCount}
                    </span>
                  </button>
                ),
              )}
            </div>
            <div className="workspace-actions">
              <button
                className="text-button"
                disabled={!evidence.length}
                onClick={() =>
                  download(
                    "investor-map.csv",
                    introExport(
                      customers,
                      evidence,
                      relationships,
                      preferences,
                    ),
                  )
                }
              >
                <Download size={14} />
                Export
              </button>
              <button className="text-button" onClick={reset}>
                <RotateCcw size={14} />
                Clear session
              </button>
            </div>
          </div>
          <div className="result-toolbar">
            <span>
              {tab === "Customer paths"
                ? "Investors, grouped by the customer who could introduce you"
                : tab === "Investors"
                  ? "Investor index · compare different customer routes"
                  : tab === "Customers"
                    ? "Your customer companies"
                    : "Import rows and company identities to review"}
            </span>
            <label className="search">
              <Search size={15} />
              <input
                aria-label="Search results"
                placeholder="Search names or domains"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          {tab === "Customer paths" &&
            (customers.length ? (
              <CustomerPaths
                customers={customers}
                evidence={evidence}
                research={research}
                progress={researchProgress}
                relationships={relationships}
                preferences={preferences}
                query={query}
                onRelationship={(domain, value) =>
                  setRelationships((prev) => ({ ...prev, [domain]: value }))
                }
                onPreference={(key, value) =>
                  setPreferences((prev) => ({ ...prev, [key]: value }))
                }
                onEvidence={(customer) => {
                  setAddingEvidence(customer);
                  setTimeout(
                    () =>
                      document
                        .querySelector('[aria-label="Add investor evidence"]')
                        ?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        }),
                    0,
                  );
                }}
                onResearch={showResearch}
              />
            ) : (
              <div className="empty">
                <div className="empty-art">
                  <span>
                    <Building2 size={25} />
                  </span>
                  <i />
                  <span>
                    <GitFork size={25} />
                  </span>
                </div>
                <h2>Your network starts with your customers.</h2>
                <p>
                  Add your customer companies. Identify your happiest customers.
                  <br />
                  Then map their investors into possible warm introduction
                  paths.
                </p>
                <button
                  className="text-button green"
                  disabled={!ready}
                  onClick={() => setEntering(true)}
                >
                  Add your first customer <ArrowRight size={15} />
                </button>
                <div className="empty-note">
                  <ShieldCheck size={14} />
                  No inferred investors. Every match needs a source.
                </div>
              </div>
            ))}
          {tab === "Investors" &&
            (investors.length === 0 ? (
              <div className="empty">
                <div className="empty-art">
                  <span>
                    <Building2 size={25} />
                  </span>
                  <i />
                  <span>
                    <GitFork size={25} />
                  </span>
                </div>
                <h2>Your network starts with your customers.</h2>
                <p>
                  Upload your customer list, then research its investors.
                  <br />
                  Your investor connections will appear here.
                </p>
                <button
                  className="text-button green"
                  onClick={() =>
                    customers.length
                      ? evidenceRef.current?.click()
                      : crmRef.current?.click()
                  }
                >
                  {customers.length
                    ? "Add your research"
                    : "Upload your first CRM export"}
                  <ArrowRight size={15} />
                </button>
                <div className="empty-note">
                  <ShieldCheck size={14} />
                  No inferred investors. Every match needs a source.
                </div>
              </div>
            ) : (
              <div className="investor-list">
                {filteredInvestors.length === 0 && <p>No matching results.</p>}
                {filteredInvestors.map((inv) => (
                  <article className="investor-result" key={inv.name}>
                    <div className="investor-title">
                      <span className="result-icon">
                        <GitFork size={20} />
                      </span>
                      <div>
                        <h2>{inv.name}</h2>
                        <span>
                          {inv.domains.size} distinct matched customer
                          {inv.domains.size === 1 ? "" : "s"}
                        </span>
                      </div>
                      <span className="badge">
                        Source-backed · not independently verified
                      </span>
                    </div>
                    {[...inv.domains].map((domain) => (
                      <div className="connection" key={domain}>
                        <div className="connection-path">
                          <span>Founder</span>
                          <ChevronRight size={14} />
                          <strong>
                            {customers.find((c) => c.domain === domain)?.name}
                          </strong>
                          <ChevronRight size={14} />
                          <span>{inv.name}</span>
                        </div>
                        <p className="muted">
                          {domain} · Possible introduction path, ask your
                          customer
                        </p>
                        <EvidenceSources
                          sources={inv.sources.filter(
                            (e) => e.domain === domain,
                          )}
                        />
                      </div>
                    ))}
                    <p className="result-disclaimer">
                      Not independently verified. Funding evidence does not
                      prove an introduction is available.
                    </p>
                  </article>
                ))}
                <p className="muted">
                  Sorted by distinct customer count. Count does not indicate
                  investment fit.
                </p>
              </div>
            ))}
          {tab === "Customers" && (
            <div className="customer-list">
              {!customers.length && (
                <div className="compact-empty">
                  No customers yet. Upload a CRM export to get started.
                </div>
              )}
              {customers
                .filter((c) =>
                  `${c.name} ${c.domain}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((c) => (
                  <article className="customer-row" key={c.domain}>
                    <span className="result-icon">
                      <Building2 size={19} />
                    </span>
                    <div>
                      <h3>{c.name}</h3>
                      <span className="muted">{c.domain}</span>
                    </div>
                    <span className="status-label">
                      {customerStatus(c, evidence, research)}
                    </span>
                    {!evidence.some((e) => e.domain === c.domain) && (
                      <button
                        className="text-button"
                        onClick={() =>
                          setResearch((prev) =>
                            prev.some((r) => r.domain === c.domain)
                              ? prev.filter((r) => r.domain !== c.domain)
                              : [
                                  ...prev,
                                  {
                                    domain: c.domain,
                                    reviewed: new Date()
                                      .toISOString()
                                      .slice(0, 10),
                                  },
                                ],
                          )
                        }
                      >
                        {research.some((r) => r.domain === c.domain)
                          ? "Undo research status"
                          : "Mark researched"}
                      </button>
                    )}
                  </article>
                ))}
              {!!customers.length && (
                <p className="list-note">
                  Mark researched only after checking sources. “No evidence in
                  imported dataset” does not mean no investors exist.
                </p>
              )}
            </div>
          )}
          {tab === "Needs review" && (
            <div className="review-list">
              {!reviewCount ? (
                <div className="compact-empty">
                  <Check size={22} /> No unresolved import rows.
                </div>
              ) : (
                <>
                  <p>
                    These rows were excluded. Correct the original CSV and
                    reimport it. Row numbers refer to CSV records, including the
                    header.
                  </p>
                  {automaticReviews
                    .filter((c) =>
                      `${c.name} ${c.domain}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((c) => (
                      <div className="issue" key={c.domain}>
                        <strong>{c.name}</strong>
                        <span>
                          {c.domain} · {researchProgress[c.domain].message}
                        </span>
                      </div>
                    ))}
                  {issues
                    .filter(
                      (i) =>
                        i.reason.toLowerCase().includes(query.toLowerCase()) ||
                        String(i.line).includes(query),
                    )
                    .map((i, n) => (
                      <div className="issue" key={n}>
                        <strong>Row {i.line}</strong>
                        <span>{i.reason}</span>
                      </div>
                    ))}
                </>
              )}
            </div>
          )}
        </section>
        <aside className="privacy-note">
          <LockKeyhole size={16} />
          <p>
            <strong>Your CSV stays in your browser.</strong> Only opt-in company
            research reaches our server and research providers. No app accounts,
            database, analytics, or persistent storage. Clear session removes
            this page’s data, not provider records.
          </p>
          <span>PRIVATE BY DEFAULT</span>
        </aside>
        <footer>
          <span>Customer Investor Map</span>
          <span>Evidence first. Introductions second.</span>
          <button className="text-button" onClick={() => setGuide(!guide)}>
            About the data <ArrowUpRight size={12} />
          </button>
        </footer>
      </main>
    </>
  );
}
