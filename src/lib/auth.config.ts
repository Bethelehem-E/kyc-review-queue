import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe half of the auth config: no database or bcrypt imports, so it can
 * run in middleware. The route gate here is the *first* of three checks; the
 * authoritative one lives in the service layer (src/lib/services/cases.ts).
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  trustHost: true,
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role ?? "ANALYST";
        token.name = user.name ?? null;
        token.email = user.email ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = (token.role as "ANALYST" | "ADMIN") ?? "ANALYST";
      }
      return session;
    },
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const { pathname } = request.nextUrl;
      if (pathname === "/login") return true;
      return isLoggedIn;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
