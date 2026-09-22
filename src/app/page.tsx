import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AgingBadge, RiskBadge, StatusBadge, formatDate } from "@/components/ui";
import { agingLevel, listCases, requireActor } from "@/lib/services/cases";
import { queueFilterSchema } from "@/lib/validation";
import { QueueFilters } from "./QueueFilters";

export const dynamic = "force-dynamic";

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActor();
  const raw = await searchParams;
  const filter = queueFilterSchema.parse({
    status: typeof raw.status === "string" ? raw.status : undefined,
    risk: typeof raw.risk === "string" ? raw.risk : undefined,
    search: typeof raw.search === "string" ? raw.search : undefined,
    sort: typeof raw.sort === "string" ? raw.sort : undefined,
  });

  const cases = await listCases(filter);
  const now = new Date();
  const aged = cases.filter((c) => agingLevel(c, now) !== "none");

  return (
    <AppShell actor={actor}>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Review queue</h1>
          <p className="mt-1 text-sm text-slate-600">
            {cases.length} case{cases.length === 1 ? "" : "s"} matching your filters
          </p>
        </div>
      </div>

      {aged.length > 0 ? (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>{aged.length}</strong> open case{aged.length === 1 ? " has" : "s have"} been
          waiting more than 3 days.{" "}
          {aged.filter((c) => agingLevel(c, now) === "critical").length} past the 7-day SLA.
        </div>
      ) : null}

      <QueueFilters filter={filter} />

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Case ID</th>
              <th className="px-4 py-3 font-medium">Customer name</th>
              <th className="px-4 py-3 font-medium">Risk level</th>
              <th className="px-4 py-3 font-medium">Submitted</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Age</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cases.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">
                  <Link href={`/cases/${c.caseId}`} className="text-slate-900 underline-offset-2 hover:underline">
                    {c.caseId}
                  </Link>
                </td>
                <td className="px-4 py-3">{c.customerName}</td>
                <td className="px-4 py-3">
                  <RiskBadge level={c.riskLevel} />
                </td>
                <td className="px-4 py-3 text-slate-600">{formatDate(c.submittedAt)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-4 py-3">
                  <AgingBadge level={agingLevel(c, now)} />
                </td>
              </tr>
            ))}
            {cases.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  No cases match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
