"use client";

import { AuthStatus } from "@/types";
import { Check, X, Loader, Minus } from "lucide-react";

const STATUS_META: Record<AuthStatus, { cls: string; label: string; tone: "idle" | "active" | "good" | "bad" }> = {
  intake:            { cls: "badge-idle",   label: "Intake",           tone: "idle"   },
  extracting:        { cls: "badge-active", label: "Extracting",       tone: "active" },
  checking_criteria: { cls: "badge-active", label: "Criteria",         tone: "active" },
  filling_form:      { cls: "badge-active", label: "Form",             tone: "active" },
  compliance_review: { cls: "badge-active", label: "Compliance",       tone: "active" },
  ready_to_submit:   { cls: "badge-idle",   label: "Ready",            tone: "idle"   },
  submitting:        { cls: "badge-active", label: "Submitting",       tone: "active" },
  submitted:         { cls: "badge-idle",   label: "Submitted",        tone: "idle"   },
  under_review:      { cls: "badge-idle",   label: "Review",           tone: "idle"   },
  approved:          { cls: "badge-good",   label: "Approved",         tone: "good"   },
  denied:            { cls: "badge-bad",    label: "Denied",           tone: "bad"    },
  error:             { cls: "badge-bad",    label: "Error",            tone: "bad"    },
};

const IC = 9;

export function StatusBadge({ status }: { status: AuthStatus }) {
  const { cls, label, tone } = STATUS_META[status];
  const icon =
    tone === "good"   ? <Check size={IC} strokeWidth={2.5} /> :
    tone === "bad"    ? <X size={IC} strokeWidth={2.5} /> :
    tone === "active" ? <span className="badge-dot" /> :
                        <Minus size={IC} strokeWidth={2} />;
  return (
    <span className={`badge ${cls}`}>
      {icon}
      {label}
    </span>
  );
}
