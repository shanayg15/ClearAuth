"use client";

import { AuthRequest } from "@/types";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface AuthRequestCardProps {
  request: AuthRequest;
  onSelect: (request: AuthRequest) => void;
  isSelected: boolean;
}

export function AuthRequestCard({ request, onSelect, isSelected }: AuthRequestCardProps) {
  const name = request.patient?.name ?? request.extraction?.patient.name ?? "New Request";
  const treatment = request.extraction?.requestedTreatment ?? "Awaiting extraction…";
  const payer = request.patient?.insurer ?? request.extraction?.payer;

  return (
    <button
      onClick={() => onSelect(request)}
      className={`w-full text-left p-3 rounded-lg border transition-all ${
        isSelected
          ? "border-emerald-500 bg-emerald-50"
          : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{name}</h3>
          <p className="text-sm text-gray-600 truncate">{treatment}</p>
          {payer && <p className="text-xs text-gray-400 truncate">{payer}</p>}
        </div>
        <StatusBadge status={request.status} />
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
        <span>{new Date(request.createdAt).toLocaleTimeString()}</span>
        <span>{request.auditTrail.length} steps</span>
      </div>
    </button>
  );
}
