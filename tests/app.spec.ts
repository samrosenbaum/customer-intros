import { test, expect } from "@playwright/test";
const crm =
  'company,website,email\n"<img src=x onerror=alert(1)>",cedar.test,secret-person@example.test\nBirch,birch.test,another@example.test\nMissing,,private@example.test';
const evidence =
  "customer domain,investor name,evidence URL,source title,source date,reviewed date,round,notes\ncedar.test,Fund A,https://sources.test/a,Funding announcement,2024-01-01,2024-02-01,Seed,\ncedar.test,Fund A,https://sources.test/b,Portfolio page,,,,\nbirch.test,Fund A,https://sources.test/c,Funding announcement,,,,\ncedar.test,Fund B,javascript:alert(1),Bad link,,,,";
async function importCustomers(page: any) {
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  await page.getByLabel("Customer CSV file").setInputFiles({
    name: "crm.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(crm),
  });
  await expect(page.getByText("Preview & map columns")).toBeVisible();
  await expect(page.getByText("secret-person@example.test")).toHaveCount(0);
  await page.getByRole("button", { name: "Confirm mapping" }).click();
}
test("empty state is real, isolated and responsive", async ({ page }, info) => {
  await page.goto("/");
  await expect(
    page.getByText("Your network starts with your customers."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Import evidence", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".investor-result")).toHaveCount(0);
  await expect(page.getByText(/demo mode/i)).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-empty.png`,
    fullPage: true,
  });
});
test("imports, safe rendering, review states, paths, reset and memory-only privacy", async ({
  page,
}, info) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:3000")) external.push(r.url());
  });
  await page.goto("/");
  await importCustomers(page);
  await expect(page.locator("img")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "<img src=x onerror=alert(1)>" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Customers", exact: false }).click();
  await expect(
    page.getByText("Not yet researched", { exact: true }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Mark researched" }).first().click();
  await expect(
    page.getByText("No evidence in imported dataset", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Evidence CSV file").setInputFiles({
    name: "evidence.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(evidence),
  });
  await expect(page.getByRole("status")).toContainText("3 valid evidence rows");
  await page.getByRole("tab", { name: "Investors" }).click();
  await expect(page.locator(".investor-result")).toHaveCount(1);
  await expect(page.getByText("2 distinct matched customers")).toBeVisible();
  await expect(
    page.getByText("Possible introduction path, ask your customer", {
      exact: false,
    }),
  ).toHaveCount(2);
  await expect(
    page.getByRole("link", { name: "Funding announcement" }),
  ).toHaveCount(2);
  await expect(
    page.getByText("Not reviewed by researcher", { exact: false }),
  ).toHaveCount(2);
  await expect(page.locator('[href^="javascript:"]')).toHaveCount(0);
  expect(external).toEqual([]);
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-results.png`,
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Needs review" }).click();
  await expect(
    page.getByText(
      "Evidence import: Investor, source title and an HTTP(S) evidence URL are required.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear session" }).click();
  await expect(page.locator(".investor-result")).toHaveCount(0);
  await expect(
    page.getByText("Your network starts with your customers."),
  ).toBeVisible();
  await importCustomers(page);
  await page.reload();
  await expect(
    page.getByText("Your network starts with your customers."),
  ).toBeVisible();
});

test("customer-first paths, founder assessments, direct evidence and shortlist stay local", async ({
  page,
}, info) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:3000")) external.push(r.url());
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Enter customers", exact: true })
    .click();
  await page.getByLabel("Company name", { exact: true }).fill("Cedar");
  await page
    .getByLabel("Website / domain", { exact: true })
    .fill("https://www.cedar.test/about");
  await page.getByRole("button", { name: "Add customer", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Customer paths" }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByLabel("Relationship with Cedar").selectOption("happy");
  await page
    .getByRole("button", { name: "Add investor evidence", exact: true })
    .click();
  await page.getByLabel("Investor name", { exact: true }).fill("Fund A");
  await page
    .getByLabel("Evidence URL", { exact: true })
    .fill("https://sources.test/funding");
  await page
    .getByLabel("Source title", { exact: true })
    .fill("Funding announcement");
  await page.getByRole("button", { name: "Add sourced investor" }).click();
  const card = page.locator(".customer-path-card");
  await expect(card).toHaveCount(1);
  await expect(
    card.getByRole("heading", { name: "Cedar", exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole("heading", { name: "Fund A", exact: true }),
  ).toBeVisible();
  await expect(card.getByLabel("Relationship with Cedar")).toHaveValue("happy");
  await expect(
    page.getByLabel("Introduction readiness for Fund A via Cedar"),
  ).toHaveValue("unconfirmed");
  await page
    .getByLabel("Introduction readiness for Fund A via Cedar")
    .selectOption("can-introduce");
  await page
    .getByRole("button", { name: "Shortlist Fund A via Cedar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Shortlisted only", exact: true })
    .click();
  await expect(card).toHaveCount(1);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("investor-map.csv");
  await page.screenshot({
    path: `test-results/${info.project.name}-customer-paths.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(external).toEqual([]);
  await page
    .getByRole("button", { name: "Clear session", exact: true })
    .click();
  await expect(page.locator(".customer-path-card")).toHaveCount(0);
  await expect(
    page.getByText("Your network starts with your customers."),
  ).toBeVisible();
});

test("one investor appears under each matched customer without inventing readiness", async ({
  page,
}) => {
  await page.goto("/");
  await importCustomers(page);
  await page.getByLabel("Evidence CSV file").setInputFiles({
    name: "evidence.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(evidence),
  });
  await expect(
    page.getByRole("tab", { name: "Customer paths" }),
  ).toHaveAttribute("aria-selected", "true");
  const cards = page.locator(".customer-path-card");
  await expect(cards).toHaveCount(2);
  await expect(
    cards.nth(0).getByRole("heading", { name: "Fund A", exact: true }),
  ).toBeVisible();
  await expect(
    cards.nth(1).getByRole("heading", { name: "Fund A", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".customer-investor")).toHaveCount(2);
  await expect(
    cards
      .filter({
        has: page.getByRole("heading", { name: "Birch", exact: true }),
      })
      .locator(".source"),
  ).toHaveCount(1);
  await expect(
    cards
      .filter({
        has: page.getByRole("heading", {
          name: "<img src=x onerror=alert(1)>",
          exact: true,
        }),
      })
      .locator(".source"),
  ).toHaveCount(2);
  for (const select of await page.locator(".readiness-label select").all())
    await expect(select).toHaveValue("unconfirmed");
  for (const select of await page.locator(".relationship-label select").all())
    await expect(select).toHaveValue("unknown");
});

const researchConfigFixture = {
  enabled: true,
  missing: [],
  requiresAccessCode: false,
  model: "test/model",
  limits: { batch: 5, searchesPerCompany: 2, resultsPerSearch: 4 },
};
const researchFinding = (domain: string) => ({
  domain,
  status: "matches",
  message: "One sourced finding, machine-extracted and unreviewed.",
  evidence: [
    {
      domain,
      investor: "Test Research Fund",
      url: "https://sources.test/announcement",
      title: "Test funding announcement",
      date: "2024-01-01",
      reviewed: "",
      notes: "",
      origin: "automated-research",
      excerpt: "The company raised a funding round led by Test Research Fund.",
    },
  ],
  searchedAt: "2024-02-01T00:00:00.000Z",
  searchCount: 2,
});
test("research requires consent and sends only projected company identities", async ({
  page,
}, info) => {
  const payloads: unknown[] = [];
  await page.route("**/api/research", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: researchConfigFixture });
    const body = route.request().postDataJSON();
    payloads.push(body);
    return route.fulfill({ json: researchFinding(body.customer.domain) });
  });
  await page.goto("/");
  await importCustomers(page);
  await page
    .getByRole("button", { name: "Research customers", exact: true })
    .first()
    .click();
  const panel = page.getByRole("region", {
    name: "Research customers",
    exact: true,
  });
  await expect(
    panel.getByRole("button", { name: "Research 2 customers", exact: true }),
  ).toBeDisabled();
  expect(payloads).toEqual([]);
  await panel
    .getByRole("checkbox", {
      name: "I agree to send these selected company identities for external research.",
    })
    .check();
  await panel
    .getByRole("button", { name: "Research 2 customers", exact: true })
    .click();
  await expect(panel.getByText("matches", { exact: true })).toHaveCount(2);
  expect(payloads).toEqual([
    {
      customer: { name: "<img src=x onerror=alert(1)>", domain: "cedar.test" },
    },
    { customer: { name: "Birch", domain: "birch.test" } },
  ]);
  expect(JSON.stringify(payloads)).not.toContain("private@");
  expect(JSON.stringify(payloads)).not.toContain("email");
  await expect(page.locator(".customer-investor")).toHaveCount(2);
  await expect(
    page.getByText("Machine-extracted · not independently verified", {
      exact: true,
    }),
  ).toHaveCount(2);
  await expect(page.locator(".source blockquote")).toHaveCount(2);
  await expect(
    page.getByRole("checkbox", {
      name: "I agree to send these selected company identities for external research.",
    }),
  ).not.toBeChecked();
  for (const select of await page.locator(".readiness-label select").all())
    await expect(select).toHaveValue("unconfirmed");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-research.png`,
    fullPage: true,
  });
});
test("failed research differs from no findings and ambiguous identities", async ({
  page,
}) => {
  let count = 0;
  await page.route("**/api/research", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: researchConfigFixture });
    const { customer } = route.request().postDataJSON();
    if (count++ === 0)
      return route.fulfill({
        status: 502,
        json: { error: "Search provider unavailable." },
      });
    return route.fulfill({
      json: {
        ...researchFinding(customer.domain),
        status: "no-evidence",
        evidence: [],
        message: "No supported findings in searched sources.",
      },
    });
  });
  await page.goto("/");
  await importCustomers(page);
  await page
    .getByRole("button", { name: "Research customers", exact: true })
    .first()
    .click();
  const panel = page.getByRole("region", {
    name: "Research customers",
    exact: true,
  });
  await panel
    .getByRole("checkbox", {
      name: "I agree to send these selected company identities for external research.",
    })
    .check();
  await panel.getByRole("button", { name: "Research 2 customers" }).click();
  await expect(panel.getByText("failed", { exact: true })).toBeVisible();
  await expect(panel.getByText("no evidence", { exact: true })).toBeVisible();
  await expect(
    page.locator(".unresearched").getByText("Research failed", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".unresearched")
      .getByText("No evidence in imported dataset", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".customer-investor")).toHaveCount(0);
});
test("clearing during research aborts the batch and ignores late results", async ({
  page,
}) => {
  let started = false;
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/research", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: researchConfigFixture });
    started = true;
    const { customer } = route.request().postDataJSON();
    await pending;
    await route
      .fulfill({ json: researchFinding(customer.domain) })
      .catch(() => {});
  });
  await page.goto("/");
  await importCustomers(page);
  await page
    .getByRole("button", { name: "Research customers", exact: true })
    .first()
    .click();
  const panel = page.getByRole("region", {
    name: "Research customers",
    exact: true,
  });
  await panel
    .getByRole("checkbox", {
      name: "I agree to send these selected company identities for external research.",
    })
    .check();
  await panel.getByRole("button", { name: "Research 2 customers" }).click();
  await expect.poll(() => started).toBe(true);
  await page.getByRole("button", { name: "Clear session" }).click();
  release();
  await expect(
    page.getByText("Your network starts with your customers."),
  ).toBeVisible();
  await expect(page.locator(".customer-path-card")).toHaveCount(0);
  await expect(
    page.getByText("Test Research Fund", { exact: true }),
  ).toHaveCount(0);
});
test("the real API fails safely without credentials and rejects CRM fields", async ({
  request,
}) => {
  const result = await request.post("/api/research", {
    headers: { Origin: "http://127.0.0.1:3000" },
    data: { customer: { name: "Cedar", domain: "cedar.io" } },
  });
  expect(result.status()).toBe(503);
  expect(await result.json()).toMatchObject({ code: "not-configured" });
  const extra = await request.post("/api/research", {
    headers: { Origin: "http://127.0.0.1:3000" },
    data: {
      customer: {
        name: "Cedar",
        domain: "cedar.io",
        email: "private@example.test",
      },
    },
  });
  expect(extra.status()).toBe(400);
});
