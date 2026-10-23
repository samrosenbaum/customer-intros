import { useState } from "react";
import { Plus } from "lucide-react";
import { domainOf, type Customer } from "../data";
export function CustomerEntry({
  customers,
  onAdd,
  onClose,
}: {
  customers: Customer[];
  onAdd: (customer: Customer) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(""),
    [website, setWebsite] = useState(""),
    [error, setError] = useState("");
  return (
    <section className="mapping">
      <h2>Add a customer</h2>
      <p>
        Start with one happy customer, or upload an entire CRM export. Only
        company name and domain are needed.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const domain = domainOf(website);
          if (!name.trim() || !domain) {
            setError(
              "Enter a company name and valid website/domain. Name-only matching is not supported.",
            );
            return;
          }
          if (customers.some((c) => c.domain === domain)) {
            setError(
              "This domain is already in your list. Check the existing customer before adding another identity.",
            );
            return;
          }
          onAdd({ name: name.trim(), domain });
          setName("");
          setWebsite("");
          setError("");
        }}
      >
        <div className="mapping-fields">
          <label>
            Company name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              maxLength={300}
            />
          </label>
          <label>
            Website / domain
            <input
              required
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              autoComplete="off"
              maxLength={2048}
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="message error">
            {error}
          </p>
        )}
        <div className="entry-actions">
          <button className="primary" type="submit">
            <Plus size={15} />
            Add customer
          </button>
          <button type="button" className="text-button" onClick={onClose}>
            Done
          </button>
        </div>
      </form>
    </section>
  );
}
