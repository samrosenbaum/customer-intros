# Customer Investor Map

A simple founder workspace: **add customers → research who invested in them → review investors grouped by the customer who might introduce you**. Next.js App Router, TypeScript, React, Geist, Vercel AI SDK + AI Gateway, and Tavily Search. Mobile-friendly, with no emojis, accounts, database, analytics, CRM connection, or persistent application data.

Funding evidence is not proof that a customer knows an investor or can introduce you. Customer happiness and introduction readiness are always founder-reported, separate from funding research.

## Try the frontend locally

Use Node.js 24 LTS (22+ also satisfies the installed AI SDK). From this checkout:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Next.js prints the local address (port 3000 by default). The **entire customer import, manual evidence entry/import, grouping, shortlist and export UI works without any provider keys**. Research displays a configuration message until real keys are available; there is no mock lookup or demo-data fallback. If the default npm cache is not writable, use `npm ci --cache /tmp/customer-map-npm`.

For a local production check:

```sh
npm run build
npm start
```

Stop with Ctrl-C. Use the existing checkout in isolated cloud tasks; do not create a worktree just for setup.

## Enable real research

Put these values in **server-side environment variables**, locally in the ignored `.env.local`, or in Vercel Project Settings → Environment Variables:

| Variable                  | Purpose                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `TAVILY_API_KEY`          | Tavily Search API access                                                                                                                       |
| `AI_GATEWAY_API_KEY`      | Vercel AI Gateway access                                                                                                                       |
| `AI_GATEWAY_MODEL`        | Optional; defaults to `openai/gpt-4.1-mini`. Use a Gateway model with structured-output support.                                               |
| `RESEARCH_ACCESS_TOKEN`   | A private access code of at least 20 characters, required in production. Enter it in the research panel, not a provider key. Optional locally. |
| `NEXT_TELEMETRY_DISABLED` | Set to `1` to disable Next.js CLI telemetry; the build script already does so.                                                                 |

Never use `NEXT_PUBLIC_` for credentials, put keys in the UI, or commit `.env.local`. Generate a random private workspace access code locally, for example `openssl rand -hex 24`. This code is an application access gate, not a replacement for provider spend limits or Vercel Deployment Protection. The app does not create subscriptions or purchase credits. Check current provider pricing, balances, retention policies and model availability before adding keys.

After changing local variables restart Next.js; after changing Vercel variables redeploy so the deployment receives them. Key presence enables the button; only a successful request proves provider access works.

1. Add real company names + websites or upload your CRM export.
2. Choose **Research customers**, select at most five customers, and review the disclosure. Example/test domains are not eligible for live lookup.
3. Agree to send only those confirmed company names/domains. If configured, enter the private research access code.
4. Click **Research N customers**. Each is processed sequentially, with progress and cancellation.
5. Review source links and supporting passages under each customer. Findings are **machine-extracted, not independently verified**, with blank researcher-review dates. Confirm the relationship yourself before asking anyone for an introduction.

### What research actually does

`POST /api/research` accepts exactly `{ "customer": { "name": "…", "domain": "…" } }`, one company per request. Extra fields, uploads, bodies above 4 KB, non-JSON requests, example/local domains and cross-origin requests are rejected. The browser explicitly projects these two fields after local CSV mapping. It never sends raw files, unused columns, contacts, deal values, happiness labels or shortlists to the route.

The server makes **two basic Tavily searches** (company-domain funding announcements; company name + domain funding/portfolio sources), at most four results per search. It deduplicates URLs and sends at most eight source documents, each truncated to 5,000 characters, to **one AI SDK structured-output call through Vercel AI Gateway**, with at most 2,400 output tokens and no automatic model retries. The Gateway uses the configured model provider. No open-ended agent loop, scraping bypass or direct fetching of model-provided URLs is implemented.

The model can cite only numbered returned sources. The server requires a supplied source URL, a supporting passage present in that source, the named investor in that passage, investment language, and the exact customer domain either in that source's text or its host. Name-only matches are withheld. Ambiguous identities and findings that fail quotation/domain checks go to **Needs review**. Dates are kept only when supplied by the source; retrieval time is not a publication date. A valid URL or matching quote is not factual verification. These conservative checks can miss legitimate results, particularly when a press article omits the company's domain.

A completed limited search with no findings is **No evidence in imported dataset**, not “no investors.” Provider failures, quotas, timeouts, cancellation and ambiguous identities remain distinct and are never converted to completed research with no findings. Funding coverage is neither comprehensive nor independently validated. Public web content may be inaccurate or adversarial; the prompt treats it as untrusted data, and users must review the displayed evidence.

### Cost and access controls

- User-triggered research, at most five companies per UI batch, processed one at a time.
- Two searches and at most one model call per company; no extraction call when searches yield no usable source documents.
- A 50-second total deadline per request; `maxDuration=60` on the Vercel Node.js route.
- Server-side access code required in production; code remains in browser memory only and goes only to this app's server.
- A limit of 20 accepted research requests per hour **per running server instance**, counting timestamps only. Server restarts and autoscaling reset/multiply that limit. It is **not a global billing cap**. Use a private Vercel deployment and configure provider spending limits/alerts appropriate to your pilot. Check your Vercel plan's function limits before deploying.
- Retries and new batches incur new usage; there is no result cache or background queue. Cancellation prevents further client requests and signals cancellation to providers, but already performed provider work can still be billed.

## Deploy to Vercel yourself

Nothing has been deployed or shared by this implementation. To deploy after reviewing the code:

1. Push this repository to your GitHub repository yourself, then **Vercel → Add New → Project → Import** it. Select the directory containing this README/package.json as the project root.
2. Framework preset: **Next.js**. Install: `npm ci`. Build: `npm run build`. Keep the default Next.js output directory; do **not** use the former `dist/` or static-export preset because research needs a server route. Choose Node.js 24.x in project settings.
3. Add the server variables above to the deployment environment(s) you intend to test. `RESEARCH_ACCESS_TOKEN` must be 20+ characters in production, including Vercel Preview deployments. Without keys or the production code, the frontend still works but research fails closed. Keep the pilot private; use Vercel Deployment Protection where available and check its current plan eligibility.
4. Deploy from Vercel. Add provider spending controls before sharing the deployment. The project adds no Analytics or Speed Insights packages and should not log request bodies or source content in host log drains.
5. Open the app, enter a real customer, click Research customers, enter the private access code, consent, and run the lookup. Inspect the funding source and excerpt before treating it as useful. Try an unknown company as well: a no-findings or Needs review result is an expected honest outcome.
6. Verify CSV mapping, mobile layout, safe export and Clear session. Redeploy whenever server variables change. Do not add automatic outreach or real CRM access without separate approval.

The frontend uses **locally bundled Geist**, so it does not request Google Fonts at build time or in your browser. No database, object storage, external font host, durable queue or paid Vercel add-on is needed for this pilot. AI Gateway, the selected model and Tavily have their own pricing/usage terms; no free usage allowance is assumed.

## Customer input and identity

Use **Enter customers** to add one company at a time without losing research, or **Upload CRM export** to upload a UTF-8 CSV of up to 5 MB / 20,000 records. Convert other formats to CSV locally first. Preview and map company name + website/domain before confirming. Only the two selected fields become records; all other columns are discarded. Confirming an upload explicitly replaces the current customers, evidence, assessments and research state.

[Sample customer CSV](public/templates/customers.csv) contains only clearly fictional companies and reserved `.example` domains. It supplies no funding evidence and cannot be used for live research. No example records are injected automatically.

The parser handles BOM, quoted commas, escaped quotes, multiline fields, blank rows, duplicate headers and missing cells. Duplicate/blank headers are selectable by column position. Valid rows survive other row errors. Needs review lists excluded rows, numbered by CSV record (including the header; a quoted multiline record is one row).

Domains are lowercased; URL schemes, paths and leading `www.` are removed. Invalid hosts, IP addresses, ports and credential-bearing URLs are rejected. Subdomains remain distinct. Repeated domains with the same normalized company name are deduplicated. Different names sharing a domain quarantine all affected import rows. Identical names on different domains are kept separate. There is no name-only or fuzzy matching; a researcher must resolve aliases, shared corporate websites and real-world identity ambiguity.

## Manual evidence fallback

You can add a source directly from a customer card, or import the separate [evidence CSV template](public/templates/evidence.csv). Keep these required headers, even when date cells are empty:

| Column          | Requirement                                        |
| --------------- | -------------------------------------------------- |
| customer domain | Exact normalized imported customer domain          |
| investor name   | Required                                           |
| evidence URL    | Required absolute HTTP(S) URL without credentials  |
| source title    | Required                                           |
| source date     | Real, non-future YYYY-MM-DD or blank               |
| reviewed date   | Real, non-future YYYY-MM-DD or blank if unreviewed |
| round / notes   | Optional columns                                   |

A researcher checks funding announcements or investor portfolio pages and explicitly names investors. SEC Form D is not a dependable investor list. Manual imports are labeled researcher-supplied, never independently verified. Setting a reviewed date or checking “I reviewed this source” is a researcher declaration, not app verification. A valid URL is syntax, not proof.

Unmatched domains, missing sources and malformed rows go to Needs review without losing valid rows. Duplicate required headers are rejected. Exact duplicate evidence rows are skipped; multiple sources remain visible for each distinct investor/customer pair. New evidence imports replace prior evidence-import issues, while customer-import issues remain visible.

## Results and introduction planning

The default **Customer paths** view groups investors beneath each customer. Sourced customers appear first, happy customers prioritized within that group, then name. Customer happiness is not inferred. Set it yourself: Not assessed / Happy customer / Not ready to ask.

Introduction readiness is separate for each customer/investor pair: not confirmed / customer says they know the investor / customer says they can introduce us. These are founder-reported assessments, not app verification. Shortlist sourced paths and filter to them. The app never sends messages or introduction requests.

The secondary **Investors** index ranks by distinct customer domains, not source count. Exact case-insensitive investor names are grouped; entity aliases are not resolved. Counts do not imply investment fit. **Customers** provides manual research status controls. Mark researched only after actually checking sources. **Needs review** includes import rows and ambiguous automatic research outcomes.

Export includes all sourced paths (not only the current filter), grouped by customer, with relationship/readiness, shortlist, source provenance and supporting passages. Multiple sources are retained. CSV fields beginning with formula-like characters, including whitespace-prefixed `=`, `+`, `-` or `@`, are prefixed with an apostrophe.

## Privacy behavior and limitations

CSV parsing, mapping, deduplication and manual evidence processing stay in browser memory. There are no accounts, database, uploaded-file logs, analytics, cookies, localStorage, sessionStorage, IndexedDB or service workers in the app. During preview the parsed file exists in memory; cancel/confirmation drops it. Do not intentionally map contact or deal fields as company fields.

Opt-in research is the exception to local processing: the server receives only confirmed company name/domain and the private access code if required. Tavily receives search queries containing that company identity. AI Gateway and the configured model provider receive that identity and public search-source text. The private workspace code is not forwarded to either provider. SDK telemetry is disabled; this app does not log bodies, prompts, credentials or source content. Next.js and Vercel infrastructure access/function logs, AI Gateway observability and provider processing/retention policies are separate from app memory; configure them appropriately and do not claim that external research is browser-only or zero-retention.

**Clear session** removes local customer/evidence/review/shortlist state, access-code entry and pending results, and aborts the current research batch. Reload/close also loses the session. It cannot delete provider records or undo charges, original files, downloaded exports, browser extensions' records or OS/browser session restoration. JavaScript does not guarantee secure memory erasure. No customer result is cached or written to a database by the app. The server's rate limiter keeps only request-count timestamps temporarily.

Imported text and source excerpts render as React text, never HTML. Evidence links allow HTTP(S), open with `noopener noreferrer`, and suppress Referer; clicking them intentionally visits the source. HTTP links lack HTTPS transport protection. A URL, excerpt or domain match alone never proves a true investment or an available introduction.

## Tests and implementation

```sh
npm test             # parser, identities, grouping, evidence, research grounding and API boundaries
npm run typecheck
npm run build
npm run test:e2e     # desktop + mobile Chromium; starts Next.js locally
```

Browser tests use `/usr/bin/chromium` by default; set `CHROMIUM_PATH` to another installed Chromium executable if needed. Screenshots go to ignored `test-results/`. Provider responses are intercepted **in tests only** to exercise the UI without spending credits. Unit tests use injected offline dependencies. There is no production mock mode. Passing these checks does not prove live provider credentials, funding coverage or extraction accuracy; a real-key smoke test remains necessary.

- `src/app/`: Next.js page, Geist layout and `/api/research` Node.js route.
- `src/App.tsx`: session-only founder workspace.
- `src/components/ResearchPanel.tsx`: opt-in batch selection, projection, progress and cancellation.
- `src/server/research.ts`: Tavily searches, AI SDK + Gateway extraction, quotation/domain grounding.
- `src/server/research-handler.ts`: strict request boundary, access code, timeout, safe errors and instance-level rate limit.
- `src/research-contract.ts`: bounded request/extraction schemas and shared outcomes.
- `src/data.ts`: CSV, normalization, manual import, grouping and safe export.

The legacy `LookupAdapter` interface remains an extension point for a licensed provider. Any new adapter must preserve exact identity checks, source provenance, explicit failure/ambiguous/no-evidence outcomes, cancellation and the two-field company projection. Provider keys belong on the server. Do not bypass scraping restrictions or silently fall back to invented facts.
