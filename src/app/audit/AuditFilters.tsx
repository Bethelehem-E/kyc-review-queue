"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AuditFilters({
  caseId,
  actorEmail,
  analysts,
}: {
  caseId: string;
  actorEmail: string;
  analysts: { email: string; name: string }[];
}) {
  const router = useRouter();
  const [caseInput, setCaseInput] = useState(caseId);

  function apply(next: { caseId?: string; actorEmail?: string }) {
    const params = new URLSearchParams();
    const nextCase = (next.caseId ?? caseId).trim();
    const nextActor = next.actorEmail ?? actorEmail;
    if (nextCase) params.set("caseId", nextCase);
    if (nextActor) params.set("actorEmail", nextActor);
    const query = params.toString();
    router.replace(query ? `/audit?${query}` : "/audit");
  }

  return (
    <form
      className="mt-4 flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        apply({ caseId: caseInput });
      }}
    >
      <label className="flex flex-col text-xs font-medium text-slate-600">
        Case ID
        <input
          value={caseInput}
          onChange={(event) => setCaseInput(event.target.value)}
          placeholder="KYC-1001"
          maxLength={64}
          className="mt-1 w-48 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
      </label>

      <label className="flex flex-col text-xs font-medium text-slate-600">
        Analyst
        <select
          value={actorEmail}
          onChange={(event) => apply({ actorEmail: event.target.value })}
          className="mt-1 w-64 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
        >
          <option value="">All analysts</option>
          {analysts.map((analyst) => (
            <option key={analyst.email} value={analyst.email}>
              {analyst.name} ({analyst.email})
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
      >
        Apply
      </button>
    </form>
  );
}
