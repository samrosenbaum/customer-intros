import { useState } from "react";
import { Building2, ChevronRight, Plus, Star } from "lucide-react";
import {
  customerStatus,
  groupCustomerPaths,
  pathKey,
  type Customer,
  type Evidence,
  type Research,
  type CustomerRelationship,
  type IntroReadiness,
  type PathPreference,
} from "../data";
import type { ResearchProgress } from "./ResearchPanel";
import { EvidenceSources } from "./EvidenceSources";
export function CustomerPaths({
  customers,
  evidence,
  research,
  progress,
  relationships,
  preferences,
  query,
  onRelationship,
  onPreference,
  onEvidence,
  onResearch,
}: {
  customers: Customer[];
  evidence: Evidence[];
  research: Research[];
  progress: Record<string, ResearchProgress>;
  relationships: Record<string, CustomerRelationship>;
  preferences: Record<string, PathPreference>;
  query: string;
  onRelationship: (domain: string, value: CustomerRelationship) => void;
  onPreference: (key: string, value: PathPreference) => void;
  onEvidence: (customer: Customer) => void;
  onResearch: () => void;
}) {
  const [shortlistedOnly, setShortlistedOnly] = useState(false);
  const groups = groupCustomerPaths(customers, evidence, relationships)
    .map((g) => ({
      ...g,
      investors: g.investors.filter(
        (i) =>
          (!shortlistedOnly ||
            preferences[pathKey(g.customer.domain, i.name)]?.shortlisted) &&
          `${g.customer.name} ${g.customer.domain} ${i.name}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    }))
    .filter((g) =>
      shortlistedOnly
        ? g.investors.length > 0
        : g.investors.length > 0 ||
          `${g.customer.name} ${g.customer.domain}`
            .toLowerCase()
            .includes(query.toLowerCase()),
    );
  return (
    <div className="customer-paths">
      <div className="paths-intro">
        <p>
          <strong>Start with customers who love your product.</strong>
          <br />
          Happy customers may be your strongest advocates. Record what you know;
          funding alone never confirms an introduction.
        </p>
        <button
          className={`filter-button ${shortlistedOnly ? "active" : ""}`}
          aria-pressed={shortlistedOnly}
          onClick={() => setShortlistedOnly(!shortlistedOnly)}
        >
          <Star size={13} />
          Shortlisted only
        </button>
      </div>
      {groups.length === 0 && (
        <p className="compact-empty">
          {shortlistedOnly
            ? "No shortlisted introductions yet. Save a sourced path below."
            : "No customers or investors match your search."}
        </p>
      )}
      {groups.map((g) => (
        <article className="customer-path-card" key={g.customer.domain}>
          <header className="customer-path-header">
            <span className="result-icon">
              <Building2 size={21} />
            </span>
            <div>
              <h2>{g.customer.name}</h2>
              <span className="muted">
                {g.customer.domain} · {g.investors.length} investor
                {g.investors.length === 1 ? "" : "s"}
                {shortlistedOnly ? " shortlisted" : ""}
              </span>
            </div>
            <label className="relationship-label">
              Your customer relationship
              <select
                aria-label={`Relationship with ${g.customer.name}`}
                value={g.relationship}
                onChange={(e) =>
                  onRelationship(
                    g.customer.domain,
                    e.target.value as CustomerRelationship,
                  )
                }
              >
                <option value="unknown">Not assessed</option>
                <option value="happy">Happy customer</option>
                <option value="not-ready">Not ready to ask</option>
              </select>
            </label>
          </header>
          {g.investors.length > 0 ? (
            <div className="customer-investors">
              {g.investors.map((i) => {
                const key = pathKey(g.customer.domain, i.name),
                  p = preferences[key] ?? {
                    readiness: "unconfirmed" as const,
                    shortlisted: false,
                  };
                return (
                  <section className="customer-investor" key={key}>
                    <div className="path-investor-title">
                      <h3>{i.name}</h3>
                      <button
                        className="text-button shortlist-button"
                        aria-pressed={p.shortlisted}
                        aria-label={`${p.shortlisted ? "Remove" : "Shortlist"} ${i.name} via ${g.customer.name}`}
                        onClick={() =>
                          onPreference(key, {
                            ...p,
                            shortlisted: !p.shortlisted,
                          })
                        }
                      >
                        <Star
                          size={15}
                          fill={p.shortlisted ? "currentColor" : "none"}
                        />
                        {p.shortlisted ? "Shortlisted" : "Shortlist"}
                      </button>
                    </div>
                    <div className="connection-path">
                      <span>Founder</span>
                      <ChevronRight size={13} />
                      <strong>{g.customer.name}</strong>
                      <ChevronRight size={13} />
                      <span>{i.name}</span>
                    </div>
                    <p className="muted">
                      Possible introduction path, ask your customer
                    </p>
                    <label className="readiness-label">
                      Introduction readiness <span>· reported by you</span>
                      <select
                        aria-label={`Introduction readiness for ${i.name} via ${g.customer.name}`}
                        value={p.readiness}
                        onChange={(e) =>
                          onPreference(key, {
                            ...p,
                            readiness: e.target.value as IntroReadiness,
                          })
                        }
                      >
                        <option value="unconfirmed">
                          Not confirmed with customer
                        </option>
                        <option value="knows-investor">
                          Customer says they know this investor
                        </option>
                        <option value="can-introduce">
                          Customer says they can introduce us
                        </option>
                      </select>
                    </label>
                    <details className="evidence-details" open>
                      <summary>
                        {i.sources.length} source
                        {i.sources.length === 1 ? "" : "s"} · source-backed, not
                        independently verified
                      </summary>
                      <EvidenceSources sources={i.sources} />
                    </details>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="unresearched">
              <strong>
                {progress[g.customer.domain]?.status === "needs-review"
                  ? "Needs review"
                  : progress[g.customer.domain]?.status === "failed"
                    ? "Research failed"
                    : progress[g.customer.domain]?.status === "researching"
                      ? "Researching…"
                      : progress[g.customer.domain]?.status === "queued"
                        ? "Queued for research"
                        : progress[g.customer.domain]?.status === "cancelled"
                          ? "Research cancelled"
                          : customerStatus(g.customer, evidence, research)}
              </strong>
              <p>
                {progress[g.customer.domain]?.message ||
                  (research.some((r) => r.domain === g.customer.domain)
                    ? "No evidence has been added for this company. This does not mean it has no investors."
                    : "Funding research is needed before we can show investors. No investors are inferred from the company name.")}
              </p>
              <button className="secondary" onClick={onResearch}>
                Research customers
              </button>
            </div>
          )}
          <div className="path-card-footer">
            <span>
              Relationship and readiness labels are your assessment, not app
              verification.
            </span>
            <button
              className="text-button"
              onClick={() => onEvidence(g.customer)}
            >
              <Plus size={13} />
              Add investor evidence
            </button>
          </div>
        </article>
      ))}
      <p className="list-note">
        Grouped by customer. Customers with evidence appear first, with happy
        customers prioritized within that group. No investment-fit score or
        guaranteed introduction is implied.
      </p>
    </div>
  );
}
