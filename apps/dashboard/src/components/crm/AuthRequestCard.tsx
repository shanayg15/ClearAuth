"use client";

import { AuthRequest } from "@/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Clock, Layers } from "lucide-react";

interface AuthRequestCardProps {
  request: AuthRequest;
  onSelect: (request: AuthRequest) => void;
  isSelected: boolean;
}

export function AuthRequestCard({ request, onSelect, isSelected }: AuthRequestCardProps) {
  const name      = request.patient?.name ?? request.extraction?.patient.name ?? "New Request";
  const treatment = request.extraction?.requestedTreatment ?? "Awaiting extraction…";
  const payer     = request.patient?.insurer ?? request.extraction?.payer;

  return (
    <button onClick={() => onSelect(request)} className={`req-card${isSelected ? " selected" : ""}`}>
      <div className="req-row">
        <div className="req-info">
          <span className="req-name">{name}</span>
          <span className="req-treatment">{treatment}</span>
          {payer && <span className="req-payer">{payer}</span>}
        </div>
        <StatusBadge status={request.status} />
      </div>
      <div className="req-meta">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          <Clock size={9} strokeWidth={2} />
          {new Date(request.createdAt).toLocaleTimeString()}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          <Layers size={9} strokeWidth={2} />
          {request.auditTrail.length}
        </span>
      </div>
    </button>
  );
}
