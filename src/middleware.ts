import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Layer 1 of 3: coarse route gate. Never the only authorization check —
// every service call re-verifies the session and role server-side.
export const { auth: middleware } = NextAuth(authConfig);

export default middleware;

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
