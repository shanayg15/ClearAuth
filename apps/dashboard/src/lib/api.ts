import type { AuthRequest } from "@/types";
import type { PayerIntel } from "@/lib/payer-intel";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const DOCTOR_TOKEN = "demo_doctor";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DOCTOR_TOKEN}`,
      ...init?.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `API error ${res.status}`);
  return data;
}

export async function getAuthRequests(): Promise<AuthRequest[]> {
  const data = await apiFetch<{ requests: AuthRequest[] }>("/api/auth-requests");
  return data.requests;
}

export async function getAuthRequest(id: string): Promise<AuthRequest> {
  const data = await apiFetch<{ request: AuthRequest }>(`/api/auth-requests/${id}`);
  return data.request;
}

export async function createAuthRequest(rawNote: string): Promise<AuthRequest> {
  const data = await apiFetch<{ request: AuthRequest }>("/api/auth-requests", {
    method: "POST",
    body: JSON.stringify({ rawNote }),
  });
  return data.request;
}

export async function processAuthRequest(id: string): Promise<AuthRequest> {
  const data = await apiFetch<{ request: AuthRequest }>("/api/agents/process", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
  return data.request;
}

// Doctor approval gate: the pipeline stops at "ready_to_submit"; this fires the
// submission chain (submitting → submitted) only once the clinician signs off.
export async function submitAuthRequest(id: string): Promise<AuthRequest> {
  const data = await apiFetch<{ request: AuthRequest }>("/api/agents/submit", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
  return data.request;
}

export async function refreshCompliance(id: string): Promise<AuthRequest> {
  const data = await apiFetch<{ request: AuthRequest }>("/api/compliance", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
  return data.request;
}

export type OpseraReportSection = { agent: string; label: string; text: string };
export type OpseraReport = { sections: OpseraReportSection[]; source: "opsera" | "fallback" };

// Opsera narrative agents (Architecture Analyzer + Business Documents Generator)
// → the investor-pitch / HIPAA-summary artifacts. Fail-soft on the server.
export async function getOpseraReport(id: string): Promise<OpseraReport> {
  const data = await apiFetch<{ report: OpseraReport }>("/api/opsera/report", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
  return data.report;
}

// Payer Intelligence (Apify) — hits the dashboard's OWN server route (same
// origin), which runs the scrape server-side so the Apify token never reaches the
// browser. Note: this is NOT the API_URL brain — it's a dashboard route handler.
export async function getPayerIntel(payer: string, treatment: string): Promise<PayerIntel> {
  const res = await fetch(
    `/api/payer-intel?payer=${encodeURIComponent(payer)}&treatment=${encodeURIComponent(treatment)}`
  );
  if (!res.ok) return { payer, source: "fallback" };
  return res.json();
}

export type AuthRequestStreamHandlers = {
  onSnapshot: (requests: AuthRequest[]) => void;
  onUpsert: (request: AuthRequest) => void;
  onError?: (err: Event) => void;
};

export function subscribeToAuthRequests(handlers: AuthRequestStreamHandlers): () => void {
  if (typeof window === "undefined") return () => {};
  const es = new EventSource(`${API_URL}/api/stream`);

  es.addEventListener("snapshot", (e) => {
    try {
      const data = JSON.parse((e as MessageEvent).data) as { requests: AuthRequest[] };
      handlers.onSnapshot(data.requests);
    } catch (err) {
      console.error("[stream] snapshot parse", err);
    }
  });

  es.addEventListener("upsert", (e) => {
    try {
      const request = JSON.parse((e as MessageEvent).data) as AuthRequest;
      handlers.onUpsert(request);
    } catch (err) {
      console.error("[stream] upsert parse", err);
    }
  });

  es.onerror = (err) => handlers.onError?.(err);

  return () => es.close();
}
