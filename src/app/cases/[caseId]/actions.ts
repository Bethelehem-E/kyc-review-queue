"use server";

import { revalidatePath } from "next/cache";
import { decideCase, resolveProposedDecision, setCaseAssignment } from "@/lib/services/cases";
import type { DecisionAction } from "@/lib/validation";

export type DecisionState = { error?: string; success?: string };

function revalidateCase(caseId: string) {
  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/");
  revalidatePath("/audit");
}

export async function submitDecision(
  caseId: string,
  _prev: DecisionState,
  formData: FormData
): Promise<DecisionState> {
  try {
    const result = await decideCase(caseId, {
      action: String(formData.get("action") ?? "") as DecisionAction,
      reason: String(formData.get("reason") ?? ""),
    });
    revalidateCase(caseId);
    if (result.proposedStatus) {
      return {
        success: `Proposed ${result.proposedStatus.toLowerCase()}. A second reviewer must countersign before it takes effect.`,
      };
    }
    return { success: `Case moved to ${result.toStatus.replaceAll("_", " ").toLowerCase()}.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not record the decision.";
    return { error: message };
  }
}

export async function submitCountersign(
  caseId: string,
  _prev: DecisionState,
  formData: FormData
): Promise<DecisionState> {
  const outcome = formData.get("outcome") === "RETURN" ? "RETURN" : "CONFIRM";
  try {
    const result = await resolveProposedDecision(caseId, outcome, formData.get("reason"));
    revalidateCase(caseId);
    return {
      success:
        outcome === "CONFIRM"
          ? `Countersigned. Case moved to ${result.toStatus.toLowerCase()}.`
          : "Proposal returned to the maker; the case is pending again.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not resolve the proposal.";
    return { error: message };
  }
}

export async function submitAssignment(
  caseId: string,
  _prev: DecisionState,
  formData: FormData
): Promise<DecisionState> {
  const intent = formData.get("intent") === "RELEASE" ? "RELEASE" : "CLAIM";
  try {
    await setCaseAssignment(caseId, intent);
    revalidateCase(caseId);
    return { success: intent === "CLAIM" ? "Case claimed." : "Case released." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update the assignment.";
    return { error: message };
  }
}
