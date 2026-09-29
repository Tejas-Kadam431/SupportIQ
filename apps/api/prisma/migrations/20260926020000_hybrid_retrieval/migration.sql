-- No historical Copilot rows are rewritten. FTS works without optional pgvector.
CREATE INDEX "KnowledgeChunk_content_fts_idx" ON "KnowledgeChunk" USING GIN (to_tsvector('english', content));
ALTER TABLE "KnowledgeDocument" ADD COLUMN "semanticIndexedChunks" INTEGER;
-- Null denotes unknown coverage on legacy documents. Processing records actual successes.
-- Extension privileges are required when the installed extension is available.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name='vector') THEN
   CREATE EXTENSION IF NOT EXISTS vector;
   ALTER TABLE "KnowledgeChunk" ADD COLUMN IF NOT EXISTS embedding vector(1536);
 END IF;
END $$;
