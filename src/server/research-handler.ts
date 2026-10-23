import { timingSafeEqual } from "node:crypto";
import { customerRequestSchema } from "../research-contract";
import { researchConfig, researchCustomer, ResearchError } from "./research";
const json = (
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...extra },
  });
// Counts only; no companies, IPs, queries, files, or responses are retained here.
export function createLimiter(limit = 20, windowMs = 60 * 60 * 1000) {
  let timestamps: number[] = [];
  return (now = Date.now()) => {
    timestamps = timestamps.filter((t) => now - t < windowMs);
    if (timestamps.length >= limit) return false;
    timestamps.push(now);
    return true;
  };
}
const allowRequest = createLimiter();
async function readJSON(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new ResearchError(
      "invalid-body",
      "Send a JSON company identity only.",
      415,
    );
  const reader = request.body?.getReader();
  if (!reader)
    throw new ResearchError(
      "invalid-body",
      "A company identity is required.",
      400,
    );
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 4096) {
      await reader.cancel();
      throw new ResearchError(
        "body-too-large",
        "Only a company name and domain are accepted; raw files are not accepted.",
        413,
      );
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ResearchError(
      "invalid-json",
      "The request must contain valid JSON.",
      400,
    );
  }
}
export function getResearchConfig() {
  return json(researchConfig());
}
export async function handleResearch(
  request: Request,
  run = researchCustomer,
  allow = allowRequest,
): Promise<Response> {
  try {
    const origin = request.headers.get("origin");
    let sameOrigin = false;
    try {
      const parsedOrigin = new URL(origin ?? "");
      const expectedHost =
        request.headers.get("host") || new URL(request.url).host;
      sameOrigin =
        ["http:", "https:"].includes(parsedOrigin.protocol) &&
        parsedOrigin.host === expectedHost;
    } catch {
      /* A missing/malformed Origin is not a browser research request. */
    }
    if (!sameOrigin)
      return json(
        {
          error: "Research requests must come from this application.",
          code: "origin",
        },
        403,
      );
    const parsed = customerRequestSchema.safeParse(await readJSON(request));
    if (!parsed.success)
      return json(
        {
          error:
            "Only a confirmed public company name and normalized domain are accepted. Extra fields, raw files and example domains are rejected.",
          code: "invalid-company",
        },
        400,
      );
    const config = researchConfig();
    if (!config.enabled)
      return json(
        {
          error:
            "Research is not configured. Add the missing server-side environment variables.",
          code: "not-configured",
          missing: config.missing,
        },
        503,
      );
    const secret = process.env.RESEARCH_ACCESS_TOKEN;
    if (secret) {
      const supplied = request.headers.get("x-research-access-code") ?? "";
      const expected = Buffer.from(secret);
      const candidate = Buffer.from(supplied);
      if (
        candidate.length !== expected.length ||
        !timingSafeEqual(candidate, expected)
      )
        return json(
          {
            error: "Enter the research access code for this private workspace.",
            code: "access-code",
          },
          401,
        );
    }
    if (!allow())
      return json(
        {
          error:
            "This server instance has reached its hourly pilot limit (20 companies). Check provider usage before continuing later.",
          code: "rate-limit",
        },
        429,
        { "Retry-After": "3600" },
      );
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(50_000),
    ]);
    return json(await run(parsed.data.customer, signal));
  } catch (e) {
    if (e instanceof ResearchError)
      return json({ error: e.message, code: e.code }, e.status);
    if (request.signal.aborted)
      return json(
        {
          error: "Research was cancelled. No outcome was recorded.",
          code: "cancelled",
        },
        499,
      );
    if (
      e instanceof Error &&
      (e.name === "TimeoutError" || e.name === "AbortError")
    )
      return json(
        {
          error:
            "Research timed out. No completed outcome was recorded; provider work may already have incurred usage.",
          code: "timeout",
        },
        504,
      );
    // Never echo provider payloads, prompts, credentials, or user inputs into errors/logs.
    return json(
      {
        error:
          "Research could not be completed. No completed outcome was recorded.",
        code: "research-failed",
      },
      502,
    );
  }
}
