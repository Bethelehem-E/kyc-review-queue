"use client";

import { useActionState, useState } from "react";
import { submitDecision, type DecisionState } from "./actions";
import {
  DECISION_ACTIONS,
  REASON_MAX_LENGTH,
  REASON_MIN_LENGTH,
  REASON_REQUIRED_ACTIONS,
  type DecisionAction,
} from "@/lib/validation";

const LABELS: Record<DecisionAction, string> = {
  APPROVE: "Approve",
  REJECT: "Reject",
  REQUEST_MORE_INFO: "Request more information",
};

const BUTTON_STYLES: Record<DecisionAction, string> = {
  APPROVE: "bg-emerald-600 hover:bg-emerald-700",
  REJECT: "bg-rose-600 hover:bg-rose-700",
  REQUEST_MORE_INFO: "bg-sky-600 hover:bg-sky-700",
};

export function DecisionPanel({
  caseId,
  canDecide,
  decidable,
  lockedByOther,
  highRisk,
}: {
  caseId: string;
  canDecide: boolean;
  decidable: boolean;
  lockedByOther: boolean;
  highRisk: boolean;
}) {
  const [action, setAction] = useState<DecisionAction>("APPROVE");
  const [state, formAction, pending] = useActionState<DecisionState, FormData>(
    submitDecision.bind(null, caseId),
    {}
  );

  // UI-level gate only. The server re-checks role and case state on every call.
  if (!canDecide) {
    return (
      <p className="text-sm text-slate-600">Your role does not permit actioning KYC cases.</p>
    );
  }
  if (!decidable) {
    return (
      <p className="text-sm text-slate-600">
        This case has reached a final decision and can no longer be actioned.
      </p>
    );
  }
  if (lockedByOther) {
    return (
      <p className="text-sm text-slate-600">
        This case is claimed by another analyst. They must release it before you can action it.
      </p>
    );
  }

  const reasonRequired = REASON_REQUIRED_ACTIONS.includes(action);
  const needsCountersign = highRisk && action !== "REQUEST_MORE_INFO";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="action" value={action} />
      <div className="flex flex-wrap gap-2">
        {DECISION_ACTIONS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={action === candidate}
            onClick={() => setAction(candidate)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              action === candidate
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {LABELS[candidate]}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="reason" className="block text-sm font-medium text-slate-700">
          Reason {reasonRequired ? <span className="text-rose-600">(required)</span> : "(optional)"}
        </label>
        <textarea
          id="reason"
          name="reason"
          rows={4}
          required={reasonRequired}
          minLength={reasonRequired ? REASON_MIN_LENGTH : undefined}
          maxLength={REASON_MAX_LENGTH}
          placeholder={
            reasonRequired
              ? "Explain the decision. Do not include customer identifiers such as full document numbers."
              : "Optional context for the audit trail."
          }
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
        <p className="mt-1 text-xs text-slate-500">
          Letters, numbers and basic punctuation only. Stored permanently in the audit history.
        </p>
      </div>

      {needsCountersign ? (
        <p className="rounded-md bg-violet-50 px-3 py-2 text-sm text-violet-900">
          High risk: this will be recorded as a proposal and only takes effect once a second
          reviewer countersigns it.
        </p>
      ) : null}

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
        className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${BUTTON_STYLES[action]}`}
      >
        {pending ? "Saving…" : needsCountersign ? `Propose: ${LABELS[action]}` : `Confirm: ${LABELS[action]}`}
      </button>
    </form>
  );
}
