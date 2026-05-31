import { PORTAL_FIELDS } from "@/lib/fields";

export const dynamic = "force-dynamic";

// A real, fillable HTML form. It posts natively (method=post) to /api/intake so a
// DOM browser agent (Rtrvr) — or a human — can fill the inputs and click submit
// with no client JS required; the route handler redirects to the confirmation page.
export default async function SubmitPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const val = (name: string): string => {
    const v = sp[name];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? "" : "";
  };

  return (
    <div className="pp-card pp-form-card">
      <h1>Prior Authorization Request</h1>
      <p className="pp-muted">
        Complete the form below and submit. A confirmation number will be issued for tracking.
      </p>
      <form method="post" action="/api/intake" className="pp-form">
        {PORTAL_FIELDS.map((f) =>
          f.textarea ? (
            <div className="pp-field" key={f.name}>
              <label className="pp-label" htmlFor={f.name}>
                {f.label}
              </label>
              <textarea
                id={f.name}
                name={f.name}
                className="pp-textarea"
                placeholder={f.placeholder}
                defaultValue={val(f.name)}
                rows={4}
              />
            </div>
          ) : (
            <div className="pp-field" key={f.name}>
              <label className="pp-label" htmlFor={f.name}>
                {f.label}
              </label>
              <input
                id={f.name}
                name={f.name}
                className="pp-input"
                placeholder={f.placeholder}
                defaultValue={val(f.name)}
              />
            </div>
          )
        )}
        <button type="submit" className="pp-btn pp-btn-primary pp-submit">
          Submit Prior Authorization
        </button>
      </form>
    </div>
  );
}
