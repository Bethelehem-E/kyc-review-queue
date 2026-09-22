"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { QueueFilter } from "@/lib/validation";

const STATUS_OPTIONS = ["ALL", "PENDING", "MORE_INFO_REQUESTED", "APPROVED", "REJECTED"] as const;
const RISK_OPTIONS = ["ALL", "HIGH", "MEDIUM", "LOW"] as const;
const SORT_OPTIONS = [
  { value: "OLDEST", label: "Oldest first" },
  { value: "NEWEST", label: "Most recent" },
  { value: "RISK", label: "Highest risk" },
  { value: "STATUS", label: "Status" },
] as const;

const selectClass =
  "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-slate-500";

export function QueueFilters({ filter }: { filter: QueueFilter }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "ALL") next.delete(key);
    else next.set(key, value);
    startTransition(() => router.replace(`/?${next.toString()}`));
  }

  return (
    <div className="mt-4 flex flex-wrap items-end gap-3" data-pending={pending}>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Search
        <input
          type="search"
          defaultValue={filter.search}
          placeholder="Case ID or customer"
          onChange={(e) => update("search", e.target.value)}
          className={`${selectClass} w-56`}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Status
        <select value={filter.status} onChange={(e) => update("status", e.target.value)} className={selectClass}>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === "ALL" ? "All statuses" : option.replaceAll("_", " ").toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Risk
        <select value={filter.risk} onChange={(e) => update("risk", e.target.value)} className={selectClass}>
          {RISK_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === "ALL" ? "All risk levels" : option.toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Sort
        <select value={filter.sort} onChange={(e) => update("sort", e.target.value)} className={selectClass}>
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
