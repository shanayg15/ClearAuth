"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { AuthRequest } from "@/types";
import {
  getAuthRequests,
  createAuthRequest,
  processAuthRequest,
  submitAuthRequest,
  refreshCompliance,
  subscribeToAuthRequests,
} from "@/lib/api";
import { useSession } from "@/lib/useSession";
import { AuthRequestCard } from "@/components/crm/AuthRequestCard";
import { AuthRequestDetail } from "@/components/crm/AuthRequestDetail";
import { Activity, Plus, Upload, FileX } from "lucide-react";

const SAMPLE_NOTE = `Patient: Jane Doe
Insurer: Aetna
Member ID: W123456789
54 yo female
Diagnosis: Chronic lower back pain, failed 8 weeks of physical therapy and NSAIDs
Requested treatment: MRI lumbar spine without contrast
Justification: Persistent radicular symptoms despite conservative management.`;

// Auto-seed is OFF by default. It was injecting the "Jane Doe" SAMPLE_NOTE as a
// request on every fresh load (and auto-selecting it), which hijacked live demos —
// you'd see Jane Doe even when presenting a brand-new patient. Opt in explicitly
// with NEXT_PUBLIC_DEMO_SEED=1 if you want a pre-populated request. The manual
// "Sample Note" button (empty textarea → Create) still seeds on demand.
const SEED_ENABLED = process.env.NEXT_PUBLIC_DEMO_SEED === "1";

export default function Dashboard() {
  const { session } = useSession();
  const [requests, setRequests] = useState<AuthRequest[]>([]);
  const [selected, setSelected] = useState<AuthRequest | null>(null);
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [refreshingComplianceId, setRefreshingComplianceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedIdRef = useRef<string | null>(null);
  const seededRef = useRef(false);
  useEffect(() => { selectedIdRef.current = selected?.id ?? null; }, [selected]);

  const patchInto = useCallback((list: AuthRequest[], r: AuthRequest): AuthRequest[] => {
    const idx = list.findIndex((x) => x.id === r.id);
    if (idx === -1) return [r, ...list];
    const next = [...list];
    next[idx] = r;
    return next;
  }, []);

  const maybeSeed = useCallback(async (list: AuthRequest[]) => {
    if (!SEED_ENABLED || seededRef.current) return;
    if (list.length > 0) { seededRef.current = true; return; }
    if (typeof window !== "undefined" && sessionStorage.getItem("clearauth_seeded") === "1") {
      seededRef.current = true;
      return;
    }
    seededRef.current = true;
    try {
      if (typeof window !== "undefined") sessionStorage.setItem("clearauth_seeded", "1");
      const created = await createAuthRequest(SAMPLE_NOTE);
      setSelected(created);
      setRequests((prev) => patchInto(prev, created));
      await processAuthRequest(created.id);
    } catch (err) {
      console.error("[seed] failed", err);
    }
  }, [patchInto]);

  const refresh = useCallback(async () => {
    try {
      const list = await getAuthRequests();
      setRequests(list);
      if (selectedIdRef.current) {
        const u = list.find((r) => r.id === selectedIdRef.current);
        if (u) setSelected(u);
      }
      maybeSeed(list);
    } catch (err) {
      console.error(err);
    }
  }, [maybeSeed]);

  useEffect(() => {
    refresh();
    const dispose = subscribeToAuthRequests({
      onSnapshot: (list) => {
        setRequests(list);
        if (selectedIdRef.current) {
          const u = list.find((r) => r.id === selectedIdRef.current);
          if (u) setSelected(u);
        }
        maybeSeed(list);
      },
      onUpsert: (r) => {
        setRequests((prev) => patchInto(prev, r));
        if (selectedIdRef.current === r.id) setSelected(r);
      },
    });
    return () => dispose();
  }, [refresh, maybeSeed, patchInto]);

  const handleCreate = async () => {
    const raw = note.trim() || SAMPLE_NOTE;
    setCreating(true);
    setError(null);
    try {
      const created = await createAuthRequest(raw);
      setNote("");
      setSelected(created);
      setRequests((prev) => patchInto(prev, created));
      setProcessingId(created.id);
      processAuthRequest(created.id)
        .then((r) => { if (selectedIdRef.current === r.id) setSelected(r); })
        .catch((err) => setError(err instanceof Error ? err.message : "Pipeline failed"))
        .finally(() => setProcessingId((id) => (id === created.id ? null : id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create request");
    } finally {
      setCreating(false);
    }
  };

  const handleProcess = async (id: string) => {
    setProcessingId(id);
    setError(null);
    try {
      const result = await processAuthRequest(id);
      setSelected(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pipeline failed");
    } finally {
      setProcessingId(null);
    }
  };

  const handleSubmit = async (id: string) => {
    setSubmittingId(id);
    setError(null);
    try {
      const result = await submitAuthRequest(id);
      setSelected(result);
      setRequests((prev) => patchInto(prev, result));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmittingId(null);
    }
  };

  const handleRefreshCompliance = async (id: string) => {
    setRefreshingComplianceId(id);
    setError(null);
    try {
      const result = await refreshCompliance(id);
      setSelected(result);
      setRequests((prev) => patchInto(prev, result));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Compliance refresh failed");
    } finally {
      setRefreshingComplianceId(null);
    }
  };

  const readFile = async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      if (text.includes("\u0000")) {
        setError("That looks like a binary file — paste the note text instead.");
        return;
      }
      setNote(text.slice(0, 20000));
    } catch {
      setError("Could not read that file — paste the note text instead.");
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  };

  const submittedCount = requests.filter((r) =>
    ["submitted", "under_review", "approved"].includes(r.status)
  ).length;

  return (
    <div className="app">
      {/* Header */}
      <header className="hdr">
        <span className="hdr-brand" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Activity size={14} strokeWidth={2.5} />
          ClearAuth
        </span>
        <span className="hdr-pipe" />
        <span className="hdr-desc">Prior authorization</span>
        <div className="hdr-right">
          <span>{requests.length} req · {submittedCount} submitted</span>
          <span className="hdr-user">{session.name}</span>
        </div>
      </header>

      {error && <div className="err-bar">{error}</div>}

      <div className="body">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="intake">
            <label className="intake-lbl">New Prior Auth</label>
            <div
              className={`drag-wrap${dragOver ? " dragging" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <textarea
                className="note-ta"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Paste a clinical note, or drop a .txt file…"
                rows={5}
              />
            </div>
            <div className="intake-row">
              <button onClick={handleCreate} disabled={creating} className="btn btn-solid btn-fill">
                {creating
                  ? "Creating…"
                  : <><Plus size={13} strokeWidth={2.5} />{note.trim() ? "Create & Run" : "Sample Note"}</>}
              </button>
              <button onClick={() => fileInputRef.current?.click()} title="Upload a .txt file" className="btn">
                <Upload size={13} strokeWidth={2} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.text,text/plain"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) readFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <div className="queue">
            {requests.length === 0 ? (
              <div className="queue-empty">
                <FileX size={20} strokeWidth={1.5} style={{ margin: "0 auto 6px", display: "block", color: "var(--mid)" }} />
                No requests yet
              </div>
            ) : (
              requests.map((r) => (
                <AuthRequestCard
                  key={r.id}
                  request={r}
                  onSelect={setSelected}
                  isSelected={selected?.id === r.id}
                />
              ))
            )}
          </div>
        </aside>

        {/* Main */}
        <main className="main">
          {selected ? (
            <AuthRequestDetail
              request={selected}
              onProcess={handleProcess}
              isProcessing={processingId === selected.id}
              onSubmit={handleSubmit}
              isSubmitting={submittingId === selected.id}
              onRefreshCompliance={handleRefreshCompliance}
              refreshingCompliance={refreshingComplianceId === selected.id}
            />
          ) : (
            <div className="main-empty">
              <div>
                <div>Select a request to review</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>
                  Or create one from a clinical note on the left
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
