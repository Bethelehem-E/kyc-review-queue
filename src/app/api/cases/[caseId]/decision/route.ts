import { NextResponse, type NextRequest } from "next/server";
import { decideCase } from "@/lib/services/cases";
import { errorResponse } from "@/lib/http";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await decideCase(caseId, body);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
