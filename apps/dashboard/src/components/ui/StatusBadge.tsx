"use client";

import { AuthStatus } from "@/types";

const STATUS_STYLES: Record<AuthStatus, { bg: string; text: string; label: string }> = {
  intake: { bg: "bg-gray-100", text: "text-gray-700", label: "Intake" },
  extracting: { bg: "bg-blue-100", text: "text-blue-800", label: "Extracting" },
  checking_criteria: { bg: "bg-indigo-100", text: "text-indigo-800", label: "Checking Criteria" },
  filling_form: { bg: "bg-violet-100", text: "text-violet-800", label: "Filling Form" },
  compliance_review: { bg: "bg-amber-100", text: "text-amber-800", label: "Compliance Review" },
  ready_to_submit: { bg: "bg-teal-100", text: "text-teal-800", label: "Ready to Submit" },
  submitting: { bg: "bg-cyan-100", text: "text-cyan-800", label: "Submitting" },
  submitted: { bg: "bg-sky-100", text: "text-sky-800", label: "Submitted" },
  under_review: { bg: "bg-purple-100", text: "text-purple-800", label: "Under Review" },
  approved: { bg: "bg-green-100", text: "text-green-800", label: "Approved" },
  denied: { bg: "bg-red-100", text: "text-red-800", label: "Denied" },
  error: { bg: "bg-rose-100", text: "text-rose-800", label: "Error" },
};

const ACTIVE: AuthStatus[] = [
  "extracting",
  "checking_criteria",
  "filling_form",
  "compliance_review",
  "submitting",
];

export function StatusBadge({ status }: { status: AuthStatus }) {
  const style = STATUS_STYLES[status];
  const pulse = ACTIVE.includes(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}
    >
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-60" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" />
        </span>
      )}
      {style.label}
    </span>
  );
}
