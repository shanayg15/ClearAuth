"use client";

import { useState } from "react";
import { AuthRequest } from "@/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AgentTimeline } from "@/components/ui/AgentTimeline";
import { StatusHero } from "@/components/ui/StatusHero";
import { PayerIntelCard } from "@/components/crm/PayerIntelCard";
import {
  Play, RotateCcw, Send, RefreshCw, FileText, LayoutGrid, History,
  Activity, CheckSquare, Square, Shield, FileOutput, Check, AlertTriangle, X,
} from "lucide-react";

interface AuthRequestDetailProps {
  request: AuthRequest;
  onProcess: (id: string) => void;
  isProcessing: boolean;
  onSubmit?: (id: string) => void;
  isSubmitting?: boolean;
  onRefreshCompliance?: (id: string) => void;
  refreshingCompliance?: boolean;
}

function Sec({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="sec">
      <div className="sec-hdr">
        <span className="sec-title" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          {icon}
          {title}
        </span>
        {action}
      </div>
      <div className="sec-body">{children}</div>
    </div>
  );
}

const COMPLIANCE_ICON: Record<string, React.ReactNode> = {
  pass: <Check size={12} strokeWidth={2.5} style={{ color: "var(--green)" }} />,
  warn: <AlertTriangle size={12} strokeWidth={2} style={{ color: "var(--amber)" }} />,
  fail: <X size={12} strokeWidth={2.5} style={{ color: "var(--red)" }} />,
};

const METHOD_LABEL: Record<NonNullable<AuthRequest["submission"]>["method"], string> = {
  rtrvr_api:   "Rtrvr.ai cloud",
  rtrvr_trick: "Rtrvr.ai trick",
  fallback:    "Direct",
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
  const isDenied = request.status === "denied";
  const awaitingApproval = request.status === "ready_to_submit";

  return (
    <div className="detail">
      {/* Header */}
      <div className="dh">
        <div>
          <div className="dh-name">{patient?.name ?? "Auth Request"}</div>
          <div className="dh-sub">
            {patient?.insurer ?? "Unknown payer"}
            {patient?.memberId ? ` · ${patient.memberId}` : ""}
            {patient?.age ? ` · ${patient.age}yo` : ""}
          </div>
        </div>
        <StatusBadge status={request.status} />
      </div>

      <StatusHero status={request.status} />

      {/* Actions */}
      {canRun && (
        <div className="act-run">
          <button onClick={() => onProcess(request.id)} disabled={isProcessing} className="btn btn-solid btn-wide">
            {isProcessing
              ? <><RotateCcw size={13} strokeWidth={2} /> Starting…</>
              : request.status === "error"
              ? <><RotateCcw size={13} strokeWidth={2} /> Retry Pipeline</>
              : <><Play size={13} strokeWidth={2} /> Run Pipeline</>}
          </button>
        </div>
      )}

      {awaitingApproval && (
        <div className="act-approve">
          <div className="act-approve-title">Ready for approval</div>
          <div className="act-approve-body">
            {criteria
              ? `${criteria.requiredCriteria.filter((c) => c.met).length}/${criteria.requiredCriteria.length} criteria met`
              : "Awaiting criteria"}
            {compliance ? " · compliance passed" : ""}
          </div>
          <div className="act-approve-btns">
            <button onClick={() => onSubmit?.(request.id)} disabled={isSubmitting} className="btn btn-solid">
              {isSubmitting
                ? <><RotateCcw size={13} strokeWidth={2} /> Submitting…</>
                : <><Send size={13} strokeWidth={2} /> Submit to {patient?.insurer ?? "Payer"}</>}
            </button>
            <button onClick={() => setTab("packet")} className="btn">
              <FileText size={13} strokeWidth={2} /> Review packet
            </button>
          </div>
        </div>
      )}

      {isDenied && (
        <div className="act-denied">
          <div className="act-denied-title">
            <X size={13} strokeWidth={2.5} />
            Denied by {patient?.insurer ?? "payer"}
          </div>
          <div className="act-denied-body">
            Revise the clinical documentation and regenerate the authorization packet for resubmission.
          </div>
          <button
            onClick={() => onProcess(request.id)}
            disabled={isProcessing}
            className="btn"
          >
            {isProcessing
              ? <><RotateCcw size={13} strokeWidth={2} /> Regenerating…</>
              : <><RotateCcw size={13} strokeWidth={2} /> Redo — Regenerate Auth</>}
          </button>
        </div>
      )}

      {submission && !awaitingApproval && (
        <div className="act-submitted">
          <div className="act-submitted-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Send size={13} strokeWidth={2} />
            Submitted to {patient?.insurer ?? "payer"}
          </div>
          <div className="act-submitted-sub">
            {submission.confirmationId ? `# ${submission.confirmationId}` : "Awaiting confirmation"}
            {" · "}{METHOD_LABEL[submission.method]}
          </div>
          <div className="act-submitted-time">{new Date(submission.submittedAt).toLocaleString()}</div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        {([
          { key: "overview", icon: <LayoutGrid size={12} strokeWidth={2} />, label: "Overview" },
          { key: "packet",   icon: <FileText size={12} strokeWidth={2} />,   label: "Packet"   },
          { key: "audit",    icon: <History size={12} strokeWidth={2} />,    label: "Audit"    },
        ] as const).map(({ key, icon, label }) => (
          <button key={key} onClick={() => setTab(key)} className={`tab${tab === key ? " active" : ""}`}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              {icon}
              {label}
              {key === "audit" && (
                <span className="tab-count">{request.auditTrail.length}</span>
              )}
            </span>
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && (
        <div className="grid-2">
          <div className="col-2">
            <PayerIntelCard insurer={patient?.insurer} treatment={extraction?.requestedTreatment} />
          </div>

          <Sec icon={<Activity size={11} strokeWidth={2} />} title="Extraction">
            {extraction ? (
              <>
                <div className="data-lbl">Diagnosis</div>
                <div className="data-val">{extraction.diagnosis}</div>
                <div className="data-lbl">Codes</div>
                <div className="data-val">
                  ICD-10 {extraction.icd10}{extraction.cptCode ? ` · CPT ${extraction.cptCode}` : ""}
                </div>
                <div className="data-lbl">Treatment</div>
                <div className="data-plain">{extraction.requestedTreatment}</div>
                <div className="data-small">{extraction.clinicalJustification}</div>
              </>
            ) : <span className="pending">Pending…</span>}
          </Sec>

          <Sec icon={<CheckSquare size={11} strokeWidth={2} />} title="Criteria">
            {criteria ? (
              <>
                <div className="crit-score">
                  {criteria.requiredCriteria.filter((c) => c.met).length}/{criteria.requiredCriteria.length} met
                  {criteria.coverageSource ? ` · ${criteria.coverageSource}` : ""}
                </div>
                {criteria.requiredCriteria.map((c, i) => (
                  <div className="crit-item" key={i}>
                    <span className="crit-mark">
                      {c.met
                        ? <CheckSquare size={12} strokeWidth={2} style={{ color: "var(--green)" }} />
                        : <Square size={12} strokeWidth={2} style={{ color: "var(--gray)" }} />}
                    </span>
                    <div className="crit-text">
                      {c.label}
                      {c.evidence && <div className="crit-evidence">{c.evidence}</div>}
                    </div>
                  </div>
                ))}
              </>
            ) : <span className="pending">Pending…</span>}
          </Sec>

          <Sec
            icon={<Shield size={11} strokeWidth={2} />}
            title="Compliance"
            action={
              onRefreshCompliance && (
                <button
                  onClick={() => onRefreshCompliance(request.id)}
                  disabled={refreshingCompliance}
                  className="btn"
                  style={{ padding: "2px 8px", fontSize: "9px" }}
                  title="Re-run compliance check"
                >
                  <RefreshCw size={10} strokeWidth={2} />
                  {refreshingCompliance ? "Running…" : "Re-run"}
                </button>
              )
            }
          >
            {compliance ? (
              <>
                <div className="comp-hdr">
                  <span className={`comp-overall comp-${compliance.overall}`}>{compliance.overall}</span>
                  <span className="comp-source">
                    {compliance.source === "opsera" ? "Opsera (live)" : "Opsera"}
                  </span>
                </div>
                {compliance.checks.map((c, i) => (
                  <div className="comp-item" key={i}>
                    <span className="comp-icon">{COMPLIANCE_ICON[c.status]}</span>
                    <div>
                      {c.label}
                      {c.detail && <div className="comp-detail">{c.detail}</div>}
                    </div>
                  </div>
                ))}
              </>
            ) : <span className="pending">Pending…</span>}
          </Sec>

          <Sec icon={<FileOutput size={11} strokeWidth={2} />} title="Submission">
            {submission ? (
              <>
                <div className="data-lbl">Method</div>
                <div className="data-val">{METHOD_LABEL[submission.method]}</div>
                {submission.confirmationId && (
                  <>
                    <div className="data-lbl">Confirmation</div>
                    <div className="data-val">{submission.confirmationId}</div>
                  </>
                )}
                <div className="data-small" style={{ wordBreak: "break-all" }}>{submission.portalUrl}</div>
                <div className="data-small" style={{ marginTop: 4 }}>{new Date(submission.submittedAt).toLocaleString()}</div>
              </>
            ) : <span className="pending">Pending…</span>}
          </Sec>
        </div>
      )}

      {tab === "packet" && (
        <div className="packet">
          {request.formFill
            ? request.formFill.packetMarkdown
            : <span className="packet-empty">PA packet will appear after the form-fill agent runs.</span>}
        </div>
      )}

      {tab === "audit" && (
        request.auditTrail.length > 0
          ? <AgentTimeline entries={request.auditTrail} />
          : <span className="pending">No audit entries yet.</span>
      )}

      <div style={{ marginTop: 16 }}>
        <Sec icon={<FileText size={11} strokeWidth={2} />} title="Note">
          <pre className="raw-note-text">{request.rawNote}</pre>
        </Sec>
      </div>
    </div>
  );
}
