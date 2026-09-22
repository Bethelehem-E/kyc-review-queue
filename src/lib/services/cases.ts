import { AuditAction, CaseStatus, Prisma, type Case, type RiskLevel } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decisionInputSchema, type DecisionAction, type QueueFilter } from "@/lib/validation";

export class AuthError extends Error {
  status = 401;
}
export class ForbiddenError extends Error {
  status = 403;
}
export class NotFoundError extends Error {
  status = 404;
}
export class ValidationError extends Error {
  status = 400;
}
export class ConflictError extends Error {
  status = 409;
}

export type Actor = { id: string; name: string; email: string; role: "ANALYST" | "ADMIN" };

/**
 * Layer 2 of 3: the authoritative authorization boundary. Every read and write
 * below re-derives the actor from the server-side session. Middleware and the
 * UI can both be bypassed; this cannot.
 */
export async function requireActor(): Promise<Actor> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) throw new AuthError("Authentication required.");
  return {
    id: user.id,
    name: user.name ?? user.email,
    email: user.email,
    role: user.role ?? "ANALYST",
  };
}

export function assertCanDecide(actor: Actor) {
  if (actor.role !== "ANALYST" && actor.role !== "ADMIN") {
    throw new ForbiddenError("Your role cannot action KYC cases.");
  }
}

const ACTION_TO_STATUS: Record<DecisionAction, CaseStatus> = {
  APPROVE: CaseStatus.APPROVED,
  REJECT: CaseStatus.REJECTED,
  REQUEST_MORE_INFO: CaseStatus.MORE_INFO_REQUESTED,
};

const ACTION_TO_AUDIT: Record<DecisionAction, AuditAction> = {
  APPROVE: AuditAction.CASE_APPROVED,
  REJECT: AuditAction.CASE_REJECTED,
  REQUEST_MORE_INFO: AuditAction.CASE_MORE_INFO_REQUESTED,
};

/** A case can only be actioned while it is awaiting an analyst. */
const ACTIONABLE_STATUSES: CaseStatus[] = [CaseStatus.PENDING, CaseStatus.MORE_INFO_REQUESTED];

export const AGING_WARNING_DAYS = 3;
export const AGING_CRITICAL_DAYS = 7;

export function agingLevel(c: Pick<Case, "status" | "submittedAt">, now = new Date()) {
  if (!ACTIONABLE_STATUSES.includes(c.status)) return "none" as const;
  const days = (now.getTime() - c.submittedAt.getTime()) / 86_400_000;
  if (days >= AGING_CRITICAL_DAYS) return "critical" as const;
  if (days >= AGING_WARNING_DAYS) return "warning" as const;
  return "none" as const;
}

const RISK_ORDER: Record<RiskLevel, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export async function listCases(filter: QueueFilter) {
  await requireActor();

  const where: Prisma.CaseWhereInput = {};
  if (filter.status !== "ALL") where.status = filter.status;
  if (filter.risk !== "ALL") where.riskLevel = filter.risk;
  if (filter.search.trim()) {
    const search = filter.search.trim();
    where.OR = [
      { caseId: { contains: search, mode: "insensitive" } },
      { customerName: { contains: search, mode: "insensitive" } },
    ];
  }

  const orderBy: Prisma.CaseOrderByWithRelationInput[] =
    filter.sort === "NEWEST"
      ? [{ submittedAt: "desc" }]
      : filter.sort === "STATUS"
        ? [{ status: "asc" }, { submittedAt: "asc" }]
        : [{ submittedAt: "asc" }];

  const cases = await prisma.case.findMany({
    where,
    orderBy,
    take: 200,
    select: {
      id: true,
      caseId: true,
      customerName: true,
      riskLevel: true,
      status: true,
      submittedAt: true,
    },
  });

  if (filter.sort === "RISK") {
    cases.sort(
      (a, b) =>
        RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel] ||
        a.submittedAt.getTime() - b.submittedAt.getTime()
    );
  }

  return cases;
}

export async function getCaseDetail(caseId: string) {
  await requireActor();

  const found = await prisma.case.findUnique({
    where: { caseId },
    include: {
      riskFlags: { orderBy: { severity: "asc" } },
      decisions: {
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { name: true, email: true } } },
      },
      auditEvents: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });
  if (!found) throw new NotFoundError("Case not found.");
  return found;
}

export type DecisionResult = {
  caseId: string;
  fromStatus: CaseStatus;
  toStatus: CaseStatus;
};

export async function decideCase(
  caseId: string,
  input: unknown,
  actorOverride?: Actor
): Promise<DecisionResult> {
  const actor = actorOverride ?? (await requireActor());
  assertCanDecide(actor);

  const parsed = decisionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid decision input.");
  }
  const { action, reason } = parsed.data;
  const toStatus = ACTION_TO_STATUS[action];

  return prisma.$transaction(async (tx) => {
    const existing = await tx.case.findUnique({ where: { caseId } });
    if (!existing) throw new NotFoundError("Case not found.");
    if (!ACTIONABLE_STATUSES.includes(existing.status)) {
      throw new ConflictError(
        `Case ${caseId} is already ${existing.status} and can no longer be actioned.`
      );
    }

    await tx.case.update({ where: { id: existing.id }, data: { status: toStatus } });

    await tx.decision.create({
      data: {
        caseId: existing.id,
        actorId: actor.id,
        fromStatus: existing.status,
        toStatus,
        reason,
      },
    });

    // Audit rows carry who/what/when only. No customer PII, by construction.
    await tx.auditEvent.create({
      data: {
        caseId: existing.id,
        actorId: actor.id,
        actorEmail: actor.email,
        actorName: actor.name,
        action: ACTION_TO_AUDIT[action],
        fromStatus: existing.status,
        toStatus,
        reason,
      },
    });

    return { caseId, fromStatus: existing.status, toStatus };
  });
}

export async function listAuditEvents(options: { caseId?: string; actorEmail?: string } = {}) {
  await requireActor();

  const where: Prisma.AuditEventWhereInput = {};
  if (options.caseId) where.case = { caseId: options.caseId };
  if (options.actorEmail) where.actorEmail = options.actorEmail;

  return prisma.auditEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 250,
    include: { case: { select: { caseId: true } } },
  });
}
