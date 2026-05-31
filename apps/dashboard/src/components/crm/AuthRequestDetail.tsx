"use client";

import { useState } from "react";
import { AuthRequest } from "@/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AgentTimeline } from "@/components/ui/AgentTimeline";

interface AuthRequestDetailProps {
  request: AuthRequest;
  onProcess: (id: string) => void;
  isProcessing: boolean;
}

function Stepper({ request }: { request: AuthRequest }) {
  const stages = [
    { label: "Extract", done: !!request.extraction, active: request.status === "extracting" },
    { label: "Criteria", done: !!request.criteria, active: request.status === "checking_criteria" },
    { label: "Form", done: !!request.formFill, active: request.status === "filling_form" },
    { label: "Compliance", done: !!request.compliance, active: request.status === "compliance_review" },
    {
      label: "Submit",
      done: !!request.submission,
      active: request.status === "ready_to_submit" || request.status === "submitting",
    },
  ];
  return (
    <div className="flex items-center gap-1">
      {stages.map((s, i) => (
        <div key={s.label} className="flex items-center gap-1 flex-1">
          <div className="flex flex-col items-center flex-1">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                s.done
                  ? "bg-emerald-500 text-white"
                  : s.active
                    ? "bg-blue-500 text-white animate-pulse"
                    : "bg-gray-200 text-gray-500"
              }`}
            >
              {s.done ? "✓" : i + 1}
            </div>
            <span className="mt-1 text-[10px] text-gray-500">{s.label}</span>
          </div>
          {i < stages.length - 1 && (
            <div className={`h-0.5 flex-1 -mt-4 ${s.done ? "bg-emerald-400" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <h3 className="font-semibold text-gray-900 mb-2 text-sm uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

const COMPLIANCE_DOT: Record<string, string> = {
  pass: "text-emerald-600",
  warn: "text-amber-600",
  fail: "text-red-600",
};

export function AuthRequestDetail({ request, onProcess, isProcessing }: AuthRequestDetailProps) {
  const [tab, setTab] = useState<"overview" | "packet" | "audit">("overview");
  const { extraction, criteria, compliance, submission } = request;
  const patient = request.patient ?? extraction?.patient;
  const isActive = isProcessing || ["extracting", "checking_criteria", "filling_form", "compliance_review", "submitting"].includes(request.status);
  const canRun = request.status === "intake" || request.status === "error";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{patient?.name ?? "Auth Request"}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {patient?.insurer ?? "Unknown payer"}
            {patient?.memberId ? ` · Member ${patient.memberId}` : ""}
            {patient?.age ? ` · ${patient.age}yo` : ""}
          </p>
        </div>
        <StatusBadge status={request.status} />
      </div>

      <Stepper request={request} />

      {/* Action */}
      {canRun ? (
        <button
          onClick={() => onProcess(request.id)}
          disabled={isProcessing}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition-colors disabled:opacity-50"
        >
          {isProcessing ? "Starting…" : request.status === "error" ? "Retry Agent Pipeline" : "Run Agent Pipeline"}
        </button>
      ) : isActive ? (
        <div className="w-full py-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg font-semibold text-center">
          Agents working — {request.status.replace(/_/g, " ")}…
        </div>
      ) : submission ? (
        <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 text-center">
          <p className="text-green-800 font-bold">Submitted to {patient?.insurer ?? "payer"}</p>
          <p className="text-sm text-green-600 mt-1">
            {submission.confirmationId ? `Confirmation ${submission.confirmationId}` : "Awaiting confirmation"} · via {submission.method}
          </p>
          <p className="text-xs text-green-500 mt-1">{new Date(submission.submittedAt).toLocaleString()}</p>
        </div>
      ) : null}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {(["overview", "packet", "audit"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t ? "border-emerald-500 text-emerald-600" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t}
              {t === "audit" && <span className="ml-1 text-xs bg-gray-100 rounded-full px-2 py-0.5">{request.auditTrail.length}</span>}
            </button>
          ))}
        </nav>
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Section title="Extraction">
            {extraction ? (
              <div className="space-y-1 text-sm">
                <p className="font-medium text-gray-900">{extraction.diagnosis}</p>
                <p className="text-xs text-gray-500">ICD-10: {extraction.icd10}{extraction.cptCode ? ` · CPT ${extraction.cptCode}` : ""}</p>
                <p className="text-gray-700 pt-1">{extraction.requestedTreatment}</p>
                <p className="text-xs text-gray-500 pt-1">{extraction.clinicalJustification}</p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Pending…</p>
            )}
          </Section>

          <Section title="Coverage Criteria">
            {criteria ? (
              <div className="space-y-1.5 text-sm">
                <p className="text-xs text-gray-500">
                  {criteria.coverageSource ?? "Payer policy"} ·{" "}
                  <span className={criteria.allMet ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>
                    {criteria.allMet ? "All met" : "Review needed"}
                  </span>
                </p>
                {criteria.requiredCriteria.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <span className={c.met ? "text-emerald-600" : "text-gray-300"}>{c.met ? "✓" : "○"}</span>
                    <div>
                      <p className="text-gray-800">{c.label}</p>
                      {c.evidence && <p className="text-xs text-gray-400">{c.evidence}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Pending…</p>
            )}
          </Section>

          <Section title="Compliance">
            {compliance ? (
              <div className="space-y-1.5 text-sm">
                <p className="text-xs text-gray-500">
                  Overall{" "}
                  <span className={`font-medium ${COMPLIANCE_DOT[compliance.overall]}`}>{compliance.overall.toUpperCase()}</span>{" "}
                  · {compliance.source}
                </p>
                {compliance.checks.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <span className={COMPLIANCE_DOT[c.status]}>●</span>
                    <div>
                      <p className="text-gray-800">{c.label}</p>
                      {c.detail && <p className="text-xs text-gray-400">{c.detail}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Pending…</p>
            )}
          </Section>

          <Section title="Submission">
            {submission ? (
              <div className="space-y-1 text-sm">
                <p className="text-gray-800">Method: <span className="font-medium">{submission.method}</span></p>
                {submission.confirmationId && <p className="text-gray-800">Confirmation: {submission.confirmationId}</p>}
                <p className="text-xs text-gray-500 break-all">{submission.portalUrl}</p>
                <p className="text-xs text-gray-400">{new Date(submission.submittedAt).toLocaleString()}</p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Pending…</p>
            )}
          </Section>
        </div>
      )}

      {tab === "packet" && (
        <div className="bg-gray-50 rounded-lg p-4">
          {request.formFill ? (
            <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
              {request.formFill.packetMarkdown}
            </pre>
          ) : (
            <p className="text-sm text-gray-400">The PA packet will appear here once the form-fill agent runs.</p>
          )}
        </div>
      )}

      {tab === "audit" && (
        request.auditTrail.length > 0 ? (
          <AgentTimeline entries={request.auditTrail} />
        ) : (
          <p className="text-sm text-gray-400">No audit entries yet.</p>
        )
      )}

      {/* Raw note */}
      <Section title="Raw Clinical Note">
        <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono leading-relaxed">{request.rawNote}</pre>
      </Section>
    </div>
  );
}
