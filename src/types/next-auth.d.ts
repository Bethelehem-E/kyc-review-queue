import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ANALYST" | "REVIEWER" | "ADMIN";
    } & DefaultSession["user"];
  }

  interface User {
    role?: "ANALYST" | "REVIEWER" | "ADMIN";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "ANALYST" | "REVIEWER" | "ADMIN";
  }
}
