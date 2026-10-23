import { z } from "zod";
import { domainOf } from "./data";
export const customerRequestSchema = z
  .object({
    customer: z
      .object({
        name: z.string().trim().min(1).max(200),
        domain: z
          .string()
          .max(253)
          .refine(
            (d) => domainOf(d) === d,
            "Use a confirmed normalized domain.",
          )
          .refine(
            (d) =>
              !/(^|\.)(example|test|invalid|localhost|local|internal)$/.test(d),
            "Use a real public company domain, not an example or local address.",
          ),
      })
      .strict(),
  })
  .strict();
export const extractionSchema = z
  .object({
    identity: z.enum(["matched", "ambiguous", "not-found"]),
    findings: z
      .array(
        z
          .object({
            investor: z.string().min(1).max(200),
            sourceId: z.number().int().min(0).max(7),
            quote: z.string().min(20).max(900),
            sourceDate: z
              .string()
              .max(10)
              .describe(
                "YYYY-MM-DD only if explicitly published on this source; otherwise empty string.",
              ),
          })
          .strict(),
      )
      .max(15),
  })
  .strict();
export type Extraction = z.infer<typeof extractionSchema>;
export type ResearchSource = {
  id: number;
  url: string;
  title: string;
  content: string;
  publishedDate?: string;
};
export type ResearchOutcome = {
  domain: string;
  status: "matches" | "needs-review" | "no-evidence";
  message: string;
  evidence: import("./data").Evidence[];
  searchedAt: string;
  searchCount: number;
};
export type ResearchConfig = {
  enabled: boolean;
  missing: string[];
  requiresAccessCode: boolean;
  model: string;
  limits: {
    batch: number;
    searchesPerCompany: number;
    resultsPerSearch: number;
  };
};
