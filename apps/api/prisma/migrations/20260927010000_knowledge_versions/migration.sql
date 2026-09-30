CREATE TYPE "KnowledgeVersionStatus" AS ENUM ('UPLOADED','PROCESSING','READY','PUBLISHED','SUPERSEDED','FAILED');
ALTER TYPE "ActivityType" ADD VALUE 'KNOWLEDGE_VERSION_EVENT';
ALTER TABLE "KnowledgeDocument" ADD COLUMN "archivedAt" TIMESTAMP(3), ADD COLUMN "nextVersionNumber" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "currentPublishedVersionId" TEXT;
CREATE TABLE "KnowledgeDocumentVersion" (
 id TEXT PRIMARY KEY, "documentId" TEXT NOT NULL REFERENCES "KnowledgeDocument"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "versionNumber" INTEGER NOT NULL, status "KnowledgeVersionStatus" NOT NULL DEFAULT 'UPLOADED',
 "originalName" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "sizeBytes" INTEGER NOT NULL, "storageRef" TEXT NOT NULL,
 "sourceHash" TEXT, "contentHash" TEXT, "extractedText" TEXT, "createdByIdentity" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "publishedAt" TIMESTAMP(3), "semanticIndexedChunks" INTEGER,
 "embeddingModel" TEXT, "errorMessage" TEXT, "processingToken" TEXT, "leaseUntil" TIMESTAMP(3),
 CONSTRAINT "KnowledgeDocumentVersion_version_positive" CHECK ("versionNumber">0)
);
CREATE UNIQUE INDEX "KnowledgeDocumentVersion_documentId_versionNumber_key" ON "KnowledgeDocumentVersion"("documentId","versionNumber");
CREATE INDEX "KnowledgeDocumentVersion_documentId_status_idx" ON "KnowledgeDocumentVersion"("documentId",status);
CREATE UNIQUE INDEX "KnowledgeDocumentVersion_one_published" ON "KnowledgeDocumentVersion"("documentId") WHERE status='PUBLISHED';
ALTER TABLE "KnowledgeChunk" ADD COLUMN "documentVersionId" TEXT, ADD COLUMN "contentHash" TEXT;
-- Preserve document/chunk IDs and any existing SQL-managed embedding values.
-- Source bytes cannot be recovered by SQL: sourceHash remains explicitly unknown.
INSERT INTO "KnowledgeDocumentVersion" (id,"documentId","versionNumber",status,"originalName","mimeType","sizeBytes","storageRef","contentHash","createdByIdentity","createdAt","publishedAt","semanticIndexedChunks","errorMessage")
SELECT 'legacy-version-'||d.id,d.id,1,
 CASE WHEN d.status='READY' AND EXISTS(SELECT 1 FROM "KnowledgeChunk" c WHERE c."documentId"=d.id) THEN 'PUBLISHED'::"KnowledgeVersionStatus"
 WHEN d.status='FAILED' OR d.status='READY' THEN 'FAILED'::"KnowledgeVersionStatus" ELSE 'UPLOADED'::"KnowledgeVersionStatus" END,
 d."originalName",d."mimeType",d."sizeBytes",d."storagePath",
 (SELECT encode(sha256(convert_to(string_agg(c.content,E'\n' ORDER BY c."chunkIndex"),'UTF8')),'hex') FROM "KnowledgeChunk" c WHERE c."documentId"=d.id),
 d."uploadedById",d."createdAt",CASE WHEN d.status='READY' AND EXISTS(SELECT 1 FROM "KnowledgeChunk" c WHERE c."documentId"=d.id) THEN d."updatedAt" ELSE NULL END,
 d."semanticIndexedChunks",CASE WHEN d.status='PROCESSING' THEN 'Legacy processing must be queued again' ELSE d."errorMessage" END
FROM "KnowledgeDocument" d;
UPDATE "KnowledgeChunk" SET "documentVersionId"='legacy-version-'||"documentId", "contentHash"=encode(sha256(convert_to(content,'UTF8')),'hex');
UPDATE "KnowledgeDocument" d SET "nextVersionNumber"=2, "currentPublishedVersionId"=(SELECT v.id FROM "KnowledgeDocumentVersion" v WHERE v."documentId"=d.id AND v.status='PUBLISHED');
ALTER TABLE "KnowledgeChunk" ALTER COLUMN "documentVersionId" SET NOT NULL, ALTER COLUMN "contentHash" SET NOT NULL;
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "KnowledgeDocumentVersion"(id) ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX "KnowledgeChunk_documentId_chunkIndex_key";
CREATE UNIQUE INDEX "KnowledgeChunk_documentVersionId_chunkIndex_key" ON "KnowledgeChunk"("documentVersionId","chunkIndex");
CREATE INDEX "KnowledgeChunk_documentVersionId_idx" ON "KnowledgeChunk"("documentVersionId");
CREATE UNIQUE INDEX "KnowledgeDocument_currentPublishedVersionId_key" ON "KnowledgeDocument"("currentPublishedVersionId");
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_currentPublishedVersionId_fkey" FOREIGN KEY ("currentPublishedVersionId") REFERENCES "KnowledgeDocumentVersion"(id) ON DELETE NO ACTION ON UPDATE CASCADE;
CREATE TABLE "CopilotKnowledgeSource" (
 "copilotRunId" TEXT NOT NULL REFERENCES "CopilotRun"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "documentVersionId" TEXT NOT NULL REFERENCES "KnowledgeDocumentVersion"(id) ON DELETE NO ACTION ON UPDATE CASCADE,
 "chunkId" TEXT NOT NULL REFERENCES "KnowledgeChunk"(id) ON DELETE NO ACTION ON UPDATE CASCADE,
 PRIMARY KEY("copilotRunId","chunkId")
);
CREATE INDEX "CopilotKnowledgeSource_documentVersionId_idx" ON "CopilotKnowledgeSource"("documentVersionId");
CREATE INDEX "CopilotKnowledgeSource_chunkId_idx" ON "CopilotKnowledgeSource"("chunkId");
-- Existing immutable Copilot snapshots are not rewritten or guessed into version links.
CREATE FUNCTION supportiq_guard_knowledge_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD."publishedAt" IS NOT NULL AND EXISTS(SELECT 1 FROM "KnowledgeDocument" d JOIN "Organization" o ON o.id=d."organizationId" WHERE d.id=OLD."documentId") THEN
   RAISE EXCEPTION 'Published knowledge must be retained' USING ERRCODE='23514';
  END IF;
  RETURN OLD;
 END IF;
 IF OLD."publishedAt" IS NOT NULL AND ((to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') OR NOT (NEW.status=OLD.status OR (OLD.status='PUBLISHED' AND NEW.status='SUPERSEDED'))) THEN
  RAISE EXCEPTION 'Published knowledge is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.id<>OLD.id OR NEW."documentId"<>OLD."documentId" OR NEW."versionNumber"<>OLD."versionNumber" OR NEW."sourceHash" IS DISTINCT FROM OLD."sourceHash" OR NEW."storageRef"<>OLD."storageRef" THEN
  RAISE EXCEPTION 'Version identity and source are immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.status='PUBLISHED' AND OLD.status<>'PUBLISHED' AND (OLD.status<>'READY' OR NEW."publishedAt" IS NULL OR NEW."contentHash" IS NULL OR NOT EXISTS(SELECT 1 FROM "KnowledgeChunk" WHERE "documentVersionId"=NEW.id)) THEN
  RAISE EXCEPTION 'Version is not publishable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER knowledge_version_guard BEFORE UPDATE OR DELETE ON "KnowledgeDocumentVersion" FOR EACH ROW EXECUTE FUNCTION supportiq_guard_knowledge_version();
CREATE FUNCTION supportiq_guard_knowledge_chunk() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v "KnowledgeDocumentVersion"%ROWTYPE; d "KnowledgeDocument"%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN
  SELECT * INTO v FROM "KnowledgeDocumentVersion" WHERE id=OLD."documentVersionId" FOR SHARE;
  IF v."publishedAt" IS NOT NULL AND EXISTS(SELECT 1 FROM "KnowledgeDocument" kd JOIN "Organization" o ON o.id=kd."organizationId" WHERE kd.id=v."documentId") THEN
   RAISE EXCEPTION 'Published chunks and embeddings are immutable' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 SELECT * INTO STRICT v FROM "KnowledgeDocumentVersion" WHERE id=NEW."documentVersionId" FOR SHARE;
 SELECT * INTO STRICT d FROM "KnowledgeDocument" WHERE id=v."documentId";
 IF v."publishedAt" IS NOT NULL OR NEW."documentId"<>v."documentId" OR NEW."organizationId"<>d."organizationId" OR NEW."contentHash"<>encode(sha256(convert_to(NEW.content,'UTF8')),'hex') THEN
  RAISE EXCEPTION 'Invalid version chunk' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER knowledge_chunk_guard BEFORE INSERT OR UPDATE OR DELETE ON "KnowledgeChunk" FOR EACH ROW EXECUTE FUNCTION supportiq_guard_knowledge_chunk();
CREATE FUNCTION supportiq_guard_document_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM "Organization" WHERE id=OLD."organizationId") AND EXISTS(SELECT 1 FROM "KnowledgeDocumentVersion" WHERE "documentId"=OLD.id AND "publishedAt" IS NOT NULL) THEN
  RAISE EXCEPTION 'Archive published documents instead of deleting' USING ERRCODE='23514';
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER knowledge_document_delete_guard BEFORE DELETE ON "KnowledgeDocument" FOR EACH ROW EXECUTE FUNCTION supportiq_guard_document_delete();
CREATE FUNCTION supportiq_check_current_knowledge() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE docid TEXT;
BEGIN
 IF TG_TABLE_NAME='KnowledgeDocument' THEN docid=NEW.id; ELSE docid=NEW."documentId"; END IF;
 IF EXISTS(SELECT 1 FROM "KnowledgeDocument" d LEFT JOIN "KnowledgeDocumentVersion" v ON v.id=d."currentPublishedVersionId" WHERE d.id=docid AND d."currentPublishedVersionId" IS NOT NULL AND (v.id IS NULL OR v."documentId"<>d.id OR v.status<>'PUBLISHED')) THEN
  RAISE EXCEPTION 'Invalid current publication' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER knowledge_current_document AFTER INSERT OR UPDATE ON "KnowledgeDocument" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION supportiq_check_current_knowledge();
CREATE CONSTRAINT TRIGGER knowledge_current_version AFTER INSERT OR UPDATE ON "KnowledgeDocumentVersion" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION supportiq_check_current_knowledge();
CREATE FUNCTION supportiq_check_knowledge_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Knowledge source linkage is immutable' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "KnowledgeChunk" c JOIN "KnowledgeDocumentVersion" v ON v.id=c."documentVersionId" JOIN "CopilotRun" r ON r.id=NEW."copilotRunId" WHERE c.id=NEW."chunkId" AND v.id=NEW."documentVersionId" AND c."organizationId"=r."organizationId" AND v."publishedAt" IS NOT NULL) THEN
  RAISE EXCEPTION 'Invalid knowledge source linkage' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER copilot_knowledge_source_guard BEFORE INSERT OR UPDATE ON "CopilotKnowledgeSource" FOR EACH ROW EXECUTE FUNCTION supportiq_check_knowledge_source();
