import { NextResponse, type NextRequest } from "next/server";
import { listAuditEvents } from "@/lib/services/cases";
import { errorResponse } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const events = await listAuditEvents({
      caseId: params.get("caseId")?.slice(0, 64) || undefined,
      actorEmail: params.get("actorEmail")?.slice(0, 254) || undefined,
    });
    return NextResponse.json({ events });
  } catch (error) {
    return errorResponse(error);
  }
}
