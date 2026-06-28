import OpenAI from "openai";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";

const KNOWLEDGE_EMBEDDING_DIMENSIONS = 1536;

type SemanticChunkRow = {
  id: string;
  organizationId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  createdAt: Date;
  score: number | string;
  distance: number | string;

  document_id: string;
  document_original_name: string;
  document_file_name: string;
  document_mime_type: string;
  document_status: string;
  document_created_at: Date;
};

let vectorStoreReadyPromise: Promise<void> | null = null;

function getOpenAIClient() {
  if (!env.OPENAI_API_KEY) {
    return null;
  }

  return new OpenAI({
    apiKey: env.OPENAI_API_KEY
  });
}

function formatEmbeddingForPgVector(embedding: number[]) {
  return `[${embedding.map((value) => Number(value)).join(",")}]`;
}

async function ensureKnowledgeVectorStore() {
  if (!vectorStoreReadyPromise) {
    vectorStoreReadyPromise = (async () => {
      await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);

      await prisma.$executeRawUnsafe(`
        ALTER TABLE "KnowledgeChunk"
        ADD COLUMN IF NOT EXISTS "embedding" vector(${KNOWLEDGE_EMBEDDING_DIMENSIONS})
      `);
    })();
  }

  await vectorStoreReadyPromise;
}

async function createTextEmbedding(text: string) {
  const openai = getOpenAIClient();

  if (!openai) {
    return null;
  }

  const input = text.trim();

  if (!input) {
    return null;
  }

  try {
    const response = await openai.embeddings.create({
      model: env.OPENAI_EMBEDDING_MODEL,
      input: input.slice(0, 8000),
      dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS
    });

    const embedding = response.data[0]?.embedding;

    if (!embedding || embedding.length !== KNOWLEDGE_EMBEDDING_DIMENSIONS) {
      console.warn("Unexpected embedding dimensions received from OpenAI.");
      return null;
    }

    return embedding;
  } catch (error) {
    console.error("Failed to create OpenAI embedding:", error);
    return null;
  }
}

export async function saveKnowledgeChunkEmbedding(
  chunkId: string,
  content: string
) {
  const embedding = await createTextEmbedding(content);

  if (!embedding) {
    return false;
  }

  try {
    await ensureKnowledgeVectorStore();

    const vector = formatEmbeddingForPgVector(embedding);

    await prisma.$executeRawUnsafe(
      `
        UPDATE "KnowledgeChunk"
        SET "embedding" = $1::vector
        WHERE id = $2
      `,
      vector,
      chunkId
    );

    return true;
  } catch (error) {
    console.error(`Failed to save embedding for chunk ${chunkId}:`, error);
    return false;
  }
}

export async function searchKnowledgeChunksByVector(
  orgId: string,
  query: string,
  limit: number
) {
  const embedding = await createTextEmbedding(query);

  if (!embedding) {
    return [];
  }

  try {
    await ensureKnowledgeVectorStore();

    const vector = formatEmbeddingForPgVector(embedding);

    const rows = await prisma.$queryRawUnsafe<SemanticChunkRow[]>(
      `
        SELECT
          kc.id,
          kc."organizationId",
          kc."documentId",
          kc."chunkIndex",
          kc.content,
          kc."tokenCount",
          kc."createdAt",
          GREATEST(0, ROUND(((1 - (kc.embedding <=> $1::vector)) * 100)::numeric, 2)) AS score,
          (kc.embedding <=> $1::vector) AS distance,
          kd.id AS document_id,
          kd."originalName" AS document_original_name,
          kd."fileName" AS document_file_name,
          kd."mimeType" AS document_mime_type,
          kd.status::text AS document_status,
          kd."createdAt" AS document_created_at
        FROM "KnowledgeChunk" kc
        INNER JOIN "KnowledgeDocument" kd
          ON kd.id = kc."documentId"
        WHERE kc."organizationId" = $2
          AND kd.status = 'READY'::"KnowledgeDocumentStatus"
          AND kc.embedding IS NOT NULL
        ORDER BY kc.embedding <=> $1::vector
        LIMIT $3
      `,
      vector,
      orgId,
      limit
    );

    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      documentId: row.documentId,
      chunkIndex: row.chunkIndex,
      content: row.content,
      tokenCount: row.tokenCount,
      createdAt: row.createdAt,
      score: Number(row.score),
      distance: Number(row.distance),
      searchType: "semantic" as const,
      document: {
        id: row.document_id,
        originalName: row.document_original_name,
        fileName: row.document_file_name,
        mimeType: row.document_mime_type,
        status: row.document_status,
        createdAt: row.document_created_at
      }
    }));
  } catch (error) {
    console.error("Semantic knowledge search failed. Falling back to keyword search.", error);
    return [];
  }
}