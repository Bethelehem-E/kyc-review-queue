import { PrismaClient, CaseStatus, RiskLevel, Role, AuditAction } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "AnalystPass123!";

const FIRST_NAMES = [
  "Amara", "Daniel", "Priya", "Luis", "Mei", "Jonas", "Fatima", "Oliver", "Nadia", "Tomas",
  "Grace", "Hiroshi", "Elena", "Samuel", "Yara", "Peter", "Ingrid", "Kwame", "Sofia", "Victor",
];
const LAST_NAMES = [
  "Okafor", "Reyes", "Nakamura", "Bergstrom", "Haddad", "Whitfield", "Costa", "Ivanov", "Dubois",
  "Mbeki", "Larsen", "Fitzgerald", "Novak", "Silva", "Ahmed", "Kowalski", "Tanaka", "Moreau",
];
const COUNTRIES = ["US", "GB", "DE", "SG", "BR", "NG", "CA", "AE", "JP", "MX"];
const ACCOUNT_TYPES = ["Individual Checking", "Business Operating", "Treasury", "Card Program"];

const FLAG_LIBRARY: { code: string; description: string; severity: RiskLevel }[] = [
  { code: "PEP_MATCH", description: "Potential politically exposed person match", severity: RiskLevel.HIGH },
  { code: "SANCTIONS_NEAR_HIT", description: "Fuzzy match against sanctions watchlist", severity: RiskLevel.HIGH },
  { code: "ADDRESS_MISMATCH", description: "Declared address differs from document address", severity: RiskLevel.MEDIUM },
  { code: "DEVICE_VELOCITY", description: "Multiple applications from one device in 24h", severity: RiskLevel.MEDIUM },
  { code: "DOC_QUALITY", description: "Identity document image below quality threshold", severity: RiskLevel.LOW },
  { code: "HIGH_RISK_JURISDICTION", description: "Registered in a higher-risk jurisdiction", severity: RiskLevel.HIGH },
  { code: "NAME_TRANSLITERATION", description: "Name transliteration variance across documents", severity: RiskLevel.LOW },
];

/** Deterministic pseudo-random so seeded data is stable across runs. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const rand = mulberry32(20260922);
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  await prisma.$executeRawUnsafe("ALTER TABLE audit_events DISABLE TRIGGER USER");
  await prisma.$executeRawUnsafe(
    "TRUNCATE TABLE audit_events, decisions, risk_flags, cases, users RESTART IDENTITY CASCADE"
  );
  await prisma.$executeRawUnsafe("ALTER TABLE audit_events ENABLE TRIGGER USER");

  const analysts = await Promise.all(
    [
      { email: "analyst@kycdemo.test", name: "Ava Analyst", role: Role.ANALYST },
      { email: "rmartin@kycdemo.test", name: "Rosa Martin", role: Role.ANALYST },
      { email: "admin@kycdemo.test", name: "Adam Admin", role: Role.ADMIN },
    ].map((u) => prisma.user.create({ data: { ...u, passwordHash } }))
  );

  const now = Date.now();
  const total = 60;

  for (let i = 0; i < total; i += 1) {
    const first = FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)];
    const last = LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)];
    const riskRoll = rand();
    const riskLevel =
      riskRoll > 0.75 ? RiskLevel.HIGH : riskRoll > 0.4 ? RiskLevel.MEDIUM : RiskLevel.LOW;

    // Skew ~a third of cases older so the aging alerts are visible in the UI.
    const ageDays = i % 3 === 0 ? 3 + rand() * 12 : rand() * 3;
    const submittedAt = new Date(now - ageDays * 86_400_000);

    const statusRoll = rand();
    const status =
      statusRoll > 0.82
        ? CaseStatus.APPROVED
        : statusRoll > 0.72
          ? CaseStatus.REJECTED
          : statusRoll > 0.64
            ? CaseStatus.MORE_INFO_REQUESTED
            : CaseStatus.PENDING;

    const flagCount = riskLevel === RiskLevel.HIGH ? 2 + Math.floor(rand() * 2) : Math.floor(rand() * 2);
    const flags = [...FLAG_LIBRARY].sort(() => rand() - 0.5).slice(0, flagCount);

    const created = await prisma.case.create({
      data: {
        caseId: `KYC-${1000 + i}`,
        customerName: `${first} ${last}`,
        customerEmail: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
        customerCountry: COUNTRIES[Math.floor(rand() * COUNTRIES.length)],
        dateOfBirth: new Date(1970 + Math.floor(rand() * 32), Math.floor(rand() * 12), 1 + Math.floor(rand() * 28)),
        govIdLast4: String(1000 + Math.floor(rand() * 8999)),
        accountType: ACCOUNT_TYPES[Math.floor(rand() * ACCOUNT_TYPES.length)],
        riskLevel,
        status,
        submittedAt,
        riskFlags: { create: flags.map((f) => ({ code: f.code, description: f.description, severity: f.severity })) },
      },
    });

    if (status !== CaseStatus.PENDING) {
      const actor = analysts[Math.floor(rand() * analysts.length)];
      const decidedAt = new Date(submittedAt.getTime() + 3_600_000 * (1 + rand() * 20));
      const reason =
        status === CaseStatus.APPROVED
          ? "Identity documents verified and watchlist screening returned no true matches."
          : status === CaseStatus.REJECTED
            ? "Sanctions screening produced a confirmed match; onboarding declined per policy 4.2."
            : "Proof of address is illegible. Requesting a utility bill dated within the last 90 days.";

      await prisma.decision.create({
        data: {
          caseId: created.id,
          actorId: actor.id,
          fromStatus: CaseStatus.PENDING,
          toStatus: status,
          reason,
          createdAt: decidedAt,
        },
      });

      await prisma.auditEvent.create({
        data: {
          caseId: created.id,
          actorId: actor.id,
          actorEmail: actor.email,
          actorName: actor.name,
          action:
            status === CaseStatus.APPROVED
              ? AuditAction.CASE_APPROVED
              : status === CaseStatus.REJECTED
                ? AuditAction.CASE_REJECTED
                : AuditAction.CASE_MORE_INFO_REQUESTED,
          fromStatus: CaseStatus.PENDING,
          toStatus: status,
          reason,
          createdAt: decidedAt,
        },
      });
    }
  }

  const counts = await prisma.case.groupBy({ by: ["status"], _count: true });
  console.log("Seeded users:", analysts.map((a) => a.email).join(", "));
  console.log("Seed password:", SEED_PASSWORD);
  console.log("Cases by status:", counts.map((c) => `${c.status}=${c._count}`).join(" "));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
