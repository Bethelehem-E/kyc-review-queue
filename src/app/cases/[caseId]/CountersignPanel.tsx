"use client";

import { useActionState, useState } from "react";
import { submitCountersign, type DecisionState } from "./actions";
import { REASON_MAX_LENGTH, REASON_MIN_LENGTH } from "@/lib/validation";

export function CountersignPanel({
  caseId,
  proposedStatus,
  proposedBy,
  proposedReason,
  canCountersign,
  blockedReason,
}: {
  caseId: string;
  proposedStatus: string;
  proposedBy: string;
  proposedReason: string | null;
  canCountersign: boolean;
  blockedReason: string | null;
}) {
  const [outcome, setOutcome] = useState<"CONFIRM" | "RETURN">("CONFIRM");
  const [state, formAction, pending] = useActionState<DecisionState, FormData>(
    submitCountersign.bind(null, caseId),
    {}
  );

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2">
        <p className="text-sm text-violet-900">
          <span className="font-medium">{proposedBy}</span> proposed{" "}
          {proposedStatus.toLowerCase()} on this high-risk case.
        </p>
        {proposedReason ? (
          <p className="mt-1 text-sm text-violet-900">{proposedReason}</p>
        ) : null}
      </div>

      {/* UI-level gate only. The server re-checks role and maker identity. */}
      {!canCountersign ? (
        <p className="text-sm text-slate-600">{blockedReason}</p>
      ) : (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="outcome" value={outcome} />
          <div className="flex flex-wrap gap-2">
            {(["CONFIRM", "RETURN"] as const).map((candidate) => (
              <button
                key={candidate}
                type="button"
                aria-pressed={outcome === candidate}
                onClick={() => setOutcome(candidate)}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  outcome === candidate
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {candidate === "CONFIRM" ? "Countersign" : "Return to maker"}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="countersign-reason" className="block text-sm font-medium text-slate-700">
              Reason{" "}
              {outcome === "RETURN" ? (
                <span className="text-rose-600">(required)</span>
              ) : (
                "(optional)"
              )}
            </label>
            <textarea
              id="countersign-reason"
              name="reason"
              rows={3}
              required={outcome === "RETURN"}
              minLength={outcome === "RETURN" ? REASON_MIN_LENGTH : undefined}
              maxLength={REASON_MAX_LENGTH}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
          </div>

          {state.error ? (
            <p role="alert" className="text-sm text-rose-600">
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p role="status" className="text-sm text-emerald-700">
              {state.success}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
              outcome === "CONFIRM"
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-amber-600 hover:bg-amber-700"
            }`}
          >
            {pending ? "Saving…" : outcome === "CONFIRM" ? "Confirm decision" : "Return to maker"}
          </button>
        </form>
      )}
    </div>
  );
}
