import { ArrowUpRight } from "lucide-react";
import type { Evidence } from "../data";
export function EvidenceSources({ sources }: { sources: Evidence[] }) {
  return (
    <>
      {sources.map((e, i) => (
        <div className="source" key={`${e.url}-${i}`}>
          <a
            href={e.url}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            {e.title}
            <ArrowUpRight size={13} />
          </a>
          {e.origin === "automated-research" && (
            <span className="machine-label">
              Machine-extracted · not independently verified
            </span>
          )}
          {e.excerpt && <blockquote>{e.excerpt}</blockquote>}
          <span>
            Source: {e.date || "date not supplied"} ·{" "}
            {e.reviewed
              ? `Researcher reviewed ${e.reviewed}`
              : "Not reviewed by researcher"}
          </span>
          {e.notes && <p>{e.notes}</p>}
        </div>
      ))}
    </>
  );
}
