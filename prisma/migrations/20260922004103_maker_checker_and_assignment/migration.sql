-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."AuditAction" ADD VALUE 'CASE_CLAIMED';
ALTER TYPE "public"."AuditAction" ADD VALUE 'CASE_RELEASED';
ALTER TYPE "public"."AuditAction" ADD VALUE 'CASE_DECISION_PROPOSED';
ALTER TYPE "public"."AuditAction" ADD VALUE 'CASE_DECISION_RETURNED';

-- AlterEnum
ALTER TYPE "public"."CaseStatus" ADD VALUE 'AWAITING_SECOND_APPROVAL';

-- AlterEnum
ALTER TYPE "public"."Role" ADD VALUE 'REVIEWER';

-- AlterTable
ALTER TABLE "public"."cases" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "proposedAt" TIMESTAMP(3),
ADD COLUMN     "proposedById" TEXT,
ADD COLUMN     "proposedReason" TEXT,
ADD COLUMN     "proposedStatus" "public"."CaseStatus";

-- CreateIndex
CREATE INDEX "cases_assignedToId_idx" ON "public"."cases"("assignedToId");

-- AddForeignKey
ALTER TABLE "public"."cases" ADD CONSTRAINT "cases_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cases" ADD CONSTRAINT "cases_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
