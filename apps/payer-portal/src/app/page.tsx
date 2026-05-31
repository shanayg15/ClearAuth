import Link from "next/link";

export default function Home() {
  return (
    <div className="pp-card pp-landing">
      <h1>Prior Authorization Portal</h1>
      <p className="pp-muted">
        Submit and track prior-authorization requests for MeridianHealth members. Requests are
        reviewed by MeridianHealth Utilization Management.
      </p>
      <div className="pp-landing-actions">
        <Link className="pp-btn pp-btn-primary" href="/submit">
          Submit a Prior Authorization Request →
        </Link>
        <Link className="pp-btn pp-btn-ghost" href="/control">
          Operator Console
        </Link>
      </div>
    </div>
  );
}
