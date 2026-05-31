import { AuthRequest, AuditEntry } from "@clearauth/types";
import { createServerSupabase } from "@/lib/supabase";

// In-process pub/sub for SSE broadcasts. One subscriber per connected client.
type Listener = (event: StoreEvent) => void;
export type StoreEvent = { type: "upsert"; request: AuthRequest };

// Pin the in-memory store + listeners to globalThis. Next.js dev re-evaluates
// modules per route bundle, which would otherwise fork these singletons — the
// SSE listeners registered by /stream would live in a different instance than
// the upsert() called by /agents/process, and live updates would silently stop
// flowing between routes. globalThis keeps one shared copy.
type ClearAuthStore = {
  memory: Map<string, AuthRequest>;
  listeners: Set<Listener>;
  hydrated: boolean;
};
const globalRef = globalThis as unknown as { __clearauthStore?: ClearAuthStore };
const store: ClearAuthStore =
  globalRef.__clearauthStore ??
  (globalRef.__clearauthStore = { memory: new Map(), listeners: new Set(), hydrated: false });

const memory = store.memory;

export function subscribe(listener: Listener): () => void {
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

function publish(event: StoreEvent) {
  for (const listener of store.listeners) {
    try {
      listener(event);
    } catch (err) {
      console.error("[store] listener error:", err);
    }
  }
}

const TABLE = "auth_requests";

type AuthRequestRow = {
  id: string;
  status: AuthRequest["status"];
  created_at: string;
  updated_at: string;
  uploaded_by: string;
  note_key: string | null;
  raw_note: string;
  patient: AuthRequest["patient"] | null;
  extraction: AuthRequest["extraction"] | null;
  criteria: AuthRequest["criteria"] | null;
  form_fill: AuthRequest["formFill"] | null;
  compliance: AuthRequest["compliance"] | null;
  submission: AuthRequest["submission"] | null;
  audit_trail: AuditEntry[] | null;
};

function rowToRequest(r: AuthRequestRow): AuthRequest {
  return {
    id: r.id,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    uploadedBy: r.uploaded_by,
    noteKey: r.note_key ?? undefined,
    rawNote: r.raw_note,
    patient: r.patient ?? undefined,
    extraction: r.extraction ?? undefined,
    criteria: r.criteria ?? undefined,
    formFill: r.form_fill ?? undefined,
    compliance: r.compliance ?? undefined,
    submission: r.submission ?? undefined,
    auditTrail: r.audit_trail ?? [],
  };
}

function requestToRow(req: AuthRequest): AuthRequestRow {
  return {
    id: req.id,
    status: req.status,
    created_at: req.createdAt,
    updated_at: req.updatedAt,
    uploaded_by: req.uploadedBy,
    note_key: req.noteKey ?? null,
    raw_note: req.rawNote,
    patient: req.patient ?? null,
    extraction: req.extraction ?? null,
    criteria: req.criteria ?? null,
    form_fill: req.formFill ?? null,
    compliance: req.compliance ?? null,
    submission: req.submission ?? null,
    audit_trail: req.auditTrail,
  };
}

// One-time hydration: warm the in-memory mirror from Supabase so SSE snapshots
// and the offline fallback are correct after a server restart. Idempotent and
// fail-soft — a missing/erroring Supabase just leaves the Map as-is. The flag
// lives on the globalThis-pinned store so it survives Next's per-bundle reeval.
let hydrating: Promise<void> | null = null;
export async function ensureHydrated(): Promise<void> {
  if (store.hydrated) return;
  if (hydrating) return hydrating;
  const sb = createServerSupabase();
  if (!sb) {
    store.hydrated = true; // nothing to hydrate from — in-memory only
    return;
  }
  hydrating = (async () => {
    try {
      const { data, error } = await sb.from(TABLE).select("*");
      if (error) {
        console.error("[store] hydrate error:", error.message);
        return; // leave hydrated=false so a later read retries
      }
      for (const row of (data ?? []) as AuthRequestRow[]) {
        const req = rowToRequest(row);
        // Don't clobber a fresher in-memory copy written since startup.
        if (!memory.has(req.id)) memory.set(req.id, req);
      }
      store.hydrated = true;
      console.log(`[store] hydrated ${data?.length ?? 0} request(s) from Supabase`);
    } catch (err) {
      console.error("[store] hydrate failed:", err instanceof Error ? err.message : err);
    } finally {
      hydrating = null;
    }
  })();
  return hydrating;
}

export async function getAuthRequest(id: string): Promise<AuthRequest | undefined> {
  await ensureHydrated();
  const sb = createServerSupabase();
  if (sb) {
    const { data, error } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error) {
      console.error("[store] getAuthRequest error:", error.message);
      return memory.get(id);
    }
    if (!data) return memory.get(id);
    return rowToRequest(data as AuthRequestRow);
  }
  return memory.get(id);
}

export async function listAuthRequests(): Promise<AuthRequest[]> {
  await ensureHydrated();
  const sb = createServerSupabase();
  if (sb) {
    const { data, error } = await sb.from(TABLE).select("*").order("updated_at", { ascending: false });
    if (!error && data) return (data as AuthRequestRow[]).map(rowToRequest);
    if (error) console.error("[store] listAuthRequests error:", error.message);
  }
  return Array.from(memory.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function upsertAuthRequest(req: AuthRequest): Promise<AuthRequest> {
  req.updatedAt = new Date().toISOString();
  // Always keep the local mirror fresh so SSE has the latest copy without a read.
  memory.set(req.id, req);

  const sb = createServerSupabase();
  if (sb) {
    const { error } = await sb.from(TABLE).upsert(requestToRow(req));
    if (error) console.error("[store] Supabase upsert failed, using memory only:", error.message);
  }

  // Every upsert pushes a live update to all connected dashboards.
  publish({ type: "upsert", request: req });
  return req;
}
