-- Allow the intentional organization-erasure cascade to finish deleting runs/links
-- before checking their retained knowledge references. Standalone deletions remain
-- blocked by the publication guards and by these FKs at transaction commit.
ALTER TABLE "CopilotKnowledgeSource" ALTER CONSTRAINT "CopilotKnowledgeSource_documentVersionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "CopilotKnowledgeSource" ALTER CONSTRAINT "CopilotKnowledgeSource_chunkId_fkey" DEFERRABLE INITIALLY DEFERRED;
