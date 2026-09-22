"use client";

import { useActionState } from "react";
import { submitAssignment, type DecisionState } from "./actions";

export function AssignmentPanel({
  caseId,
  assignee,
  heldByMe,
}: {
  caseId: string;
  assignee: { name: string; email: string } | null;
  heldByMe: boolean;
}) {
  const [state, formAction, pending] = useActionState<DecisionState, FormData>(
    submitAssignment.bind(null, caseId),
    {}
  );

  return (
    <form action={formAction} className="space-y-2">
      <p className="text-sm text-slate-700">
        {assignee
          ? heldByMe
            ? "Claimed by you."
            : `Claimed by ${assignee.name} (${assignee.email}).`
          : "Unclaimed — claim it so no one else works the same case."}
      </p>
      <input type="hidden" name="intent" value={heldByMe || assignee ? "RELEASE" : "CLAIM"} />
      <button
        type="submit"
        disabled={pending || (!!assignee && !heldByMe)}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {heldByMe ? "Release case" : assignee ? "Claimed by another analyst" : "Claim case"}
      </button>
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
    </form>
  );
}
