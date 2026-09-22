import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaseStatus } from "@prisma/client";
import { NextRequest } from "next/server";

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: authMock }));

const { prisma } = await import("@/lib/db");
const { AuthError, ForbiddenError, assertCanDecide, decideCase, getCaseDetail, listAuditEvents, listCases } =
  await import("@/lib/services/cases");
const { POST: decisionRoute } = await import("@/app/api/cases/[caseId]/decision/route");
const { GET: casesRoute } = await import("@/app/api/cases/route");
const { GET: auditRoute } = await import("@/app/api/audit/route");
const { createTestCase, createTestUser } = await import("./helpers");

const defaultFilter = {
  status: "ALL",
  risk: "ALL",
  assignment: "ALL",
  search: "",
  sort: "OLDEST",
} as const;

describe("authorization boundaries", () => {
  beforeEach(() => authMock.mockReset());

  it("rejects unauthenticated reads and writes at the service layer", async () => {
    authMock.mockResolvedValue(null);
    const testCase = await createTestCase();

    await expect(listCases({ ...defaultFilter })).rejects.toBeInstanceOf(AuthError);
    await expect(getCaseDetail(testCase.caseId)).rejects.toBeInstanceOf(AuthError);
    await expect(listAuditEvents()).rejects.toBeInstanceOf(AuthError);
    await expect(
      decideCase(testCase.caseId, { action: "APPROVE", reason: "Should never be applied." })
    ).rejects.toBeInstanceOf(AuthError);

    expect((await prisma.case.findUniqueOrThrow({ where: { id: testCase.id } })).status).toBe(
      CaseStatus.PENDING
    );
  });

  it("returns 401 from the API routes when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const testCase = await createTestCase();

    const decision = await decisionRoute(
      new Request(`http://localhost/api/cases/${testCase.caseId}/decision`, {
        method: "POST",
        body: JSON.stringify({ action: "APPROVE", reason: "Attempting without a session." }),
        headers: { "content-type": "application/json" },
      }) as never,
      { params: Promise.resolve({ caseId: testCase.caseId }) }
    );
    expect(decision.status).toBe(401);

    expect((await casesRoute(new NextRequest("http://localhost/api/cases"))).status).toBe(401);
    expect((await auditRoute(new NextRequest("http://localhost/api/audit"))).status).toBe(401);
  });

  it("rejects a session that carries an invalid or incomplete user", async () => {
    authMock.mockResolvedValue({ user: { email: "ghost@kycdemo.test" } }); // no id
    await expect(listCases({ ...defaultFilter })).rejects.toBeInstanceOf(AuthError);

    authMock.mockResolvedValue({ user: { id: "abc" } }); // no email
    await expect(listCases({ ...defaultFilter })).rejects.toBeInstanceOf(AuthError);
  });

  it("rejects an authenticated user whose role cannot action cases", async () => {
    const actor = await createTestUser();
    expect(() => assertCanDecide({ ...actor, role: "VIEWER" as never })).toThrow(ForbiddenError);
  });

  it("allows an authenticated analyst through every layer", async () => {
    const actor = await createTestUser();
    authMock.mockResolvedValue({ user: { ...actor } });
    const testCase = await createTestCase();

    const response = await decisionRoute(
      new Request(`http://localhost/api/cases/${testCase.caseId}/decision`, {
        method: "POST",
        body: JSON.stringify({ action: "APPROVE", reason: "Verified by the analyst on shift." }),
        headers: { "content-type": "application/json" },
      }) as never,
      { params: Promise.resolve({ caseId: testCase.caseId }) }
    );

    expect(response.status).toBe(200);
    expect((await getCaseDetail(testCase.caseId)).status).toBe(CaseStatus.APPROVED);
  });
});
