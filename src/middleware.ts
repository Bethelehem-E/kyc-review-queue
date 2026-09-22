import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

// Layer 1 of 3: coarse route gate. Never the only authorization check —
// every service call re-verifies the session and role server-side.
export default auth((request) => {
  if (request.auth || request.nextUrl.pathname === "/login") return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    // API clients get a status code, not a login page.
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const login = new URL("/login", request.nextUrl);
  login.searchParams.set("callbackUrl", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
