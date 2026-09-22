import { NextResponse, type NextRequest } from "next/server";
import { listCases } from "@/lib/services/cases";
import { errorResponse } from "@/lib/http";
import { queueFilterSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const filter = queueFilterSchema.parse({
      status: params.get("status") ?? undefined,
      risk: params.get("risk") ?? undefined,
      search: params.get("search") ?? undefined,
      sort: params.get("sort") ?? undefined,
    });
    return NextResponse.json({ cases: await listCases(filter) });
  } catch (error) {
    return errorResponse(error);
  }
}
