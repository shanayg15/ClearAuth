import Link from "next/link";
import { getSubmission } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ cid?: string }>;
}) {
  const { cid } = await searchParams;
  const submission = cid ? getSubmission(cid) : undefined;
  const confirmationId = submission?.confirmationId ?? cid ?? "—";
  const status = submission?.status ?? "Received";

  return (
    <div className="pp-card pp-confirm">
      <div className="pp-confirm-badge">✓</div>
      <h1>Request Received</h1>
      <p className="pp-muted">
        Your prior-authorization request has been submitted to MeridianHealth.
      </p>

      <dl className="pp-confirm-meta">
        <div>
          <dt>Confirmation ID</dt>
          <dd className="pp-mono">{confirmationId}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <span className="pp-status pp-status-received">{status}</span>
          </dd>
        </div>
      </dl>

      {submission && Object.keys(submission.fields).length > 0 && (
        <table className="pp-kv">
          <tbody>
            {Object.entries(submission.fields).map(([k, v]) => (
              <tr key={k}>
                <th>{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="pp-muted pp-small">
        Keep this confirmation ID for your records. The decision can be tracked in the Operator
        Console.
      </p>
      <Link className="pp-btn pp-btn-ghost" href="/submit">
        Submit another request
      </Link>
    </div>
  );
}
