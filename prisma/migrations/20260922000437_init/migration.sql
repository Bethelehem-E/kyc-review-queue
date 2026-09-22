-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('ANALYST', 'ADMIN');

-- CreateEnum
CREATE TYPE "public"."RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "public"."CaseStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'MORE_INFO_REQUESTED');

-- CreateEnum
CREATE TYPE "public"."AuditAction" AS ENUM ('CASE_VIEWED', 'CASE_APPROVED', 'CASE_REJECTED', 'CASE_MORE_INFO_REQUESTED', 'LOGIN_SUCCEEDED', 'LOGIN_FAILED');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL DEFAULT 'ANALYST',
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cases" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerCountry" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "govIdLast4" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "riskLevel" "public"."RiskLevel" NOT NULL,
    "status" "public"."CaseStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."risk_flags" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "public"."RiskLevel" NOT NULL,

    CONSTRAINT "risk_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."decisions" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "fromStatus" "public"."CaseStatus" NOT NULL,
    "toStatus" "public"."CaseStatus" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_events" (
    "id" TEXT NOT NULL,
    "caseId" TEXT,
    "actorId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "action" "public"."AuditAction" NOT NULL,
    "fromStatus" "public"."CaseStatus",
    "toStatus" "public"."CaseStatus",
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "cases_caseId_key" ON "public"."cases"("caseId");

-- CreateIndex
CREATE INDEX "cases_status_submittedAt_idx" ON "public"."cases"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "cases_riskLevel_idx" ON "public"."cases"("riskLevel");

-- CreateIndex
CREATE INDEX "risk_flags_caseId_idx" ON "public"."risk_flags"("caseId");

-- CreateIndex
CREATE INDEX "decisions_caseId_createdAt_idx" ON "public"."decisions"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_events_caseId_createdAt_idx" ON "public"."audit_events"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_events_createdAt_idx" ON "public"."audit_events"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."risk_flags" ADD CONSTRAINT "risk_flags_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "public"."cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."decisions" ADD CONSTRAINT "decisions_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "public"."cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."decisions" ADD CONSTRAINT "decisions_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_events" ADD CONSTRAINT "audit_events_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "public"."cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_events" ADD CONSTRAINT "audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
