-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('DRAFT', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExperimentPurpose" AS ENUM ('PRE_PUBLICATION', 'POST_PUBLICATION_VERIFICATION', 'GENERAL_COMPARISON');

-- CreateEnum
CREATE TYPE "ReplayClassification" AS ENUM ('IMPROVED', 'UNCHANGED', 'REGRESSED', 'INCONCLUSIVE', 'ERROR');

-- CreateTable
CREATE TABLE "EvaluationSuite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "issueId" TEXT,
    "name" TEXT NOT NULL,
    "actorIdentity" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sampling" JSONB NOT NULL,

    CONSTRAINT "EvaluationSuite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationCase" (
    "id" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "historicalCopilotRunId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "baseline" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationExperiment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "actorIdentity" TEXT NOT NULL,
    "purpose" "ExperimentPurpose" NOT NULL,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'DRAFT',
    "configuration" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "EvaluationExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationScopeVersion" (
    "experimentId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "override" BOOLEAN NOT NULL,
    "contentHash" TEXT NOT NULL,

    CONSTRAINT "EvaluationScopeVersion_pkey" PRIMARY KEY ("experimentId","documentVersionId")
);

-- CreateTable
CREATE TABLE "EvaluationResult" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "classification" "ReplayClassification" NOT NULL,
    "candidate" JSONB NOT NULL,
    "comparison" JSONB NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvaluationSuite_organizationId_createdAt_idx" ON "EvaluationSuite"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "EvaluationSuite_issueId_idx" ON "EvaluationSuite"("issueId");

-- CreateIndex
CREATE INDEX "EvaluationCase_historicalCopilotRunId_idx" ON "EvaluationCase"("historicalCopilotRunId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationCase_suiteId_historicalCopilotRunId_key" ON "EvaluationCase"("suiteId", "historicalCopilotRunId");

-- CreateIndex
CREATE INDEX "EvaluationExperiment_organizationId_status_createdAt_idx" ON "EvaluationExperiment"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "EvaluationExperiment_organizationId_purpose_createdAt_idx" ON "EvaluationExperiment"("organizationId", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "EvaluationExperiment_suiteId_idx" ON "EvaluationExperiment"("suiteId");

-- CreateIndex
CREATE INDEX "EvaluationScopeVersion_documentVersionId_idx" ON "EvaluationScopeVersion"("documentVersionId");

-- CreateIndex
CREATE INDEX "EvaluationResult_experimentId_classification_idx" ON "EvaluationResult"("experimentId", "classification");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationResult_experimentId_caseId_key" ON "EvaluationResult"("experimentId", "caseId");

-- AddForeignKey
ALTER TABLE "EvaluationSuite" ADD CONSTRAINT "EvaluationSuite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationSuite" ADD CONSTRAINT "EvaluationSuite_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "KnowledgeIssue"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationCase" ADD CONSTRAINT "EvaluationCase_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "EvaluationSuite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationCase" ADD CONSTRAINT "EvaluationCase_historicalCopilotRunId_fkey" FOREIGN KEY ("historicalCopilotRunId") REFERENCES "CopilotRun"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationExperiment" ADD CONSTRAINT "EvaluationExperiment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationExperiment" ADD CONSTRAINT "EvaluationExperiment_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "EvaluationSuite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationScopeVersion" ADD CONSTRAINT "EvaluationScopeVersion_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "EvaluationExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationScopeVersion" ADD CONSTRAINT "EvaluationScopeVersion_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "KnowledgeDocumentVersion"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationResult" ADD CONSTRAINT "EvaluationResult_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "EvaluationExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationResult" ADD CONSTRAINT "EvaluationResult_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "EvaluationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Retain referenced history while preserving whole-tenant erasure.
ALTER TABLE "EvaluationSuite" ALTER CONSTRAINT "EvaluationSuite_issueId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "EvaluationCase" ALTER CONSTRAINT "EvaluationCase_historicalCopilotRunId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "EvaluationScopeVersion" ALTER CONSTRAINT "EvaluationScopeVersion_documentVersionId_fkey" DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION supportiq_guard_evaluation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tenant text; parent_tenant text; suite text; experiment_status text;
BEGIN
  IF TG_TABLE_NAME='EvaluationSuite' THEN
    tenant := COALESCE(NEW."organizationId",OLD."organizationId");
    IF TG_OP='INSERT' AND NEW."issueId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "KnowledgeIssue" WHERE id=NEW."issueId" AND "organizationId"=tenant) THEN RAISE EXCEPTION 'Invalid evaluation issue'; END IF;
  ELSIF TG_TABLE_NAME='EvaluationCase' THEN
    SELECT "organizationId" INTO tenant FROM "EvaluationSuite" WHERE id=COALESCE(NEW."suiteId",OLD."suiteId");
    IF TG_OP='INSERT' THEN
      IF NOT EXISTS(SELECT 1 FROM "CopilotRun" WHERE id=NEW."historicalCopilotRunId" AND "organizationId"=tenant) OR EXISTS(SELECT 1 FROM "EvaluationExperiment" WHERE "suiteId"=NEW."suiteId") THEN RAISE EXCEPTION 'Invalid or sealed evaluation suite'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='EvaluationExperiment' THEN
    tenant := COALESCE(NEW."organizationId",OLD."organizationId");
    IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM "EvaluationSuite" WHERE id=NEW."suiteId" AND "organizationId"=tenant) THEN RAISE EXCEPTION 'Invalid evaluation suite'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IN ('DRAFT','RUNNING') AND
       (to_jsonb(NEW)-ARRAY['status','summary','errorCode','startedAt','completedAt'])=(to_jsonb(OLD)-ARRAY['status','summary','errorCode','startedAt','completedAt']) AND
       ((OLD.status='DRAFT' AND NEW.status IN ('RUNNING','CANCELLED')) OR (OLD.status='RUNNING' AND NEW.status IN ('COMPLETED','FAILED','CANCELLED'))) THEN RETURN NEW; END IF;
  ELSE
    SELECT "organizationId","suiteId",status::text INTO tenant,suite,experiment_status FROM "EvaluationExperiment" WHERE id=COALESCE(NEW."experimentId",OLD."experimentId");
    IF TG_OP='INSERT' AND TG_TABLE_NAME='EvaluationResult' THEN
      IF experiment_status <> 'RUNNING' OR NOT EXISTS(SELECT 1 FROM "EvaluationCase" WHERE id=NEW."caseId" AND "suiteId"=suite) THEN RAISE EXCEPTION 'Invalid evaluation result'; END IF;
    ELSIF TG_OP='INSERT' AND TG_TABLE_NAME='EvaluationScopeVersion' THEN
      IF experiment_status <> 'DRAFT' OR NOT EXISTS(SELECT 1 FROM "KnowledgeDocumentVersion" v JOIN "KnowledgeDocument" d ON d.id=v."documentId" WHERE v.id=NEW."documentVersionId" AND d."organizationId"=tenant AND d."archivedAt" IS NULL AND v.status IN ('READY','PUBLISHED','SUPERSEDED') AND v."contentHash"=NEW."contentHash") THEN RAISE EXCEPTION 'Invalid evaluation scope'; END IF;
    END IF;
  END IF;
  IF TG_OP='INSERT' THEN RETURN NEW; END IF;
  IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM "Organization" WHERE id=tenant) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Evaluation records are immutable';
END $$;
CREATE TRIGGER evaluation_suite_guard BEFORE INSERT OR UPDATE OR DELETE ON "EvaluationSuite" FOR EACH ROW EXECUTE FUNCTION supportiq_guard_evaluation();
CREATE TRIGGER evaluation_case_guard BEFORE INSERT OR UPDATE OR DELETE ON "EvaluationCase" FOR EACH ROW EXECUTE FUNCTION supportiq_guard_evaluation();
CREATE TRIGGER evaluation_experiment_guard BEFORE INSERT OR UPDATE OR DELETE ON "EvaluationExperiment" FOR EACH ROW EXECUTE FUNCTION supportiq_guard_evaluation();
CREATE TRIGGER evaluation_scope_guard BEFORE INSERT OR UPDATE OR DELETE ON "EvaluationScopeVersion" FOR EACH ROW EXECUTE FUNCTION supportiq_guard_evaluation();
CREATE TRIGGER evaluation_result_guard BEFORE INSERT OR UPDATE OR DELETE ON "EvaluationResult" FOR EACH ROW EXECUTE FUNCTION supportiq_guard_evaluation();

CREATE FUNCTION supportiq_pin_evaluation_knowledge() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_id text; tenant text;
BEGIN
  IF TG_TABLE_NAME='KnowledgeChunk' THEN
    IF TG_OP='UPDATE' AND NEW."documentVersionId" IS DISTINCT FROM OLD."documentVersionId" AND EXISTS(SELECT 1 FROM "EvaluationScopeVersion" WHERE "documentVersionId"=OLD."documentVersionId") THEN RAISE EXCEPTION 'Cannot move a pinned knowledge chunk'; END IF;
    version_id:=COALESCE(NEW."documentVersionId",OLD."documentVersionId");
  ELSE version_id:=OLD.id; END IF;
  SELECT d."organizationId" INTO tenant FROM "KnowledgeDocumentVersion" v JOIN "KnowledgeDocument" d ON d.id=v."documentId" WHERE v.id=version_id;
  IF EXISTS(SELECT 1 FROM "EvaluationScopeVersion" WHERE "documentVersionId"=version_id) AND EXISTS(SELECT 1 FROM "Organization" WHERE id=tenant) THEN
    IF TG_TABLE_NAME='KnowledgeDocumentVersion' AND TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['status','publishedAt'])=(to_jsonb(OLD)-ARRAY['status','publishedAt']) AND ((OLD.status='READY' AND NEW.status='PUBLISHED') OR (OLD.status='PUBLISHED' AND NEW.status='SUPERSEDED')) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Knowledge content pinned by evaluation';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER evaluation_version_pin BEFORE UPDATE OR DELETE ON "KnowledgeDocumentVersion" FOR EACH ROW EXECUTE FUNCTION supportiq_pin_evaluation_knowledge();
CREATE TRIGGER evaluation_chunk_pin BEFORE INSERT OR UPDATE OR DELETE ON "KnowledgeChunk" FOR EACH ROW EXECUTE FUNCTION supportiq_pin_evaluation_knowledge();
