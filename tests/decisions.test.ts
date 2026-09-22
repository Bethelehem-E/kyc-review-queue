import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditAction, CaseStatus } from "@prisma/client";

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: authMock }));

const { prisma } = await import("@/lib/db");
const { ConflictError, ValidationError, decideCase, getCaseDetail } = await import(
  "@/lib/services/cases"
);
const { createTestCase, createTestUser } = await import("./helpers");

describe("case decisions", () => {
  beforeEach(() => authMock.mockReset());

  async function signIn() {
    const actor = await createTestUser();
    authMock.mockResolvedValue({ user: { ...actor } });
    return actor;
  }

  it("approves a pending case and writes an audit event", async () => {
    const actor = await signIn();
    const testCase = await createTestCase();

    const result = await decideCase(testCase.caseId, {
      action: "APPROVE",
      reason: "Documents verified against the issuing registry.",
    });

    expect(result).toMatchObject({
      fromStatus: CaseStatus.PENDING,
      toStatus: CaseStatus.APPROVED,
    });

    const detail = await getCaseDetail(testCase.caseId);
    expect(detail.status).toBe(CaseStatus.APPROVED);
    expect(detail.decisions).toHaveLength(1);
    expect(detail.auditEvents[0]).toMatchObject({
      action: AuditAction.CASE_APPROVED,
      actorEmail: actor.email,
      fromStatus: CaseStatus.PENDING,
      toStatus: CaseStatus.APPROVED,
    });
  });

  it("rejects a case when a reason is supplied", async () => {
    await signIn();
    const testCase = await createTestCase();

    await decideCase(testCase.caseId, {
      action: "REJECT",
      reason: "Confirmed sanctions list match under policy 4.2.",
    });

    const detail = await getCaseDetail(testCase.caseId);
    expect(detail.status).toBe(CaseStatus.REJECTED);
    expect(detail.auditEvents[0].action).toBe(AuditAction.CASE_REJECTED);
  });

  it("requests more information and keeps the case actionable", async () => {
    await signIn();
    const testCase = await createTestCase();

    await decideCase(testCase.caseId, {
      action: "REQUEST_MORE_INFO",
      reason: "Proof of address is illegible, please resubmit.",
    });

    const detail = await getCaseDetail(testCase.caseId);
    expect(detail.status).toBe(CaseStatus.MORE_INFO_REQUESTED);

    await decideCase(testCase.caseId, {
      action: "APPROVE",
      reason: "Replacement utility bill received and verified.",
    });
    expect((await getCaseDetail(testCase.caseId)).status).toBe(CaseStatus.APPROVED);
  });

  it("requires a reason for reject and request-more-info", async () => {
    await signIn();
    const testCase = await createTestCase();

    await expect(decideCase(testCase.caseId, { action: "REJECT", reason: "" })).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(
      decideCase(testCase.caseId, { action: "REQUEST_MORE_INFO", reason: "too short" })
    ).rejects.toBeInstanceOf(ValidationError);

    expect((await getCaseDetail(testCase.caseId)).status).toBe(CaseStatus.PENDING);
  });

  it("refuses to re-decide a case that already reached a final status", async () => {
    await signIn();
    const testCase = await createTestCase({ status: CaseStatus.APPROVED });

    await expect(
      decideCase(testCase.caseId, { action: "REJECT", reason: "Changed my mind about this case." })
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await prisma.decision.count({ where: { caseId: testCase.id } })).toBe(0);
  });
});
