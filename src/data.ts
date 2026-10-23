import Papa from "papaparse";
export type Row = { line: number; cells: string[]; error?: string };
export type Sheet = { headers: string[]; rows: Row[] };
export type Customer = { name: string; domain: string };
export type Issue = { line: number; reason: string };
export type Evidence = {
  domain: string;
  investor: string;
  url: string;
  title: string;
  date: string;
  reviewed: string;
  notes: string;
  origin?: "automated-research";
  excerpt?: string;
};
export type Research = {
  domain: string;
  reviewed: string;
  status?: "no-evidence";
  message?: string;
};
export type ImportResult<T> = {
  records: T[];
  issues: Issue[];
  duplicates: number;
};
export function parseCSV(text: string): Sheet {
  const p = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
  });
  if (p.errors.some((e) => e.row === 0))
    throw new Error("Malformed CSV header. Check quotation marks.");
  const headers = p.data.shift() ?? [];
  if (!headers.length || !p.data.length)
    throw new Error("Include a header row and at least one data row.");
  return {
    headers,
    rows: p.data.map((cells, i) => ({
      line: i + 2,
      cells,
      error:
        p.errors
          .filter((e) => e.row === i + 1)
          .map((e) => e.message)
          .join("; ") ||
        (cells.length !== headers.length
          ? "Column count does not match the header."
          : undefined),
    })),
  };
}
export function domainOf(value: string): string | null {
  const raw = value.trim();
  if (!raw || /[\s\\@]/.test(raw)) return null;
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (
      !["https:", "http:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.port ||
      host.length > 253 ||
      !host.includes(".") ||
      /^\d+(\.\d+){3}$/.test(host) ||
      !host
        .split(".")
        .every((x) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x)) ||
      !/^[a-z]{2,63}$/.test(host.split(".").at(-1)!)
    )
      return null;
    return host;
  } catch {
    return null;
  }
}
export function evidenceURL(value: string): string | null {
  try {
    const u = new URL(value.trim());
    return ["https:", "http:"].includes(u.protocol) &&
      !!u.hostname &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function customersFrom(
  sheet: Sheet,
  nameCol: number,
  domainCol: number,
): ImportResult<Customer> {
  const records: Customer[] = [],
    issues: Issue[] = [];
  let duplicates = 0;
  const seen = new Set<string>();
  const namesByDomain = new Map<string, Set<string>>();
  for (const row of sheet.rows) {
    const domain = domainOf(row.cells[domainCol] ?? ""),
      name = row.cells[nameCol]?.trim().toLowerCase().replace(/\s+/g, " ");
    if (!row.error && domain && name) {
      const names = namesByDomain.get(domain) ?? new Set<string>();
      names.add(name);
      namesByDomain.set(domain, names);
    }
  }
  for (const row of sheet.rows) {
    const name = row.cells[nameCol]?.trim(),
      domain = domainOf(row.cells[domainCol] ?? "");
    if (row.error || !name || !domain) {
      issues.push({
        line: row.line,
        reason:
          row.error ||
          (!name
            ? "Missing company name. Needs review."
            : "Missing or invalid domain. Name-only matching is not allowed. Needs review."),
      });
      continue;
    }
    if (namesByDomain.get(domain)!.size > 1) {
      issues.push({
        line: row.line,
        reason:
          "Conflicting company names share this domain. Resolve the identity before importing. Needs review.",
      });
      continue;
    }
    if (seen.has(domain)) {
      duplicates++;
      continue;
    }
    seen.add(domain);
    records.push({ name, domain });
  }
  return { records, issues, duplicates };
}
const dateValid = (s: string) =>
  !s ||
  (/^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s &&
    s <= new Date().toISOString().slice(0, 10));
export function evidenceFrom(
  sheet: Sheet,
  customers: Customer[],
): ImportResult<Evidence> {
  const required = [
    "customer domain",
    "investor name",
    "evidence url",
    "source title",
    "source date",
    "reviewed date",
  ];
  const normalized = sheet.headers.map((h) => h.trim().toLowerCase());
  for (const h of required)
    if (normalized.filter((x) => x === h).length !== 1)
      throw new Error(
        `Require exactly one “${h}” column. Download the evidence template.`,
      );
  const customerDomains = new Set(customers.map((c) => c.domain));
  const get = (r: Row, h: string) =>
    r.cells[normalized.indexOf(h)]?.trim() ?? "";
  const records: Evidence[] = [],
    issues: Issue[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const r of sheet.rows) {
    const domain = domainOf(get(r, "customer domain")),
      investor = get(r, "investor name"),
      url = evidenceURL(get(r, "evidence url")),
      title = get(r, "source title"),
      date = get(r, "source date"),
      reviewed = get(r, "reviewed date");
    let reason = r.error;
    if (!reason && (!domain || !customerDomains.has(domain)))
      reason =
        "Domain does not exactly match an imported customer. Needs review.";
    if (!reason && (!investor || !url || !title))
      reason =
        "Investor, source title and an HTTP(S) evidence URL are required.";
    if (!reason && (!dateValid(date) || !dateValid(reviewed)))
      reason = "Dates must be real, non-future YYYY-MM-DD dates, or blank.";
    if (reason) {
      issues.push({ line: r.line, reason });
      continue;
    }
    const key = JSON.stringify([
      domain,
      investor.toLocaleLowerCase(),
      url,
      date,
      reviewed,
    ]);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    records.push({
      domain: domain!,
      investor,
      url: url!,
      title,
      date,
      reviewed,
      notes: [get(r, "round"), get(r, "notes")].filter(Boolean).join(" · "),
    });
  }
  return { records, issues, duplicates };
}
export function rankInvestors(evidence: Evidence[]) {
  const groups = new Map<
    string,
    { name: string; domains: Set<string>; sources: Evidence[] }
  >();
  for (const e of evidence) {
    const k = e.investor.trim().toLocaleLowerCase();
    const g = groups.get(k) ?? {
      name: e.investor,
      domains: new Set<string>(),
      sources: [],
    };
    g.domains.add(e.domain);
    g.sources.push(e);
    groups.set(k, g);
  }
  return [...groups.values()].sort(
    (a, b) => b.domains.size - a.domains.size || a.name.localeCompare(b.name),
  );
}
export function customerStatus(
  c: Customer,
  evidence: Evidence[],
  research: Research[],
) {
  return evidence.some((e) => e.domain === c.domain)
    ? "Source-backed match"
    : research.some((r) => r.domain === c.domain)
      ? "No evidence in imported dataset"
      : "Not yet researched";
}
export function safeCSV(rows: string[][]) {
  return Papa.unparse(
    rows.map((r) =>
      r.map((v) => (/^[\s]*[=+\-@\t\r\n]/.test(v) ? `'${v}` : v)),
    ),
  );
}
// A future adapter must be explicitly enabled, disclose its destination, and receive only confirmed company identities.
export interface LookupAdapter {
  id: string;
  label: string;
  lookup(
    customers: readonly Customer[],
    signal?: AbortSignal,
  ): Promise<{ evidence: Evidence[]; research: Research[]; issues: Issue[] }>;
}
export const manualSource = {
  id: "researcher-import",
  label: "Researcher-supplied evidence CSV",
};

export type CustomerRelationship = "unknown" | "happy" | "not-ready";
export type IntroReadiness = "unconfirmed" | "knows-investor" | "can-introduce";
export type PathPreference = {
  readiness: IntroReadiness;
  shortlisted: boolean;
};
export const pathKey = (domain: string, investor: string) =>
  JSON.stringify([domain, investor.trim().toLowerCase()]);
export function groupCustomerPaths(
  customers: Customer[],
  evidence: Evidence[],
  relationships: Record<string, CustomerRelationship> = {},
) {
  return customers
    .map((customer) => ({
      customer,
      relationship: relationships[customer.domain] ?? "unknown",
      investors: rankInvestors(
        evidence.filter((e) => e.domain === customer.domain),
      ),
    }))
    .sort(
      (a, b) =>
        Number(b.investors.length > 0) - Number(a.investors.length > 0) ||
        { happy: 0, unknown: 1, "not-ready": 2 }[a.relationship] -
          { happy: 0, unknown: 1, "not-ready": 2 }[b.relationship] ||
        a.customer.name.localeCompare(b.customer.name),
    );
}
export function introExport(
  customers: Customer[],
  evidence: Evidence[],
  relationships: Record<string, CustomerRelationship>,
  preferences: Record<string, PathPreference>,
) {
  return safeCSV([
    [
      "customer name",
      "customer domain",
      "customer relationship (founder reported)",
      "investor",
      "introduction readiness (founder reported)",
      "shortlisted",
      "evidence URL",
      "source title",
      "source date",
      "researcher reviewed date",
      "evidence origin",
      "supporting passage",
    ],
    ...groupCustomerPaths(customers, evidence, relationships).flatMap((g) =>
      g.investors.flatMap((i) =>
        i.sources.map((e) => {
          const p = preferences[pathKey(g.customer.domain, i.name)];
          return [
            g.customer.name,
            g.customer.domain,
            g.relationship,
            i.name,
            p?.readiness ?? "unconfirmed",
            p?.shortlisted ? "yes" : "no",
            e.url,
            e.title,
            e.date,
            e.reviewed,
            e.origin === "automated-research"
              ? "machine-extracted; not independently verified"
              : "researcher-supplied",
            e.excerpt ?? "",
          ];
        }),
      ),
    ),
  ]);
}
