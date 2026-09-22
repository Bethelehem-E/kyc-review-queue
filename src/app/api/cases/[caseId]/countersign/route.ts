import { NextResponse, type NextRequest } from "next/server";
import { ValidationError, resolveProposedDecision } from "@/lib/services/cases";
import { errorResponse } from "@/lib/http";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;
    const body = await request.json().catch(() => ({}));
    const outcome = (body as { outcome?: unknown }).outcome;
    if (outcome !== "CONFIRM" && outcome !== "RETURN") {
      throw new ValidationError("Outcome must be CONFIRM or RETURN.");
    }
    const result = await resolveProposedDecision(
      caseId,
      outcome,
      (body as { reason?: unknown }).reason
    );
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
