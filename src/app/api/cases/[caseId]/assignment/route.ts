import { NextResponse, type NextRequest } from "next/server";
import { ValidationError, setCaseAssignment } from "@/lib/services/cases";
import { errorResponse } from "@/lib/http";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;
    const body = await request.json().catch(() => ({}));
    const intent = (body as { intent?: unknown }).intent;
    if (intent !== "CLAIM" && intent !== "RELEASE") {
      throw new ValidationError("Intent must be CLAIM or RELEASE.");
    }
    return NextResponse.json(await setCaseAssignment(caseId, intent));
  } catch (error) {
    return errorResponse(error);
  }
}
