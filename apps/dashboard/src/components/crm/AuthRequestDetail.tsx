"use client";

import { useState } from "react";
import { AuthRequest } from "@/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AgentTimeline } from "@/components/ui/AgentTimeline";
import { StatusHero } from "@/components/ui/StatusHero";
import { PayerIntelCard } from "@/components/crm/PayerIntelCard";

interface AuthRequestDetailProps {
  request: AuthRequest;
  onProcess: (id: string) => void;
  isProcessing: boolean;
  onSubmit?: (id: string) => void;
  isSubmitting?: boolean;
  onRefreshCompliance?: (id: string) => void;
  refreshingCompliance?: boolean;
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

const COMPLIANCE_ICON: Record<string, string> = {
  pass: "✅",
  warn: "⚠️",
  fail: "❌",
};

export function AuthRequestDetail({
  request,
  onProcess,
  isProcessing,
  onSubmit,
  isSubmitting,
  onRefreshCompliance,
  refreshingCompliance,
}: AuthRequestDetailProps) {
  const [tab, setTab] = useState<"overview" | "packet" | "audit">("overview");
  const { extraction, criteria, compliance, submission } = request;
  const patient = request.patient ?? extraction?.patient;
  const canRun = request.status === "intake" || request.status === "error";
  const awaitingApproval = request.status === "ready_to_submit";

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

      {/* Status hero — the live money-shot (animated pill + pipeline stepper) */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <StatusHero status={request.status} />
      </div>

      {/* Action */}
      {canRun ? (
        <button
          onClick={() => onProcess(request.id)}
          disabled={isProcessing}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition-colors disabled:opacity-50"
        >
          {isProcessing ? "Starting…" : request.status === "error" ? "Retry Agent Pipeline" : "Run Agent Pipeline"}
        </button>
      ) : awaitingApproval ? (
        <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 animate-status-pop">
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none" aria-hidden>
              🧑‍⚕️
            </span>
            <div className="flex-1">
              <p className="font-bold text-emerald-900">Ready for your approval</p>
              <p className="mt-0.5 text-sm text-emerald-700">
                The AI agents read the note, checked {patient?.insurer ?? "payer"} coverage
                {criteria
                  ? ` (${criteria.requiredCriteria.filter((c) => c.met).length}/${criteria.requiredCriteria.length} criteria met)`
                  : ""}
                , filled the prior-auth form{compliance ? ", and passed compliance" : ""}. Give it a
                quick skim, then submit to the payer.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => onSubmit?.(request.id)}
                  disabled={isSubmitting}
                  className="rounded-lg bg-emerald-600 px-4 py-2.5 font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isSubmitting ? "Submitting…" : `Approve & Submit to ${patient?.insurer ?? "Payer"}`}
                </button>
                <button
                  onClick={() => setTab("packet")}
                  className="rounded-lg border border-emerald-300 px-4 py-2.5 font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  Review packet
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : submission ? (
        <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 text-center">
          <p className="text-green-800 font-bold">Submitted to {patient?.insurer ?? "payer"}</p>
          <p className="text-sm text-green-600 mt-1">
            {submission.confirmationId ? `Confirmation ${submission.confirmationId}` : "Awaiting confirmation"} · via{" "}
            {METHOD_LABEL[submission.method]}
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
              {t === "audit" && (
                <span className="ml-1 text-xs bg-gray-100 rounded-full px-2 py-0.5">{request.auditTrail.length}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <PayerIntelCard insurer={patient?.insurer} treatment={extraction?.requestedTreatment} />
          </div>
          <Section title="Extraction">
            {extraction ? (
              <div className="space-y-1 text-sm">
                <p className="font-medium text-gray-900">{extraction.diagnosis}</p>
                <p className="text-xs text-gray-500">
                  ICD-10: {extraction.icd10}
                  {extraction.cptCode ? ` · CPT ${extraction.cptCode}` : ""}
                </p>
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
                    {criteria.requiredCriteria.filter((c) => c.met).length}/{criteria.requiredCriteria.length} met
                  </span>
                </p>
                {criteria.requiredCriteria.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <span>{c.met ? "✅" : "⬜️"}</span>
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

          <Section
            title="Compliance"
            action={
              onRefreshCompliance && (
                <button
                  onClick={() => onRefreshCompliance(request.id)}
                  disabled={refreshingCompliance}
                  className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                >
                  {refreshingCompliance ? "Re-running…" : "↻ Re-run"}
                </button>
              )
            }
          >
            {compliance ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${
                      compliance.overall === "pass"
                        ? "bg-emerald-100 text-emerald-700"
                        : compliance.overall === "warn"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {compliance.overall}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        compliance.source === "opsera" ? "bg-emerald-500" : "bg-gray-300"
                      }`}
                    />
                    {compliance.source === "opsera" ? "Audited live by Opsera" : "Audited by Opsera"}
                  </span>
                </div>
                {compliance.checks.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <span>{COMPLIANCE_ICON[c.status]}</span>
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
                <p className="text-gray-800">
                  Method: <span className="font-medium">{METHOD_LABEL[submission.method]}</span>
                </p>
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

      {tab === "audit" &&
        (request.auditTrail.length > 0 ? (
          <AgentTimeline entries={request.auditTrail} />
        ) : (
          <p className="text-sm text-gray-400">No audit entries yet.</p>
        ))}

      {/* Raw note */}
      <Section title="Raw Clinical Note">
        <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono leading-relaxed">{request.rawNote}</pre>
      </Section>
    </div>
  );
}

const METHOD_LABEL: Record<NonNullable<AuthRequest["submission"]>["method"], string> = {
  rtrvr_api: "Rtrvr.ai cloud agent",
  rtrvr_trick: "Rtrvr.ai recorded Trick",
  fallback: "Direct submission",
};
