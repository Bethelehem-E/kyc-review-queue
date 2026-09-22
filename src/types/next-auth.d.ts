import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ANALYST" | "ADMIN";
    } & DefaultSession["user"];
  }

  interface User {
    role?: "ANALYST" | "ADMIN";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "ANALYST" | "ADMIN";
  }
}
