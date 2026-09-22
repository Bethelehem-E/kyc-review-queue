import { NextResponse } from "next/server";
import {
  AuthError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/services/cases";

/**
 * Maps service errors to responses. Unknown errors are logged server-side and
 * returned as a generic 500 so internals never leak to the client.
 */
export function errorResponse(error: unknown) {
  if (
    error instanceof AuthError ||
    error instanceof ForbiddenError ||
    error instanceof NotFoundError ||
    error instanceof ValidationError ||
    error instanceof ConflictError
  ) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Unhandled API error", error);
  return NextResponse.json({ error: "Internal server error." }, { status: 500 });
}
