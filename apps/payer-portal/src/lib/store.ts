// In-memory submission store for the mock payer portal (owner: Sahiel).
// Pinned to globalThis so the intake route handler, the /api/submissions reader,
// and the confirmation page render all share ONE instance across Next's per-route
// module bundles (same reason the ClearAuth API store does this).

export type PortalStatus = "Received" | "Under Review" | "Approved" | "Denied";

export type PortalSubmission = {
  confirmationId: string;
  status: PortalStatus;
  fields: Record<string, string>;
  receivedAt: string;
  source: string;
};

type PortalStore = { submissions: Map<string, PortalSubmission> };

const globalRef = globalThis as unknown as { __payerPortalStore?: PortalStore };
const store: PortalStore =
  globalRef.__payerPortalStore ?? (globalRef.__payerPortalStore = { submissions: new Map() });

export function genConfirmationId(): string {
  return `PA-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function addSubmission(
  fields: Record<string, string>,
  source: string,
  confirmationId?: string
): PortalSubmission {
  const id = confirmationId && /^PA-[A-Z0-9]{3,}$/i.test(confirmationId)
    ? confirmationId.toUpperCase()
    : genConfirmationId();
  const submission: PortalSubmission = {
    confirmationId: id,
    status: "Received",
    fields,
    receivedAt: new Date().toISOString(),
    source,
  };
  store.submissions.set(id, submission);
  console.log(`[payer-portal] received submission ${id} from ${source} (${Object.keys(fields).length} fields)`);
  return submission;
}

export function listSubmissions(): PortalSubmission[] {
  return Array.from(store.submissions.values()).sort((a, b) =>
    b.receivedAt.localeCompare(a.receivedAt)
  );
}

export function getSubmission(confirmationId: string): PortalSubmission | undefined {
  return store.submissions.get(confirmationId.toUpperCase());
}

export function setSubmissionStatus(
  confirmationId: string,
  status: PortalStatus
): PortalSubmission | undefined {
  const submission = store.submissions.get(confirmationId.toUpperCase());
  if (submission) {
    submission.status = status;
    console.log(`[payer-portal] ${confirmationId} → ${status}`);
  }
  return submission;
}
