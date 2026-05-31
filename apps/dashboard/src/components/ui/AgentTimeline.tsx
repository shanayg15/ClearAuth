"use client";

import { AuditEntry } from "@/types";
import {
  Activity, ClipboardList, FileEdit, Shield, Send, Settings, Bell, HelpCircle,
} from "lucide-react";

const ROLE_ICON: Record<string, React.ReactNode> = {
  "extraction-agent": <Activity size={13} strokeWidth={2} />,
  "criteria-agent":   <ClipboardList size={13} strokeWidth={2} />,
  "formfill-agent":   <FileEdit size={13} strokeWidth={2} />,
  "compliance-agent": <Shield size={13} strokeWidth={2} />,
  "submission-agent": <Send size={13} strokeWidth={2} />,
  "pipeline":         <Settings size={13} strokeWidth={2} />,
  "payer-webhook":    <Bell size={13} strokeWidth={2} />,
};

const ROLE_LABEL: Record<string, string> = {
  "extraction-agent": "Extract",
  "criteria-agent":   "Criteria",
  "formfill-agent":   "Form",
  "compliance-agent": "Compliance",
  "submission-agent": "Submit",
  "pipeline":         "Pipeline",
  "payer-webhook":    "Webhook",
};

export function AgentTimeline({ entries }: { entries: AuditEntry[] }) {
  return (
    <div>
      {entries.map((entry) => (
        <div className="tl-entry" key={entry.id}>
          <span className="tl-role" title={ROLE_LABEL[entry.agentRole] ?? entry.agentRole}>
            {ROLE_ICON[entry.agentRole] ?? <HelpCircle size={13} strokeWidth={2} />}
          </span>
          <div className="tl-main">
            <div className="tl-action">{entry.action}</div>
            {entry.details && (
              <div className="tl-detail">{entry.details.substring(0, 200)}</div>
            )}
          </div>
          <span className="tl-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
        </div>
      ))}
    </div>
  );
}
