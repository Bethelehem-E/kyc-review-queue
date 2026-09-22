import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: authMock }));

const { prisma } = await import("@/lib/db");
const { decideCase } = await import("@/lib/services/cases");
const { createTestCase, createTestUser } = await import("./helpers");

async function seedAuditEvent() {
  const actor = await createTestUser();
  authMock.mockResolvedValue({ user: { ...actor } });
  const testCase = await createTestCase();
  await decideCase(testCase.caseId, {
    action: "REJECT",
    reason: "Watchlist match confirmed during enhanced due diligence.",
  });
  const event = await prisma.auditEvent.findFirstOrThrow({ where: { caseId: testCase.id } });
  return { actor, testCase, event };
}

describe("audit log immutability and PII hygiene", () => {
  beforeEach(() => authMock.mockReset());

  it("blocks UPDATE on audit_events at the database level", async () => {
    const { event } = await seedAuditEvent();
    await expect(
      prisma.$executeRawUnsafe("UPDATE audit_events SET reason = 'tampered' WHERE id = $1", event.id)
    ).rejects.toThrow(/append-only/i);

    const unchanged = await prisma.auditEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(unchanged.reason).toBe(event.reason);
  });

  it("blocks DELETE on audit_events at the database level", async () => {
    const { event } = await seedAuditEvent();
    await expect(
      prisma.$executeRawUnsafe("DELETE FROM audit_events WHERE id = $1", event.id)
    ).rejects.toThrow(/append-only/i);

    expect(await prisma.auditEvent.findUnique({ where: { id: event.id } })).not.toBeNull();
  });

  it("blocks TRUNCATE on audit_events", async () => {
    await seedAuditEvent();
    await expect(prisma.$executeRawUnsafe("TRUNCATE TABLE audit_events")).rejects.toThrow(
      /append-only/i
    );
  });

  it("never copies customer PII into an audit event", async () => {
    const { testCase, event } = await seedAuditEvent();
    const serialised = JSON.stringify(event);

    for (const secret of [
      testCase.customerName,
      testCase.customerEmail,
      testCase.govIdLast4,
      testCase.dateOfBirth.toISOString(),
    ]) {
      expect(serialised).not.toContain(secret);
    }
    expect(Object.keys(event).sort()).toEqual(
      [
        "action",
        "actorEmail",
        "actorId",
        "actorName",
        "caseId",
        "createdAt",
        "fromStatus",
        "id",
        "reason",
        "toStatus",
      ].sort()
    );
  });
});
