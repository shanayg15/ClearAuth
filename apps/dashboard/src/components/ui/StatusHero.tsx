"use client";

import { AuthStatus } from "@/types";

// The single most important visual: a big, animated status pill that transitions
// intake → … → submitted → under_review → APPROVED in real time, above a stepper
// that fills as the agent pipeline progresses. Keyed by status so React remounts
// (and re-animates) the pill on every transition that arrives over SSE.

const STEPS: { label: string; reached: AuthStatus[] }[] = [
  { label: "Intake", reached: ["intake"] },
  { label: "Extract", reached: ["extracting"] },
  { label: "Criteria", reached: ["checking_criteria"] },
  { label: "Form", reached: ["filling_form"] },
  { label: "Compliance", reached: ["compliance_review"] },
  { label: "Submit", reached: ["ready_to_submit", "submitting", "submitted"] },
  { label: "Review", reached: ["under_review"] },
  { label: "Approved", reached: ["approved"] },
];

const LABELS: Record<AuthStatus, string> = {
  intake: "Intake",
  extracting: "Extracting clinical data",
  checking_criteria: "Checking coverage criteria",
  filling_form: "Filling authorization form",
  compliance_review: "Compliance review",
  ready_to_submit: "Ready to submit",
  submitting: "Submitting to payer portal",
  submitted: "Submitted",
  under_review: "Under review",
  approved: "Approved",
  denied: "Denied",
  error: "Error",
};

type Tone = "good" | "bad" | "active" | "idle";

function toneFor(status: AuthStatus): Tone {
  if (status === "approved") return "good";
  if (status === "denied" || status === "error") return "bad";
  if (status === "intake") return "idle";
  return "active";
}

const PILL_TONE: Record<Tone, string> = {
  good: "bg-emerald-500 text-white animate-approved-glow",
  bad: "bg-red-500 text-white",
  active: "bg-blue-500 text-white animate-pulse-glow",
  idle: "bg-gray-200 text-gray-700",
};

// Index of the currently-active step (earlier steps render as complete).
function activeStepFor(status: AuthStatus): number {
  if (status === "approved") return STEPS.length;
  let idx = 0;
  STEPS.forEach((step, i) => {
    if (step.reached.includes(status)) idx = i;
  });
  return idx;
}

export function StatusHero({ status }: { status: AuthStatus }) {
  const tone = toneFor(status);
  const activeStep = activeStepFor(status);
  const isApproved = status === "approved";
  const isBad = tone === "bad";

  return (
    <div className="space-y-4">
      {/* Big animated status pill */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Authorization status
          </p>
          <div
            key={status}
            className={`animate-status-pop mt-1.5 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-lg font-extrabold shadow-sm ${PILL_TONE[tone]}`}
          >
            {isApproved && <span aria-hidden>✓</span>}
            {isBad && <span aria-hidden>✕</span>}
            {LABELS[status]}
          </div>
        </div>
        <span className="text-xs text-gray-400">
          Step {Math.min(activeStep + (isApproved ? 0 : 1), STEPS.length)} of {STEPS.length}
        </span>
      </div>

      {/* Stepper */}
      <ol className="flex items-center">
        {STEPS.map((step, i) => {
          const done = i < activeStep || isApproved;
          const active = i === activeStep && !isApproved && !isBad;
          const failed = isBad && i === activeStep;
          const dot = done
            ? "bg-emerald-500 border-emerald-500 text-white"
            : failed
              ? "bg-red-500 border-red-500 text-white"
              : active
                ? "bg-blue-500 border-blue-500 text-white animate-pulse-glow"
                : "bg-white border-gray-300 text-gray-400";
          const connectorFilled = i < activeStep || isApproved;
          return (
            <li key={step.label} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-bold transition-colors ${dot}`}
                >
                  {done ? "✓" : i + 1}
                </div>
                <span
                  className={`mt-1 hidden text-[10px] sm:block ${
                    active ? "font-semibold text-blue-600" : done ? "text-emerald-600" : "text-gray-400"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="mx-1 h-0.5 flex-1 overflow-hidden rounded bg-gray-200">
                  <div
                    className={`h-full ${connectorFilled ? "bg-emerald-500" : "bg-gray-200"} ${
                      active ? "shimmer-bar" : ""
                    }`}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
