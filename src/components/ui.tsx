import type { CaseStatus, RiskLevel } from "@prisma/client";

const STATUS_STYLES: Record<CaseStatus, string> = {
  PENDING: "bg-slate-100 text-slate-700 ring-slate-300",
  APPROVED: "bg-emerald-50 text-emerald-700 ring-emerald-300",
  REJECTED: "bg-rose-50 text-rose-700 ring-rose-300",
  MORE_INFO_REQUESTED: "bg-sky-50 text-sky-700 ring-sky-300",
};

const RISK_STYLES: Record<RiskLevel, string> = {
  LOW: "bg-emerald-50 text-emerald-700 ring-emerald-300",
  MEDIUM: "bg-amber-50 text-amber-800 ring-amber-300",
  HIGH: "bg-rose-50 text-rose-700 ring-rose-300",
};

export function statusLabel(status: CaseStatus) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function StatusBadge({ status }: { status: CaseStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {statusLabel(status)}
    </span>
  );
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${RISK_STYLES[level]}`}
    >
      {level}
    </span>
  );
}

export function AgingBadge({ level }: { level: "none" | "warning" | "critical" }) {
  if (level === "none") return null;
  const critical = level === "critical";
  return (
    <span
      title={critical ? "Open more than 7 days" : "Open more than 3 days"}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        critical ? "bg-rose-600 text-white ring-rose-700" : "bg-amber-100 text-amber-900 ring-amber-300"
      }`}
    >
      {critical ? "SLA breached" : "Aging"}
    </span>
  );
}

export function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value);
}
