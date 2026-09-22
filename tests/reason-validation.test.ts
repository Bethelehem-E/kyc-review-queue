import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaseStatus } from "@prisma/client";

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: authMock }));

const { prisma } = await import("@/lib/db");
const { ValidationError, decideCase } = await import("@/lib/services/cases");
const { REASON_MAX_LENGTH, decisionInputSchema, parseQueueFilter } = await import(
  "@/lib/validation"
);
const { createTestCase, createTestUser } = await import("./helpers");

const INVALID_REASONS: [string, string][] = [
  ["script tag", "<script>alert('xss')</script> rejected for fraud"],
  ["html injection", "Rejected <img src=x onerror=alert(1)> per policy"],
  ["null byte", "Rejected for fraud\u0000 concerns"],
  ["control characters", "Rejected for fraud\u0007\u001b[31m concerns"],
  ["embedded newline", "Rejected for fraud\nconcerns about the applicant"],
  ["embedded tab", "Rejected for fraud\tconcerns about the applicant"],
  ["carriage return", "Rejected for fraud\rconcerns about the applicant"],
  ["vertical tab", "Rejected for fraud\u000bconcerns about the applicant"],
  ["template injection", "Rejected ${process.env.DATABASE_URL} concerns"],
  ["backslash escape", "Rejected \\x41\\x42 concerns"],
  ["only whitespace", "            "],
  ["too short", "nope"],
  ["too long", "a".repeat(REASON_MAX_LENGTH + 1)],
];

describe("case reason validation", () => {
  beforeEach(() => authMock.mockReset());

  it.each(INVALID_REASONS)("rejects %s in a reject reason", async (_label, reason) => {
    const parsed = decisionInputSchema.safeParse({ action: "REJECT", reason });
    expect(parsed.success).toBe(false);
  });

  it("does not mutate the case when the reason is invalid", async () => {
    const actor = await createTestUser();
    authMock.mockResolvedValue({ user: { ...actor } });
    const testCase = await createTestCase();

    await expect(
      decideCase(testCase.caseId, { action: "REJECT", reason: "<script>alert(1)</script>" })
    ).rejects.toBeInstanceOf(ValidationError);

    const after = await prisma.case.findUniqueOrThrow({
      where: { id: testCase.id },
      include: { decisions: true, auditEvents: true },
    });
    expect(after.status).toBe(CaseStatus.PENDING);
    expect(after.decisions).toHaveLength(0);
    expect(after.auditEvents).toHaveLength(0);
  });

  it("stores SQL-shaped prose verbatim instead of executing it", async () => {
    const actor = await createTestUser();
    authMock.mockResolvedValue({ user: { ...actor } });
    const testCase = await createTestCase();
    const reason = "Rejected'; DROP TABLE cases; -- customer withdrew application";

    await decideCase(testCase.caseId, { action: "REJECT", reason });

    const event = await prisma.auditEvent.findFirstOrThrow({ where: { caseId: testCase.id } });
    expect(event.reason).toBe(reason);
    expect(await prisma.case.count({ where: { id: testCase.id } })).toBe(1);
  });

  it("falls back to defaults for unknown queue filter values", () => {
    expect(parseQueueFilter({ status: "BOGUS", risk: "NOPE", sort: "NOPE" })).toEqual({
      status: "ALL",
      risk: "ALL",
      search: "",
      sort: "OLDEST",
    });
  });

  it("keeps the valid parts of a partially invalid queue filter", () => {
    expect(parseQueueFilter({ status: "PENDING", risk: "NOPE", search: "KYC-1001" })).toMatchObject({
      status: "PENDING",
      risk: "ALL",
      search: "KYC-1001",
    });
  });

  it("accepts ordinary analyst prose, including accents and punctuation", () => {
    const parsed = decisionInputSchema.safeParse({
      action: "REJECT",
      reason: "Déclined: address mismatch (doc vs. application), see ticket OPS-1042 @ 40% match.",
    });
    expect(parsed.success).toBe(true);
  });

  it("trims and stores the reason verbatim once validated", async () => {
    const actor = await createTestUser();
    authMock.mockResolvedValue({ user: { ...actor } });
    const testCase = await createTestCase();

    await decideCase(testCase.caseId, {
      action: "REQUEST_MORE_INFO",
      reason: "   Please resubmit proof of address.   ",
    });

    const event = await prisma.auditEvent.findFirstOrThrow({ where: { caseId: testCase.id } });
    expect(event.reason).toBe("Please resubmit proof of address.");
  });
});
