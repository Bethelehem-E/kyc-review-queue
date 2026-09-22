import { CaseStatus, RiskLevel, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Actor } from "@/lib/services/cases";

let counter = 0;

export async function createTestUser(role: Role = Role.ANALYST): Promise<Actor> {
  counter += 1;
  const email = `test-${Date.now()}-${counter}@kycdemo.test`;
  const user = await prisma.user.create({
    data: { email, name: `Test User ${counter}`, role, passwordHash: "not-a-real-hash" },
  });
  return { id: user.id, name: user.name, email: user.email, role };
}

export async function createTestCase(overrides: Partial<{ status: CaseStatus }> = {}) {
  counter += 1;
  return prisma.case.create({
    data: {
      caseId: `TEST-${Date.now()}-${counter}`,
      customerName: "Test Customer",
      customerEmail: "test.customer@example.com",
      customerCountry: "US",
      dateOfBirth: new Date("1990-04-01"),
      govIdLast4: "4321",
      accountType: "Individual Checking",
      riskLevel: RiskLevel.MEDIUM,
      status: overrides.status ?? CaseStatus.PENDING,
      submittedAt: new Date(),
    },
  });
}
