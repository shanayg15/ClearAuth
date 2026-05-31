"use client";

import { AuditEntry } from "@/types";

const AGENT_ICONS: Record<string, string> = {
  "extraction-agent": "🩺",
  "criteria-agent": "📋",
  "formfill-agent": "📝",
  "compliance-agent": "🛡️",
  "submission-agent": "📤",
  pipeline: "⚙️",
  "payer-webhook": "📬",
};

export function AgentTimeline({ entries }: { entries: AuditEntry[] }) {
  return (
    <div className="flow-root">
      <ul className="-mb-8">
        {entries.map((entry, idx) => (
          <li key={entry.id}>
            <div className="relative pb-8">
              {idx < entries.length - 1 && (
                <span className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-gray-200" />
              )}
              <div className="relative flex space-x-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm">
                  {AGENT_ICONS[entry.agentRole] ?? "⚙️"}
                </div>
                <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {entry.action}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {entry.details.substring(0, 200)}
                    </p>
                  </div>
                  <div className="whitespace-nowrap text-right text-xs text-gray-400">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
