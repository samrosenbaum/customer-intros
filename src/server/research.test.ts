import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  customerRequestSchema,
  type Extraction,
  type ResearchSource,
} from "../research-contract";
import {
  groundFindings,
  sourceMatchesDomain,
  researchCustomer,
  tavilySearch,
  researchConfig,
  ResearchError,
} from "./research";
import { createLimiter, handleResearch } from "./research-handler";
const customer = { name: "Cedar", domain: "cedar.io" };
const quote = "Cedar raised a seed funding round led by Oak Capital.";
const source: ResearchSource = {
  id: 0,
  url: "https://cedar.io/news/funding",
  title: "Funding announcement",
  content: `Published 2024-01-01. ${quote}`,
};
const extraction: Extraction = {
  identity: "matched",
  findings: [
    { investor: "Oak Capital", sourceId: 0, quote, sourceDate: "2024-01-01" },
  ],
};
const signal = () => new AbortController().signal;
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("source-grounded extraction", () => {
  it("returns a cited unreviewed machine finding, never a verified or intro-ready claim", () => {
    const r = groundFindings(customer, [source], extraction);
    expect(r.status).toBe("matches");
    expect(r.evidence[0]).toMatchObject({
      url: source.url,
      excerpt: quote,
      origin: "automated-research",
      reviewed: "",
      date: "2024-01-01",
    });
    expect(r.evidence[0]).not.toHaveProperty("readiness");
  });
  it("never trusts a name-only match", () => {
    const r = groundFindings(
      customer,
      [{ ...source, url: "https://news.io/article" }],
      extraction,
    );
    expect(r.status).toBe("needs-review");
    expect(r.evidence).toEqual([]);
  });
  it("accepts a literal domain in a third-party source, but not deceptive domain suffixes", () => {
    expect(
      sourceMatchesDomain(
        {
          ...source,
          url: "https://news.io/a",
          content: `Company website: www.cedar.io. ${quote}`,
        },
        customer.domain,
      ),
    ).toBe(true);
    for (const content of ["notcedar.io", "cedar.io.evil.com", "fake.cedar.io"])
      expect(
        sourceMatchesDomain(
          { ...source, url: "https://news.io/a", content },
          customer.domain,
        ),
      ).toBe(false);
  });
  it("withholds ambiguous identities even when investors are proposed", () => {
    expect(
      groundFindings(customer, [source], {
        ...extraction,
        identity: "ambiguous",
      }),
    ).toMatchObject({ status: "needs-review", evidence: [] });
  });
  it("rejects invented sources, quotes, investors, and passages without investment context", () => {
    for (const finding of [
      { ...extraction.findings[0], sourceId: 7 },
      {
        ...extraction.findings[0],
        quote: "A fictional passage says Oak Capital led a funding round.",
      },
      { ...extraction.findings[0], investor: "Different Fund" },
      {
        ...extraction.findings[0],
        quote: "Oak Capital is a customer and a partner.",
      },
    ]) {
      const r = groundFindings(
        customer,
        [
          {
            ...source,
            content:
              source.content + " Oak Capital is a customer and a partner.",
          },
        ],
        { identity: "matched", findings: [finding] },
      );
      expect(r.status).toBe("needs-review");
      expect(r.evidence).toEqual([]);
    }
  });
  it("does not infer publication dates or label retrieval time as publication", () => {
    const r = groundFindings(customer, [source], {
      ...extraction,
      findings: [{ ...extraction.findings[0], sourceDate: "2023-01-01" }],
    });
    expect(r.evidence[0].date).toBe("");
  });
  it("deduplicates findings while retaining distinct source passages", () => {
    const r = groundFindings(customer, [source], {
      identity: "matched",
      findings: [...extraction.findings, ...extraction.findings],
    });
    expect(r.evidence).toHaveLength(1);
  });
  it("preserves limited-search missing-data semantics", () => {
    expect(
      groundFindings(customer, [source], { identity: "matched", findings: [] }),
    ).toMatchObject({ status: "no-evidence", evidence: [] });
    expect(
      groundFindings(customer, [source], {
        identity: "not-found",
        findings: [],
      }).message,
    ).toContain("not an exhaustive");
  });
});
describe("bounded live-provider orchestration (offline test dependencies)", () => {
  it("runs two queries, deduplicates sources, and makes one extraction call", async () => {
    const search = vi.fn(async () => [source]);
    const extract = vi.fn(
      async (
        _customer: typeof customer,
        _sources: ResearchSource[],
        _signal: AbortSignal,
      ) => extraction,
    );
    const r = await researchCustomer(customer, signal(), { search, extract });
    expect(search).toHaveBeenCalledTimes(2);
    expect(extract).toHaveBeenCalledTimes(1);
    expect(extract.mock.calls[0][1]).toHaveLength(1);
    expect(r.status).toBe("matches");
  });
  it("skips model usage when search has no sources", async () => {
    const extract = vi.fn(async () => extraction);
    const r = await researchCustomer(customer, signal(), {
      search: async () => [],
      extract,
    });
    expect(extract).not.toHaveBeenCalled();
    expect(r.status).toBe("no-evidence");
  });
  it("does not convert provider failures to successful no-evidence outcomes", async () => {
    await expect(
      researchCustomer(customer, signal(), {
        search: async () => {
          throw new Error("failed");
        },
        extract: async () => extraction,
      }),
    ).rejects.toThrow("failed");
  });
  it("cancels before incurring provider work", async () => {
    const c = new AbortController();
    c.abort();
    const search = vi.fn(async () => []);
    await expect(
      researchCustomer(customer, c.signal, {
        search,
        extract: async () => extraction,
      }),
    ).rejects.toThrow();
    expect(search).not.toHaveBeenCalled();
  });
  it("uses basic Tavily search with fixed limits and strips invalid source URLs", async () => {
    vi.stubEnv("TAVILY_API_KEY", "unit-test-key");
    const fetchMock = vi.fn(async () =>
      Response.json({
        results: [
          { url: source.url, title: source.title, content: source.content },
          { url: "javascript:alert(1)", title: "bad", content: "bad" },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await tavilySearch("company query", signal());
    expect(r).toHaveLength(1);
    const [url, opts] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.tavily.com/search");
    expect(JSON.parse(opts.body as string)).toEqual({
      query: "company query",
      search_depth: "basic",
      max_results: 4,
      include_answer: false,
      include_raw_content: true,
    });
    expect(opts.cache).toBe("no-store");
  });
  it("handles quotas and malformed responses without leaking provider bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("sensitive provider payload", { status: 429 }),
      ),
    );
    await expect(tavilySearch("q", signal())).rejects.toThrow("quota");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ unexpected: "payload" })),
    );
    await expect(tavilySearch("q", signal())).rejects.toThrow(
      "unexpected response",
    );
  });
});
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/research", {
    method: "POST",
    headers: {
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
describe("research API privacy, cost and error boundaries", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("TAVILY_API_KEY", "unit-search");
    vi.stubEnv("AI_GATEWAY_API_KEY", "unit-gateway");
    vi.stubEnv("RESEARCH_ACCESS_TOKEN", "");
  });
  it("accepts only a strict projected identity and rejects extra CRM fields", async () => {
    const run = vi.fn(async () =>
      groundFindings(customer, [source], extraction),
    );
    for (const body of [
      { customer: { ...customer, email: "private@example.com" } },
      { customer, rawCSV: "private data" },
      { customers: [customer] },
      { customer: { name: "Cedar", domain: "www.cedar.io" } },
    ])
      expect((await handleResearch(request(body), run)).status).toBe(400);
    expect(run).not.toHaveBeenCalled();
    expect(customerRequestSchema.safeParse({ customer }).success).toBe(true);
  });
  it("rejects example identities, uploads, cross-origin calls and oversized bodies without running research", async () => {
    const run = vi.fn();
    expect(
      (
        await handleResearch(
          request({ customer: { name: "Demo", domain: "demo.example" } }),
          run,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleResearch(
          request({ customer }, { "Content-Type": "text/csv" }),
          run,
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await handleResearch(
          request({ customer }, { Origin: "https://other.example" }),
          run,
        )
      ).status,
    ).toBe(403);
    expect(
      (await handleResearch(request({ rawCSV: "x".repeat(5000) }), run)).status,
    ).toBe(413);
    expect(run).not.toHaveBeenCalled();
  });
  it("fails closed with missing credentials, before provider calls", async () => {
    vi.stubEnv("TAVILY_API_KEY", "");
    const run = vi.fn();
    const r = await handleResearch(request({ customer }), run);
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({
      code: "not-configured",
      missing: ["TAVILY_API_KEY"],
    });
    expect(run).not.toHaveBeenCalled();
  });
  it("requires a production access code and never exposes secrets in configuration", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(researchConfig().enabled).toBe(false);
    vi.stubEnv("RESEARCH_ACCESS_TOKEN", "private-test-token-long-enough");
    const config = researchConfig();
    expect(config.enabled).toBe(true);
    expect(config.requiresAccessCode).toBe(true);
    expect(JSON.stringify(config)).not.toContain("private-test-token");
  });
  it("checks the access code before using paid providers", async () => {
    vi.stubEnv("RESEARCH_ACCESS_TOKEN", "private-test-token-long-enough");
    const run = vi.fn(
      async (_customer: typeof customer, _signal: AbortSignal) =>
        groundFindings(customer, [source], extraction),
    );
    expect((await handleResearch(request({ customer }), run)).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
    const response = await handleResearch(
      request(
        { customer },
        { "x-research-access-code": "private-test-token-long-enough" },
      ),
      run,
      () => true,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(run.mock.calls[0][0]).toEqual(customer);
  });
  it("rate-limits before calling providers", async () => {
    const run = vi.fn();
    expect(
      (await handleResearch(request({ customer }), run, () => false)).status,
    ).toBe(429);
    expect(run).not.toHaveBeenCalled();
    const limit = createLimiter(2, 100);
    expect([limit(0), limit(1), limit(2), limit(101)]).toEqual([
      true,
      true,
      false,
      true,
    ]);
  });
  it("returns safe errors without provider payloads or credentials", async () => {
    const response = await handleResearch(
      request({ customer }),
      async () => {
        throw new Error("SECRET PROVIDER BODY");
      },
      () => true,
    );
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("SECRET");
    const quota = await handleResearch(
      request({ customer }),
      async () => {
        throw new ResearchError("search-unavailable", "Check search usage.");
      },
      () => true,
    );
    expect(await quota.json()).toMatchObject({ code: "search-unavailable" });
  });
});

describe("Next.js host forwarding", () => {
  it("accepts same-host browser Origin when Next uses a different internal URL", async () => {
    vi.stubEnv("TAVILY_API_KEY", "");
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("RESEARCH_ACCESS_TOKEN", "");
    const r = await handleResearch(
      new Request("http://0.0.0.0:3000/api/research", {
        method: "POST",
        headers: {
          Host: "127.0.0.1:3000",
          Origin: "http://127.0.0.1:3000",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ customer }),
      }),
    );
    expect(r.status).toBe(503);
  });
});
