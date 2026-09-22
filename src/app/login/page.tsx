import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-lg font-semibold">KYC Review Queue</h1>
        <p className="mt-1 text-sm text-slate-600">Sign in to review pending cases.</p>
        <LoginForm />
        <p className="mt-6 text-xs text-slate-500">
          Demo credentials are listed in the README. Replace this credentials provider with your
          identity provider before handling real customer data.
        </p>
      </div>
    </div>
  );
}
