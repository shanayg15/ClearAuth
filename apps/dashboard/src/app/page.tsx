"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { AuthRequest } from "@/types";
import {
  getAuthRequests,
  createAuthRequest,
  processAuthRequest,
  subscribeToAuthRequests,
} from "@/lib/api";
import { useSession } from "@/lib/useSession";
import { AuthRequestCard } from "@/components/crm/AuthRequestCard";
import { AuthRequestDetail } from "@/components/crm/AuthRequestDetail";

const SAMPLE_NOTE = `Patient: Jane Doe
Insurer: Aetna
Member ID: W123456789
54 yo female
Diagnosis: Chronic lower back pain, failed 8 weeks of physical therapy and NSAIDs
Requested treatment: MRI lumbar spine without contrast
Justification: Persistent radicular symptoms despite conservative management.`;

export default function Dashboard() {
  const { session } = useSession();
  const [requests, setRequests] = useState<AuthRequest[]>([]);
  const [selected, setSelected] = useState<AuthRequest | null>(null);
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedIdRef.current = selected?.id ?? null;
  }, [selected]);

  const refresh = useCallback(async () => {
    try {
      const list = await getAuthRequests();
      setRequests(list);
      if (selectedIdRef.current) {
        const u = list.find((r) => r.id === selectedIdRef.current);
        if (u) setSelected(u);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    refresh();
    const dispose = subscribeToAuthRequests({
      onSnapshot: (list) => {
        setRequests(list);
        if (selectedIdRef.current) {
          const u = list.find((r) => r.id === selectedIdRef.current);
          if (u) setSelected(u);
        }
      },
      onUpsert: (r) => {
        setRequests((prev) => {
          const idx = prev.findIndex((x) => x.id === r.id);
          if (idx === -1) return [r, ...prev];
          const next = [...prev];
          next[idx] = r;
          return next;
        });
        if (selectedIdRef.current === r.id) setSelected(r);
      },
    });
    return () => dispose();
  }, [refresh]);

  const handleCreate = async () => {
    const raw = note.trim() || SAMPLE_NOTE;
    setCreating(true);
    setError(null);
    try {
      const created = await createAuthRequest(raw);
      setNote("");
      setSelected(created);
      setRequests((prev) => (prev.some((r) => r.id === created.id) ? prev : [created, ...prev]));
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

  const submittedCount = requests.filter((r) =>
    ["submitted", "under_review", "approved"].includes(r.status)
  ).length;

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 flex items-center h-14 px-5 gap-3 flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-sm">
          C
        </div>
        <div>
          <p className="font-bold text-gray-900 leading-tight">ClearAuth</p>
          <p className="text-[11px] text-gray-400 leading-tight">Autonomous prior authorization</p>
        </div>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <span className="text-xs text-gray-400">
            {requests.length} requests · {submittedCount} submitted
          </span>
          <span className="flex items-center gap-2">
            <span className="text-xs text-gray-600 font-medium">
              {session.name} · {session.role}
            </span>
            <span className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">
              {session.name[0]}
            </span>
          </span>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 border-b border-red-200 px-5 py-2 text-sm text-red-700 flex-shrink-0">
          {error}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left: intake + queue */}
        <aside className="w-80 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
          <div className="p-4 border-b border-gray-100">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">New Request</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Paste a clinical note…"
              rows={5}
              className="mt-2 w-full text-sm border border-gray-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <button
              onClick={handleCreate}
              disabled={creating}
              className="mt-2 w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {creating ? "Creating…" : note.trim() ? "Create Request" : "Create with Sample Note"}
            </button>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {requests.length === 0 ? (
              <p className="text-xs text-gray-400 italic text-center py-8">No requests yet</p>
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

        {/* Right: detail */}
        <main className="flex-1 overflow-auto p-6">
          {selected ? (
            <div className="max-w-3xl mx-auto">
              <AuthRequestDetail
                request={selected}
                onProcess={handleProcess}
                isProcessing={processingId === selected.id}
              />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <p className="text-gray-400 font-medium">Select a request to review</p>
                <p className="text-gray-300 text-xs mt-1">
                  Or create one from a clinical note on the left
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
