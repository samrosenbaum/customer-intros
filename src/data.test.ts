import { describe, expect, it } from "vitest";
import {
  groupCustomerPaths,
  pathKey,
  introExport,
  customersFrom,
  domainOf,
  evidenceFrom,
  evidenceURL,
  parseCSV,
  rankInvestors,
  safeCSV,
  customerStatus,
  type Evidence,
} from "./data";
const customers = [
  { name: "Cedar", domain: "cedar.test" },
  { name: "Birch", domain: "birch.test" },
];
const header =
  "customer domain,investor name,evidence URL,source title,source date,reviewed date,round,notes\n";
const source = (
  domain = "cedar.test",
  investor = "Fund A",
  url = "https://sources.test/a",
): Evidence => ({
  domain,
  investor,
  url,
  title: "Announcement",
  date: "2024-01-01",
  reviewed: "",
  notes: "",
});
describe("CSV and identity boundary", () => {
  it("handles BOM, quoted commas, embedded newlines, blank records and quotes", () => {
    const s = parseCSV(
      '\uFEFFName,Website,Other\r\n"Cedar, Inc.",https://www.cedar.test/path,"One\nTwo"\r\n\r\n"A ""quoted"" name",birch.test,x',
    );
    expect(s.rows).toHaveLength(2);
    expect(s.rows[0].cells).toEqual([
      "Cedar, Inc.",
      "https://www.cedar.test/path",
      "One\nTwo",
    ]);
    expect(s.rows[1].cells[0]).toBe('A "quoted" name');
  });
  it("preserves duplicate headers by position and projects only mapped fields", () => {
    const r = customersFrom(
      parseCSV(
        "name,name,domain,email\nWrong,Cedar,cedar.test,private@example.test",
      ),
      1,
      2,
    );
    expect(r.records).toEqual([customers[0]]);
    expect(JSON.stringify(r)).not.toContain("private@");
  });
  it("retains valid rows while reporting missing columns, name-only rows and malformed rows", () => {
    const r = customersFrom(
      parseCSV(
        "name,domain\nCedar,cedar.test\nUnknown,\nMissing\nExtra,birch.test,unexpected",
      ),
      0,
      1,
    );
    expect(r.records).toEqual([customers[0]]);
    expect(r.issues.map((x) => x.line)).toEqual([3, 4, 5]);
  });
  it("rejects empty or broken header files", () => {
    expect(() => parseCSV("name,domain\n")).toThrow();
    expect(() => parseCSV('"name,domain\nx,y')).toThrow();
  });
  it.each([
    "localhost",
    "http://",
    "https://127.0.0.1",
    "https://user:pass@cedar.test",
    "javascript:alert(1)",
    "a..test",
    "-bad.test",
    "foo .test",
    "ftp://cedar.test",
    "cedar.test:8080",
    "cedar_test.com",
  ])("rejects invalid company identity %s", (v) =>
    expect(domainOf(v)).toBeNull(),
  );
  it("normalizes URL host but never merges subdomains or unrelated domains", () => {
    expect(domainOf("HTTPS://WWW.CEDAR.TEST/path?q=1")).toBe("cedar.test");
    expect(domainOf("sales.cedar.test")).toBe("sales.cedar.test");
    const r = customersFrom(
      parseCSV(
        "name,domain\nCedar,www.cedar.test\nCedar,https://cedar.test/path\nCedar,birch.test",
      ),
      0,
      1,
    );
    expect(r.records).toHaveLength(2);
    expect(r.duplicates).toBe(1);
  });
  it("quarantines ambiguous domain identities instead of choosing a company", () => {
    const r = customersFrom(
      parseCSV("name,domain\nOne,cedar.test\nTwo,cedar.test\nBirch,birch.test"),
      0,
      1,
    );
    expect(r.records).toEqual([customers[1]]);
    expect(r.issues).toHaveLength(2);
  });
});
describe("evidence import", () => {
  it("requires exact domains, URL and title; keeps valid records", () => {
    const r = evidenceFrom(
      parseCSV(
        header +
          "cedar.test,Fund A,https://source.test/a,Title,2024-01-01,,,\ncedar.test,Fund B,,Title,,,,\nunknown.test,Fund C,https://source.test/c,Title,,,,\ncedar.test,Fund D,javascript:alert(1),Title,,,,",
      ),
      customers,
    );
    expect(r.records).toHaveLength(1);
    expect(r.issues).toHaveLength(3);
    expect(r.records[0].reviewed).toBe("");
  });
  it("does not treat a syntactically valid URL as proof", () => {
    expect(evidenceURL("https://unverified.test/post")).toBeTruthy();
    expect(evidenceURL("data:text/html,bad")).toBeNull();
    expect(evidenceURL("https://user:pass@source.test")).toBeNull();
  });
  it("rejects missing and duplicate evidence headers", () => {
    expect(() =>
      evidenceFrom(parseCSV("domain,name\ncedar.test,Fund"), customers),
    ).toThrow();
    expect(() =>
      evidenceFrom(
        parseCSV(
          header.replace("notes", "investor name") +
            "cedar.test,Fund,https://source.test,Title,,,,",
        ),
        customers,
      ),
    ).toThrow();
  });
  it("rejects invalid/future dates without dropping other valid rows", () => {
    const r = evidenceFrom(
      parseCSV(
        header +
          "cedar.test,Fund,https://source.test,Title,2025-02-30,,,\ncedar.test,Fund,https://source.test,Title,,2999-01-01,,\ncedar.test,Fund,https://source.test,Title,,,,",
      ),
      customers,
    );
    expect(r.records).toHaveLength(1);
    expect(r.issues).toHaveLength(2);
  });
  it("deduplicates identical evidence rows", () => {
    const row = "cedar.test,Fund,https://source.test,Title,,,,\n";
    const r = evidenceFrom(parseCSV(header + row + row), customers);
    expect(r.records).toHaveLength(1);
    expect(r.duplicates).toBe(1);
  });
  it("ranks distinct customers rather than sources and keeps multiple sources", () => {
    const ranked = rankInvestors([
      source(),
      source("cedar.test", "Fund A", "https://sources.test/b"),
      source("cedar.test", "Fund B"),
      source("birch.test", "fund b"),
    ]);
    expect(ranked.map((i) => i.name)).toEqual(["Fund B", "Fund A"]);
    expect(ranked[0].domains.size).toBe(2);
    expect(ranked[1].sources).toHaveLength(2);
  });
  it("distinguishes missing evidence from research not performed", () => {
    expect(customerStatus(customers[0], [], [])).toBe("Not yet researched");
    expect(
      customerStatus(
        customers[0],
        [],
        [{ domain: "cedar.test", reviewed: "2024-01-01" }],
      ),
    ).toBe("No evidence in imported dataset");
    expect(customerStatus(customers[0], [source()], [])).toBe(
      "Source-backed match",
    );
  });
  it("protects spreadsheet formulas including whitespace prefixes", () => {
    const values = [
      '=HYPERLINK("x")',
      " +SUM(1)",
      "-1",
      "@bad",
      "\tbad",
      "normal",
    ];
    const parsed = parseCSV("value\n" + safeCSV(values.map((x) => [x])));
    expect(
      parsed.rows.slice(0, 5).every((r) => r.cells[0].startsWith("'")),
    ).toBe(true);
    expect(parsed.rows[5].cells[0]).toBe("normal");
  });
  it("starts with no evidence or demo records", () => {
    expect(rankInvestors([])).toEqual([]);
    expect(
      evidenceFrom(
        parseCSV(
          header +
            "cedar.test,Fictional Fund,,fictional example no evidence,,,,",
        ),
        customers,
      ).records,
    ).toEqual([]);
  });
});

describe("customer-first introduction planning", () => {
  it("groups distinct investors beneath each customer, retaining every source", () => {
    const groups = groupCustomerPaths(customers, [
      source(),
      source("cedar.test", "fund a", "https://sources.test/b"),
      source("cedar.test", "Fund B"),
      source("birch.test", "Fund A"),
    ]);
    const cedar = groups.find((g) => g.customer.domain === "cedar.test")!;
    expect(cedar.investors).toHaveLength(2);
    expect(cedar.investors[0].sources).toHaveLength(2);
    expect(
      groups.find((g) => g.customer.domain === "birch.test")!.investors,
    ).toHaveLength(1);
  });
  it("keeps unresearched customers visible and never infers customer happiness or introduction readiness", () => {
    const groups = groupCustomerPaths(customers, [source()]);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.relationship === "unknown")).toBe(true);
    expect(groups[1].investors).toEqual([]);
  });
  it("prioritizes founder-reported happy customers among sourced customers, not number of sources", () => {
    const groups = groupCustomerPaths(
      customers,
      [source(), source("birch.test", "Fund A")],
      { "birch.test": "happy" },
    );
    expect(groups[0].customer.domain).toBe("birch.test");
  });
  it("keeps introduction preferences distinct per customer/investor pair", () => {
    expect(pathKey("cedar.test", "Fund A")).toBe(
      pathKey("cedar.test", "fund a"),
    );
    expect(pathKey("cedar.test", "Fund A")).not.toBe(
      pathKey("birch.test", "Fund A"),
    );
  });
  it("exports customer grouping, user-reported readiness and protected names without assuming introductions", () => {
    const csv = introExport(
      [{ name: "=SUM(1)", domain: "cedar.test" }],
      [source()],
      { "cedar.test": "happy" },
      {
        [pathKey("cedar.test", "Fund A")]: {
          readiness: "can-introduce",
          shortlisted: true,
        },
      },
    );
    const row = parseCSV(csv).rows[0].cells;
    expect(row.slice(0, 6)).toEqual([
      "'=SUM(1)",
      "cedar.test",
      "happy",
      "Fund A",
      "can-introduce",
      "yes",
    ]);
    const unconfirmed = parseCSV(introExport(customers, [source()], {}, {}))
      .rows[0].cells;
    expect(unconfirmed[4]).toBe("unconfirmed");
  });
});
