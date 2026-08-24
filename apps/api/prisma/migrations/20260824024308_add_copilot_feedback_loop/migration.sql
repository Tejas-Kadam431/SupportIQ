-- CreateEnum
CREATE TYPE "CopilotDisposition" AS ENUM ('ACCEPTED', 'EDITED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CopilotFailureReason" AS ENUM ('WRONG_KNOWLEDGE', 'MISSING_CUSTOMER_CONTEXT', 'INSUFFICIENT_KB', 'IRRELEVANT_EVIDENCE', 'INCORRECT_RECOMMENDATION', 'INCOMPLETE_RESPONSE', 'BAD_TONE', 'UNSUPPORTED_CLAIM', 'OTHER');

-- CreateTable
CREATE TABLE "CopilotRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "triggeredById" TEXT,
    "provider" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "issueSummary" TEXT NOT NULL,
    "missingInformation" JSONB NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "suggestedReply" TEXT,
    "abstained" BOOLEAN NOT NULL DEFAULT false,
    "searchQuery" TEXT NOT NULL,
    "searchMode" TEXT NOT NULL,
    "sourceCount" INTEGER NOT NULL,
    "sources" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopilotRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopilotEvaluation" (
    "id" TEXT NOT NULL,
    "copilotRunId" TEXT NOT NULL,
    "evaluatorId" TEXT,
    "disposition" "CopilotDisposition" NOT NULL,
    "reason" "CopilotFailureReason",
    "finalMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopilotEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CopilotRun_organizationId_idx" ON "CopilotRun"("organizationId");

-- CreateIndex
CREATE INDEX "CopilotRun_ticketId_idx" ON "CopilotRun"("ticketId");

-- CreateIndex
CREATE INDEX "CopilotRun_triggeredById_idx" ON "CopilotRun"("triggeredById");

-- CreateIndex
CREATE INDEX "CopilotRun_topic_idx" ON "CopilotRun"("topic");

-- CreateIndex
CREATE INDEX "CopilotRun_createdAt_idx" ON "CopilotRun"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CopilotEvaluation_copilotRunId_key" ON "CopilotEvaluation"("copilotRunId");

-- CreateIndex
CREATE INDEX "CopilotEvaluation_evaluatorId_idx" ON "CopilotEvaluation"("evaluatorId");

-- CreateIndex
CREATE INDEX "CopilotEvaluation_disposition_idx" ON "CopilotEvaluation"("disposition");

-- CreateIndex
CREATE INDEX "CopilotEvaluation_reason_idx" ON "CopilotEvaluation"("reason");

-- CreateIndex
CREATE INDEX "CopilotEvaluation_createdAt_idx" ON "CopilotEvaluation"("createdAt");

-- AddForeignKey
ALTER TABLE "CopilotRun" ADD CONSTRAINT "CopilotRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotRun" ADD CONSTRAINT "CopilotRun_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotRun" ADD CONSTRAINT "CopilotRun_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotEvaluation" ADD CONSTRAINT "CopilotEvaluation_copilotRunId_fkey" FOREIGN KEY ("copilotRunId") REFERENCES "CopilotRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotEvaluation" ADD CONSTRAINT "CopilotEvaluation_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
