import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditAction, CaseStatus, RiskLevel, Role } from "@prisma/client";

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: authMock }));

const { prisma } = await import("@/lib/db");
const {
  ConflictError,
  ForbiddenError,
  ValidationError,
  decideCase,
  getCaseDetail,
  resolveProposedDecision,
  setCaseAssignment,
} = await import("@/lib/services/cases");
const { createTestCase, createTestUser } = await import("./helpers");

async function signIn(role: Role = Role.ANALYST) {
  const actor = await createTestUser(role);
  authMock.mockResolvedValue({ user: { ...actor } });
  return actor;
}

describe("case assignment", () => {
  beforeEach(() => authMock.mockReset());

  it("claims an unassigned case and audits the claim", async () => {
    const actor = await signIn();
    const testCase = await createTestCase();

    await setCaseAssignment(testCase.caseId, "CLAIM");

    const detail = await getCaseDetail(testCase.caseId);
    expect(detail.assignedTo?.id).toBe(actor.id);
    expect(detail.auditEvents[0]).toMatchObject({
      action: AuditAction.CASE_CLAIMED,
      actorEmail: actor.email,
    });
  });

  it("refuses to claim a case another analyst holds", async () => {
    const owner = await createTestUser();
    const testCase = await createTestCase({ assignedToId: owner.id });
    await signIn();

    await expect(setCaseAssignment(testCase.caseId, "CLAIM")).rejects.toBeInstanceOf(ConflictError);
  });

  it("releases a case the actor holds", async () => {
    const actor = await signIn();
    const testCase = await createTestCase({ assignedToId: actor.id });

    await setCaseAssignment(testCase.caseId, "RELEASE");

    const detail = await getCaseDetail(testCase.caseId);
    expect(detail.assignedTo).toBeNull();
    expect(detail.auditEvents[0].action).toBe(AuditAction.CASE_RELEASED);
  });

  it("blocks a non-assignee from deciding an assigned case", async () => {
    const owner = await createTestUser();
    const testCase = await createTestCase({ assignedToId: owner.id });
    await signIn();

    await expect(
      decideCase(testCase.caseId, { action: "APPROVE", reason: "Looks fine to me." })
    ).rejects.toBeInstanceOf(ForbiddenError);

    const detail = await getCaseDetail(testCase.caseId);
    expect(detail.status).toBe(CaseStatus.PENDING);
  });

  it("lets an admin override another analyst's claim", async () => {
    const owner = await createTestUser();
    const testCase = await createTestCase({ assignedToId: owner.id });
    await signIn(Role.ADMIN);

    await decideCase(testCase.caseId, {
      action: "APPROVE",
      reason: "Escalated to the admin queue and cleared.",
    });

    expect((await getCaseDetail(testCase.caseId)).status).toBe(CaseStatus.APPROVED);
  });
});

describe("maker-checker on high-risk cases", () => {
  beforeEach(() => authMock.mockReset());

  async function propose(action: "APPROVE" | "REJECT" = "APPROVE") {
    const maker = await signIn();
    const testCase = await createTestCase({ riskLevel: RiskLevel.HIGH });
    const result = await decideCase(testCase.caseId, {
      action,
      reason: "Enhanced due diligence complete; recommending this outcome.",
    });
    return { maker, testCase, result };
  }

  it("turns a high-risk approval into a proposal with no decision row yet", async () => {
    const { maker, testCase, result } = await propose();

    expect(result).toMatchObject({
      toStatus: CaseStatus.AWAITING_SECOND_APPROVAL,
      proposedStatus: CaseStatus.APPROVED,
    });

    const detail = await getCaseDetail(testCase.caseId);
    expect(detail.status).toBe(CaseStatus.AWAITING_SECOND_APPROVAL);
    expect(detail.proposedBy?.id).toBe(maker.id);
    expect(detail.decisions).toHaveLength(0);
    expect(detail.auditEvents[0].action).toBe(AuditAction.CASE_DECISION_PROPOSED);
  });

  it("finalises the case when a reviewer countersigns", async () => {
    const { testCase } = await propose();
    const checker = await signIn(Role.REVIEWER);

    const result = await resolveProposedDecision(testCase.caseId, "CONFIRM", null);
    expect(result.toStatus).toBe(CaseStatus.APPROVED);

    const detail = await getCaseDetail(testCase.caseId);
    expect(detail.status).toBe(CaseStatus.APPROVED);
    expect(detail.decisions).toHaveLength(1);
    expect(detail.decisions[0].actor.email).toBe(checker.email);
    expect(detail.auditEvents[0]).toMatchObject({
      action: AuditAction.CASE_APPROVED,
      actorEmail: checker.email,
    });
  });

  it("refuses to let the maker countersign their own proposal", async () => {
    const { maker, testCase } = await propose();
    // Same person, now wearing a reviewer hat: still not a second pair of eyes.
    authMock.mockResolvedValue({ user: { ...maker, role: Role.REVIEWER } });
    await prisma.user.update({ where: { id: maker.id }, data: { role: Role.REVIEWER } });

    await expect(
      resolveProposedDecision(testCase.caseId, "CONFIRM", null)
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect((await getCaseDetail(testCase.caseId)).status).toBe(
      CaseStatus.AWAITING_SECOND_APPROVAL
    );
  });

  it("refuses to let a plain analyst countersign", async () => {
    const { testCase } = await propose();
    await signIn(Role.ANALYST);

    await expect(
      resolveProposedDecision(testCase.caseId, "CONFIRM", null)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("returns a proposal to pending with a required reason", async () => {
    const { testCase } = await propose("REJECT");
    const checker = await signIn(Role.REVIEWER);

    await expect(resolveProposedDecision(testCase.caseId, "RETURN", "")).rejects.toBeInstanceOf(
      ValidationError
    );

    await resolveProposedDecision(
      testCase.caseId,
      "RETURN",
      "Adverse media citation is missing; re-document before declining."
    );

    const detail = await getCaseDetail(testCase.caseId);
    expect(detail.status).toBe(CaseStatus.PENDING);
    expect(detail.proposedBy).toBeNull();
    expect(detail.decisions).toHaveLength(0);
    expect(detail.auditEvents[0]).toMatchObject({
      action: AuditAction.CASE_DECISION_RETURNED,
      actorEmail: checker.email,
    });
  });

  it("does not require a second approval for request-more-info", async () => {
    await signIn();
    const testCase = await createTestCase({ riskLevel: RiskLevel.HIGH });

    await decideCase(testCase.caseId, {
      action: "REQUEST_MORE_INFO",
      reason: "Need a utility bill dated within the last 90 days.",
    });

    expect((await getCaseDetail(testCase.caseId)).status).toBe(CaseStatus.MORE_INFO_REQUESTED);
  });

  it("does not require a second approval for medium-risk decisions", async () => {
    await signIn();
    const testCase = await createTestCase({ riskLevel: RiskLevel.MEDIUM });

    await decideCase(testCase.caseId, {
      action: "APPROVE",
      reason: "Standard verification passed with no screening hits.",
    });

    expect((await getCaseDetail(testCase.caseId)).status).toBe(CaseStatus.APPROVED);
  });

  it("rejects a countersign on a case with no pending proposal", async () => {
    await signIn(Role.REVIEWER);
    const testCase = await createTestCase();

    await expect(
      resolveProposedDecision(testCase.caseId, "CONFIRM", null)
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
