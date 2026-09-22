import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { formatDate, statusLabel } from "@/components/ui";
import { listAuditEvents, requireActor } from "@/lib/services/cases";

export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActor();
  const raw = await searchParams;
  const caseId = typeof raw.caseId === "string" ? raw.caseId.slice(0, 64) : undefined;
  const actorEmail = typeof raw.actorEmail === "string" ? raw.actorEmail.slice(0, 254) : undefined;

  const events = await listAuditEvents({ caseId, actorEmail });

  return (
    <AppShell actor={actor}>
      <h1 className="text-xl font-semibold">Audit history</h1>
      <p className="mt-1 text-sm text-slate-600">
        Append-only record of every status change. Entries cannot be edited or deleted, and never
        contain customer identifiers.
      </p>

      {caseId || actorEmail ? (
        <p className="mt-3 text-sm">
          Filtered by {caseId ? <span className="font-medium">{caseId}</span> : null}
          {caseId && actorEmail ? " and " : null}
          {actorEmail ? <span className="font-medium">{actorEmail}</span> : null}.{" "}
          <Link href="/audit" className="text-slate-600 underline">
            Clear
          </Link>
        </p>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Timestamp</th>
              <th className="px-4 py-3 font-medium">Analyst</th>
              <th className="px-4 py-3 font-medium">Case</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Old status</th>
              <th className="px-4 py-3 font-medium">New status</th>
              <th className="px-4 py-3 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {events.map((event) => (
              <tr key={event.id}>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(event.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{event.actorName}</div>
                  <div className="text-xs text-slate-500">{event.actorEmail}</div>
                </td>
                <td className="px-4 py-3">
                  {event.case ? (
                    <Link href={`/cases/${event.case.caseId}`} className="underline-offset-2 hover:underline">
                      {event.case.caseId}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">{event.action.replaceAll("_", " ").toLowerCase()}</td>
                <td className="px-4 py-3">{event.fromStatus ? statusLabel(event.fromStatus) : "—"}</td>
                <td className="px-4 py-3">{event.toStatus ? statusLabel(event.toStatus) : "—"}</td>
                <td className="max-w-md px-4 py-3 text-slate-700">{event.reason ?? "—"}</td>
              </tr>
            ))}
            {events.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  No audit events recorded.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
