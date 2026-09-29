-- Operator-only provisioning after installing pgvector on a formerly lexical-only database.
-- Run with extension/DDL privileges, never from request handlers. No embeddings are generated here.
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE "KnowledgeChunk" ADD COLUMN IF NOT EXISTS embedding vector(1536);
