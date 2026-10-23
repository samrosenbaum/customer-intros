import { useState } from "react";
import { evidenceFrom, type Customer, type Evidence } from "../data";
export function EvidenceEntry({
  customer,
  onAdd,
  onClose,
}: {
  customer: Customer;
  onAdd: (records: Evidence[]) => void;
  onClose: () => void;
}) {
  const [investor, setInvestor] = useState(""),
    [url, setURL] = useState(""),
    [title, setTitle] = useState(""),
    [date, setDate] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="mapping" aria-label="Add investor evidence">
      <div className="section-title">
        <h2>Add investor evidence for {customer.name}</h2>
        <button className="text-button" onClick={onClose}>
          Cancel
        </button>
      </div>
      <p>
        Use a funding announcement or investor portfolio page that explicitly
        names the company and investor. This is researcher-supplied, not
        independently verified.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const r = evidenceFrom(
            {
              headers: [
                "customer domain",
                "investor name",
                "evidence url",
                "source title",
                "source date",
                "reviewed date",
              ],
              rows: [
                {
                  line: 2,
                  cells: [
                    customer.domain,
                    investor,
                    url,
                    title,
                    date,
                    reviewed ? new Date().toISOString().slice(0, 10) : "",
                  ],
                },
              ],
            },
            [customer],
          );
          if (r.issues.length) {
            setError(r.issues[0].reason);
            return;
          }
          onAdd(r.records);
          onClose();
        }}
      >
        <div className="mapping-fields">
          <label>
            Investor name
            <input
              required
              value={investor}
              onChange={(e) => setInvestor(e.target.value)}
              maxLength={300}
            />
          </label>
          <label>
            Evidence URL
            <input
              required
              type="url"
              value={url}
              onChange={(e) => setURL(e.target.value)}
              maxLength={2048}
            />
          </label>
        </div>
        <div className="mapping-fields">
          <label>
            Source title
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={500}
            />
          </label>
          <label>
            Source date (optional)
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
            />
          </label>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          I reviewed this source and confirmed that it names this company and
          investor.
        </label>
        {error && (
          <p role="alert" className="message error">
            {error}
          </p>
        )}
        <button className="primary" type="submit">
          Add sourced investor
        </button>
      </form>
    </section>
  );
}
