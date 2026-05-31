import { AuditEntry } from "@clearauth/types";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

// Tamper-evident audit entries. Each entry carries a SHA-256 checksum over its
// own contents so the compliance trail can be verified after the fact.
export function createAuditEntry(
  agentRole: string,
  action: string,
  details: string
): AuditEntry {
  const entry: AuditEntry = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    agentRole,
    action,
    details,
  };

  entry.checksum = crypto
    .createHash("sha256")
    .update(JSON.stringify({ ...entry, checksum: undefined }))
    .digest("hex");

  return entry;
}

export function verifyAuditEntry(entry: AuditEntry): boolean {
  const expected = crypto
    .createHash("sha256")
    .update(JSON.stringify({ ...entry, checksum: undefined }))
    .digest("hex");
  return expected === entry.checksum;
}
