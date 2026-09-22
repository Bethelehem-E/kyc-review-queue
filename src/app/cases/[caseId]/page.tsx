import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseStatus } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { AgingBadge, RiskBadge, StatusBadge, formatDate, statusLabel } from "@/components/ui";
import { NotFoundError, agingLevel, getCaseDetail, requireActor } from "@/lib/services/cases";
import { DecisionPanel } from "./DecisionPanel";

export const dynamic = "force-dynamic";

const DECIDABLE: CaseStatus[] = [CaseStatus.PENDING, CaseStatus.MORE_INFO_REQUESTED];

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{value}</dd>
    </div>
  );
}

export default async function CaseDetailPage({ params }: { params: Promise<{ caseId: string }> }) {
  const actor = await requireActor();
  const { caseId } = await params;

  let detail;
  try {
    detail = await getCaseDetail(caseId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <AppShell actor={actor}>
      <Link href="/" className="text-sm text-slate-600 hover:text-slate-900">
        ← Back to queue
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{detail.caseId}</h1>
        <StatusBadge status={detail.status} />
        <RiskBadge level={detail.riskLevel} />
        <AgingBadge level={agingLevel(detail)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">Customer information</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Name" value={detail.customerName} />
            <Field label="Email" value={detail.customerEmail} />
            <Field label="Country" value={detail.customerCountry} />
            <Field label="Date of birth" value={detail.dateOfBirth.toISOString().slice(0, 10)} />
            <Field label="Gov ID" value={`•••• ${detail.govIdLast4}`} />
            <Field label="Account type" value={detail.accountType} />
            <Field label="KYC status" value={statusLabel(detail.status)} />
            <Field label="Risk level" value={detail.riskLevel} />
            <Field label="Submitted" value={formatDate(detail.submittedAt)} />
          </dl>

          <h2 className="mt-8 text-sm font-semibold text-slate-900">Risk flags</h2>
          {detail.riskFlags.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No risk flags raised by screening.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {detail.riskFlags.map((flag) => (
                <li
                  key={flag.id}
                  className="flex items-start justify-between gap-4 rounded-md border border-slate-200 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{flag.code}</p>
                    <p className="text-sm text-slate-600">{flag.description}</p>
                  </div>
                  <RiskBadge level={flag.severity} />
                </li>
              ))}
            </ul>
          )}

          <h2 className="mt-8 text-sm font-semibold text-slate-900">Previous decisions</h2>
          {detail.decisions.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No decisions recorded yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {detail.decisions.map((decision) => (
                <li key={decision.id} className="rounded-md border border-slate-200 px-3 py-2">
                  <p className="text-sm">
                    <span className="font-medium">{decision.actor.name}</span> moved{" "}
                    {statusLabel(decision.fromStatus)} → {statusLabel(decision.toStatus)}
                  </p>
                  <p className="text-xs text-slate-500">{formatDate(decision.createdAt)}</p>
                  {decision.reason ? (
                    <p className="mt-1 text-sm text-slate-700">{decision.reason}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Decision</h2>
            <div className="mt-4">
              <DecisionPanel
                caseId={detail.caseId}
                canDecide={actor.role === "ANALYST" || actor.role === "ADMIN"}
                decidable={DECIDABLE.includes(detail.status)}
              />
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Audit history</h2>
              <Link href={`/audit?caseId=${detail.caseId}`} className="text-xs text-slate-600 hover:text-slate-900">
                View all
              </Link>
            </div>
            <ul className="mt-3 space-y-3">
              {detail.auditEvents.map((event) => (
                <li key={event.id} className="border-l-2 border-slate-200 pl-3">
                  <p className="text-sm font-medium">{event.action.replaceAll("_", " ").toLowerCase()}</p>
                  <p className="text-xs text-slate-500">
                    {event.actorName} ({event.actorEmail}) · {formatDate(event.createdAt)}
                  </p>
                  {event.fromStatus && event.toStatus ? (
                    <p className="text-xs text-slate-600">
                      {statusLabel(event.fromStatus)} → {statusLabel(event.toStatus)}
                    </p>
                  ) : null}
                  {event.reason ? <p className="mt-1 text-sm text-slate-700">{event.reason}</p> : null}
                </li>
              ))}
              {detail.auditEvents.length === 0 ? (
                <li className="text-sm text-slate-600">No audit events yet.</li>
              ) : null}
            </ul>
            <p className="mt-4 text-xs text-slate-500">
              Audit records are append-only and cannot be edited or deleted.
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
