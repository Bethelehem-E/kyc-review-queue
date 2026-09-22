"use server";

import { revalidatePath } from "next/cache";
import { decideCase } from "@/lib/services/cases";
import type { DecisionAction } from "@/lib/validation";

export type DecisionState = { error?: string; success?: string };

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
    revalidatePath(`/cases/${caseId}`);
    revalidatePath("/");
    revalidatePath("/audit");
    return { success: `Case moved to ${result.toStatus.replaceAll("_", " ").toLowerCase()}.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not record the decision.";
    return { error: message };
  }
}
