-- CreateEnum
CREATE TYPE "KnowledgeIssueStatus" AS ENUM ('DETECTED', 'REVIEWING', 'FIX_PROPOSED', 'PUBLISHED', 'VERIFIED', 'DISMISSED');

-- CreateTable
CREATE TABLE "KnowledgeIssue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "groupingKey" TEXT NOT NULL,
    "normalizedTopic" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "KnowledgeIssueStatus" NOT NULL DEFAULT 'DETECTED',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "assigneeMemberId" TEXT,
    "candidateVersionId" TEXT,
    "fixNote" TEXT,
    "publishedAt" TIMESTAMP(3),
    "dismissalReason" TEXT,
    "dismissedAt" TIMESTAMP(3),
    "dismissedByIdentity" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeIssueSignal" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "copilotRunId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "classifierVersion" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeIssueSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeIssueSource" (
    "signalId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "attributed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "KnowledgeIssueSource_pkey" PRIMARY KEY ("signalId","documentVersionId")
);

-- CreateTable
CREATE TABLE "KnowledgeIssueHistory" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "actorIdentity" TEXT,
    "event" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeIssueHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeIssue_organizationId_status_updatedAt_idx" ON "KnowledgeIssue"("organizationId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "KnowledgeIssue_assigneeMemberId_idx" ON "KnowledgeIssue"("assigneeMemberId");

-- CreateIndex
CREATE INDEX "KnowledgeIssue_candidateVersionId_idx" ON "KnowledgeIssue"("candidateVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeIssue_organizationId_groupingKey_key" ON "KnowledgeIssue"("organizationId", "groupingKey");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeIssueSignal_copilotRunId_key" ON "KnowledgeIssueSignal"("copilotRunId");

-- CreateIndex
CREATE INDEX "KnowledgeIssueSignal_issueId_occurredAt_idx" ON "KnowledgeIssueSignal"("issueId", "occurredAt");

-- CreateIndex
CREATE INDEX "KnowledgeIssueSource_documentVersionId_idx" ON "KnowledgeIssueSource"("documentVersionId");

-- CreateIndex
CREATE INDEX "KnowledgeIssueHistory_issueId_createdAt_idx" ON "KnowledgeIssueHistory"("issueId", "createdAt");

-- AddForeignKey
ALTER TABLE "KnowledgeIssue" ADD CONSTRAINT "KnowledgeIssue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeIssue" ADD CONSTRAINT "KnowledgeIssue_assigneeMemberId_fkey" FOREIGN KEY ("assigneeMemberId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeIssue" ADD CONSTRAINT "KnowledgeIssue_candidateVersionId_fkey" FOREIGN KEY ("candidateVersionId") REFERENCES "KnowledgeDocumentVersion"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeIssueSignal" ADD CONSTRAINT "KnowledgeIssueSignal_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "KnowledgeIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeIssueSignal" ADD CONSTRAINT "KnowledgeIssueSignal_copilotRunId_fkey" FOREIGN KEY ("copilotRunId") REFERENCES "CopilotRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeIssueSource" ADD CONSTRAINT "KnowledgeIssueSource_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "KnowledgeIssueSignal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeIssueSource" ADD CONSTRAINT "KnowledgeIssueSource_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "KnowledgeDocumentVersion"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeIssueHistory" ADD CONSTRAINT "KnowledgeIssueHistory_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "KnowledgeIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Range scans use run creation time; no business backfill runs during schema migration.
CREATE INDEX "CopilotRun_organizationId_createdAt_idx" ON "CopilotRun"("organizationId","createdAt");
ALTER TABLE "KnowledgeIssue" ALTER CONSTRAINT "KnowledgeIssue_candidateVersionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "KnowledgeIssueSource" ALTER CONSTRAINT "KnowledgeIssueSource_documentVersionId_fkey" DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION supportiq_check_issue_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE org TEXT;
BEGIN
 IF TG_TABLE_NAME='KnowledgeIssue' THEN
  IF NEW."assigneeMemberId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "OrganizationMember" m WHERE m.id=NEW."assigneeMemberId" AND m."organizationId"=NEW."organizationId" AND m.role<>'CUSTOMER') THEN RAISE EXCEPTION 'Invalid issue assignee' USING ERRCODE='23514'; END IF;
  IF NEW."candidateVersionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "KnowledgeDocumentVersion" v JOIN "KnowledgeDocument" d ON d.id=v."documentId" WHERE v.id=NEW."candidateVersionId" AND d."organizationId"=NEW."organizationId") THEN RAISE EXCEPTION 'Invalid issue candidate' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='KnowledgeIssueSignal' THEN
  IF NOT EXISTS(SELECT 1 FROM "KnowledgeIssue" i JOIN "CopilotRun" r ON r."organizationId"=i."organizationId" WHERE i.id=NEW."issueId" AND r.id=NEW."copilotRunId") THEN RAISE EXCEPTION 'Invalid issue signal tenant' USING ERRCODE='23514'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM "KnowledgeIssueSignal" s JOIN "CopilotKnowledgeSource" k ON k."copilotRunId"=s."copilotRunId" WHERE s.id=NEW."signalId" AND k."documentVersionId"=NEW."documentVersionId") THEN RAISE EXCEPTION 'Invalid issue source lineage' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER knowledge_issue_tenant BEFORE INSERT OR UPDATE ON "KnowledgeIssue" FOR EACH ROW EXECUTE FUNCTION supportiq_check_issue_tenant();
CREATE TRIGGER knowledge_issue_signal_tenant BEFORE INSERT OR UPDATE ON "KnowledgeIssueSignal" FOR EACH ROW EXECUTE FUNCTION supportiq_check_issue_tenant();
CREATE TRIGGER knowledge_issue_source_tenant BEFORE INSERT OR UPDATE ON "KnowledgeIssueSource" FOR EACH ROW EXECUTE FUNCTION supportiq_check_issue_tenant();
