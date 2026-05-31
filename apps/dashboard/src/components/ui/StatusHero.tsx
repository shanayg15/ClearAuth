"use client";

import { AuthStatus } from "@/types";
import { Check, X, Zap, Clock } from "lucide-react";

const STEPS: { label: string; statuses: AuthStatus[] }[] = [
  { label: "Intake",     statuses: ["intake"] },
  { label: "Extract",    statuses: ["extracting"] },
  { label: "Criteria",   statuses: ["checking_criteria"] },
  { label: "Form",       statuses: ["filling_form"] },
  { label: "Compliance", statuses: ["compliance_review"] },
  { label: "Submit",     statuses: ["ready_to_submit", "submitting", "submitted"] },
  { label: "Review",     statuses: ["under_review"] },
  { label: "Done",       statuses: ["approved", "denied"] },
];

const LABELS: Record<AuthStatus, string> = {
  intake:            "Intake",
  extracting:        "Extracting clinical data",
  checking_criteria: "Checking coverage criteria",
  filling_form:      "Filling authorization form",
  compliance_review: "Compliance review",
  ready_to_submit:   "Ready to submit",
  submitting:        "Submitting to payer portal",
  submitted:         "Submitted",
  under_review:      "Under review",
  approved:          "Approved",
  denied:            "Denied",
  error:             "Error",
};

function activeStepFor(status: AuthStatus): number {
  if (status === "approved" || status === "denied") return STEPS.length;
  let idx = 0;
  STEPS.forEach((step, i) => { if (step.statuses.includes(status)) idx = i; });
  return idx;
}

export function StatusHero({ status }: { status: AuthStatus }) {
  const isGood   = status === "approved";
  const isBad    = status === "denied" || status === "error";
  const isActive = !isGood && !isBad && status !== "intake";
  const isDone   = isGood || isBad;
  const activeStep = activeStepFor(status);

  const statusCls = isGood ? "s-good" : isBad ? "s-bad" : isActive ? "s-active" : "";
  const StatusIcon = isGood ? Check : isBad ? X : isActive ? Zap : Clock;

  return (
    <div className="sh">
      <div className="sh-lbl">Authorization Status</div>
      <div className="sh-rule" />
      <div className={`sh-status ${statusCls}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <StatusIcon size={18} strokeWidth={2.5} />
        {LABELS[status]}
      </div>
      <div className="sh-step-n">
        Step {Math.min(activeStep + (isDone ? 0 : 1), STEPS.length)} of {STEPS.length}
      </div>

      <div className="stepper">
        {STEPS.map((step, i) => {
          const done   = i < activeStep || isDone;
          const active = i === activeStep && !isDone;
          const failed = isBad && i === activeStep;
          const sqCls  = done ? "s-done" : failed ? "s-failed" : active ? "s-active" : "";
          const lblCls = done ? "s-done" : active ? "s-active" : "";
          const lineCls= (i < activeStep || isDone) ? "s-filled" : "";

          return (
            <div className="st-cell" key={step.label}>
              <div className="st-node">
                <div className={`st-sq ${sqCls}`}>
                  {done
                    ? <Check size={9} strokeWidth={3} />
                    : failed
                    ? <X size={9} strokeWidth={3} />
                    : i + 1}
                </div>
                <span className={`st-lbl ${lblCls}`}>{step.label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`st-line ${lineCls}`} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
