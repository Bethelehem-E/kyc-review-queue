import { AuditAction, CaseStatus, Prisma, type Case, type RiskLevel } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  decisionInputSchema,
  optionalReasonSchema,
  reasonSchema,
  type DecisionAction,
  type QueueFilter,
} from "@/lib/validation";

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

export type ActorRole = "ANALYST" | "REVIEWER" | "ADMIN";
export type Actor = { id: string; name: string; email: string; role: ActorRole };

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

export const DECIDER_ROLES: ActorRole[] = ["ANALYST", "REVIEWER", "ADMIN"];
export const CHECKER_ROLES: ActorRole[] = ["REVIEWER", "ADMIN"];

export function assertCanDecide(actor: Actor) {
  if (!DECIDER_ROLES.includes(actor.role)) {
    throw new ForbiddenError("Your role cannot action KYC cases.");
  }
}

/** Only a checker may countersign, and never their own proposal. */
export function assertCanCountersign(actor: Actor, proposedById: string | null) {
  if (!CHECKER_ROLES.includes(actor.role)) {
    throw new ForbiddenError("Your role cannot countersign a proposed decision.");
  }
  if (proposedById && proposedById === actor.id) {
    throw new ForbiddenError("A proposed decision must be countersigned by a different reviewer.");
  }
}

/** A claimed case may only be actioned by its assignee; admins can override. */
function assertHoldsAssignment(actor: Actor, assignedToId: string | null) {
  if (assignedToId && assignedToId !== actor.id && actor.role !== "ADMIN") {
    throw new ForbiddenError("This case is assigned to another analyst.");
  }
}

/**
 * Maker-checker applies to final decisions on high-risk cases: one analyst
 * proposes, a second (REVIEWER or ADMIN) countersigns. Requesting more
 * information is not final, so it needs no second pair of eyes.
 */
export function requiresSecondApproval(riskLevel: RiskLevel, action: DecisionAction) {
  return riskLevel === "HIGH" && action !== "REQUEST_MORE_INFO";
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

/** Work still owed to the customer, for aging and SLA purposes. */
const OPEN_STATUSES: CaseStatus[] = [...ACTIONABLE_STATUSES, CaseStatus.AWAITING_SECOND_APPROVAL];

export const AGING_WARNING_DAYS = 3;
export const AGING_CRITICAL_DAYS = 7;

export function agingLevel(c: Pick<Case, "status" | "submittedAt">, now = new Date()) {
  if (!OPEN_STATUSES.includes(c.status)) return "none" as const;
  const days = (now.getTime() - c.submittedAt.getTime()) / 86_400_000;
  if (days >= AGING_CRITICAL_DAYS) return "critical" as const;
  if (days >= AGING_WARNING_DAYS) return "warning" as const;
  return "none" as const;
}

const RISK_ORDER: Record<RiskLevel, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export async function listCases(filter: QueueFilter) {
  const actor = await requireActor();

  const where: Prisma.CaseWhereInput = {};
  if (filter.status !== "ALL") where.status = filter.status;
  if (filter.risk !== "ALL") where.riskLevel = filter.risk;
  if (filter.assignment === "MINE") where.assignedToId = actor.id;
  if (filter.assignment === "UNCLAIMED") where.assignedToId = null;
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
      assignedTo: { select: { id: true, name: true } },
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
      assignedTo: { select: { id: true, name: true, email: true } },
      proposedBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!found) throw new NotFoundError("Case not found.");
  return found;
}

export type DecisionResult = {
  caseId: string;
  fromStatus: CaseStatus;
  toStatus: CaseStatus;
  /** The final status a maker proposed, while it awaits a second approver. */
  proposedStatus: CaseStatus | null;
};

const CLEAR_PROPOSAL = {
  proposedStatus: null,
  proposedById: null,
  proposedReason: null,
  proposedAt: null,
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

  return prisma.$transaction(async (tx) => {
    const existing = await tx.case.findUnique({ where: { caseId } });
    if (!existing) throw new NotFoundError("Case not found.");
    if (!ACTIONABLE_STATUSES.includes(existing.status)) {
      throw new ConflictError(
        `Case ${caseId} is already ${existing.status} and can no longer be actioned.`
      );
    }
    assertHoldsAssignment(actor, existing.assignedToId);

    const target = ACTION_TO_STATUS[action];
    const secondApproval = requiresSecondApproval(existing.riskLevel, action);
    const toStatus = secondApproval ? CaseStatus.AWAITING_SECOND_APPROVAL : target;

    await tx.case.update({
      where: { id: existing.id },
      data: secondApproval
        ? {
            status: toStatus,
            proposedStatus: target,
            proposedById: actor.id,
            proposedReason: reason,
            proposedAt: new Date(),
          }
        : { status: toStatus, ...CLEAR_PROPOSAL },
    });

    // A proposal is not a decision yet, so no Decision row until it is countersigned.
    if (!secondApproval) {
      await tx.decision.create({
        data: {
          caseId: existing.id,
          actorId: actor.id,
          fromStatus: existing.status,
          toStatus,
          reason,
        },
      });
    }

    // Audit rows carry who/what/when only. No customer PII, by construction.
    await tx.auditEvent.create({
      data: {
        caseId: existing.id,
        actorId: actor.id,
        actorEmail: actor.email,
        actorName: actor.name,
        action: secondApproval ? AuditAction.CASE_DECISION_PROPOSED : ACTION_TO_AUDIT[action],
        fromStatus: existing.status,
        toStatus,
        reason,
      },
    });

    return {
      caseId,
      fromStatus: existing.status,
      toStatus,
      proposedStatus: secondApproval ? target : null,
    };
  });
}

/** Second half of maker-checker: a different checker confirms or returns it. */
export async function resolveProposedDecision(
  caseId: string,
  outcome: "CONFIRM" | "RETURN",
  rawReason: unknown,
  actorOverride?: Actor
): Promise<DecisionResult> {
  const actor = actorOverride ?? (await requireActor());
  const rawText = typeof rawReason === "string" ? rawReason : "";
  const parsed =
    outcome === "RETURN" ? reasonSchema.safeParse(rawText) : optionalReasonSchema.safeParse(rawText);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid reason.");
  }
  const reason = parsed.data?.trim() ? parsed.data.trim() : null;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.case.findUnique({ where: { caseId } });
    if (!existing) throw new NotFoundError("Case not found.");
    if (existing.status !== CaseStatus.AWAITING_SECOND_APPROVAL || !existing.proposedStatus) {
      throw new ConflictError(`Case ${caseId} has no decision awaiting a second approval.`);
    }
    assertCanCountersign(actor, existing.proposedById);

    const toStatus = outcome === "CONFIRM" ? existing.proposedStatus : CaseStatus.PENDING;
    const recordedReason = reason ?? existing.proposedReason;

    await tx.case.update({
      where: { id: existing.id },
      data: { status: toStatus, ...CLEAR_PROPOSAL },
    });

    if (outcome === "CONFIRM") {
      await tx.decision.create({
        data: {
          caseId: existing.id,
          actorId: actor.id,
          fromStatus: existing.status,
          toStatus,
          reason: recordedReason,
        },
      });
    }

    await tx.auditEvent.create({
      data: {
        caseId: existing.id,
        actorId: actor.id,
        actorEmail: actor.email,
        actorName: actor.name,
        action:
          outcome === "RETURN"
            ? AuditAction.CASE_DECISION_RETURNED
            : toStatus === CaseStatus.APPROVED
              ? AuditAction.CASE_APPROVED
              : AuditAction.CASE_REJECTED,
        fromStatus: existing.status,
        toStatus,
        reason: recordedReason,
      },
    });

    return { caseId, fromStatus: existing.status, toStatus, proposedStatus: null };
  });
}

/** Claim an unassigned case, or release one you hold. */
export async function setCaseAssignment(
  caseId: string,
  intent: "CLAIM" | "RELEASE",
  actorOverride?: Actor
) {
  const actor = actorOverride ?? (await requireActor());
  assertCanDecide(actor);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.case.findUnique({ where: { caseId } });
    if (!existing) throw new NotFoundError("Case not found.");
    if (!ACTIONABLE_STATUSES.includes(existing.status)) {
      throw new ConflictError(`Case ${caseId} is no longer open for assignment.`);
    }

    const claiming = intent === "CLAIM";
    if (claiming) {
      if (existing.assignedToId && existing.assignedToId !== actor.id) {
        throw new ConflictError("This case is already claimed by another analyst.");
      }
    } else {
      assertHoldsAssignment(actor, existing.assignedToId);
    }

    await tx.case.update({
      where: { id: existing.id },
      data: {
        assignedToId: claiming ? actor.id : null,
        assignedAt: claiming ? new Date() : null,
      },
    });

    await tx.auditEvent.create({
      data: {
        caseId: existing.id,
        actorId: actor.id,
        actorEmail: actor.email,
        actorName: actor.name,
        action: claiming ? AuditAction.CASE_CLAIMED : AuditAction.CASE_RELEASED,
        fromStatus: existing.status,
        toStatus: existing.status,
      },
    });

    return { caseId, assignedToId: claiming ? actor.id : null };
  });
}

/** Analysts that appear in the audit trail, for the audit filter UI. */
export async function listAuditActors() {
  await requireActor();

  const rows = await prisma.auditEvent.findMany({
    distinct: ["actorEmail"],
    orderBy: { actorName: "asc" },
    select: { actorEmail: true, actorName: true },
  });

  return rows.map((row) => ({ email: row.actorEmail, name: row.actorName }));
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
