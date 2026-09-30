import { currentKnowledgeScope, visibleKnowledge, type KnowledgeScope } from "./kb.scope.js";
import OpenAI from "openai";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import type { Candidate, SearchStatus } from "./kb.retrieval.js";
const DIMENSIONS = 1536;
export async function createTextEmbedding(text: string): Promise<{
    embedding: number[] | null;
    status: SearchStatus;
}> {
    if (!env.OPENAI_API_KEY)
        return { embedding: null, status: "NOT_CONFIGURED" };
    try {
        const response = await new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 10000, maxRetries: 0 }).embeddings.create({ model: env.OPENAI_EMBEDDING_MODEL, input: text.slice(0, 8000), dimensions: DIMENSIONS });
        const embedding = response.data[0]?.embedding;
        if (!embedding || embedding.length !== DIMENSIONS || !embedding.every(Number.isFinite) || !embedding.some(v => v !== 0))
            throw new Error("Invalid embedding");
        return { embedding, status: "OK" };
    }
    catch {
        console.warn({ event: "retrieval.embedding_failed" });
        return { embedding: null, status: "EMBEDDING_FAILED" };
    }
}
export async function saveKnowledgeChunkEmbedding(chunkId: string, content: string, processingToken?: string) {
    if (processingToken) {
        const existing = await prisma.$queryRaw<Array<{
            id: string;
        }>> `SELECT c.id FROM "KnowledgeChunk" c JOIN "KnowledgeDocumentVersion" v ON v.id=c."documentVersionId" WHERE c.id=${chunkId} AND c.embedding IS NOT NULL AND v."embeddingModel"=${env.OPENAI_EMBEDDING_MODEL} AND v."processingToken"=${processingToken}`;
        if (existing.length)
            return true;
    }
    const { embedding } = await createTextEmbedding(content);
    if (!embedding)
        return false;
    return prisma.$transaction(async (tx) => {
        const chunk = await tx.knowledgeChunk.findUniqueOrThrow({ where: { id: chunkId } });
        await tx.$queryRaw `SELECT id FROM "KnowledgeDocument" WHERE id=${chunk.documentId} FOR UPDATE`;
        const version = await tx.knowledgeDocumentVersion.findUniqueOrThrow({ where: { id: chunk.documentVersionId } });
        if (version.publishedAt || version.status !== "PROCESSING" || !processingToken || version.processingToken !== processingToken || !version.leaseUntil || version.leaseUntil <= new Date())
            return false;
        return (await tx.$executeRaw `UPDATE "KnowledgeChunk" SET embedding=${JSON.stringify(embedding)}::vector WHERE id=${chunkId}`) === 1;
    });
}
export async function queryVectorCandidates(orgId: string, embedding: number[], limit: number, suppliedScope?: KnowledgeScope): Promise<Candidate[]> {
    const scope = suppliedScope ?? await currentKnowledgeScope(orgId);
    const rows = await prisma.$queryRaw<Array<{
        documentVersionId: string;
        versionNumber: number;
        publishedAt: string | null;
        id: string;
        documentId: string;
        chunkIndex: number;
        tokenCount: number;
        content: string;
        originalName: string;
        distance: number;
    }>> `
    SELECT kc.id,kv.id AS "documentVersionId",kv."versionNumber",kv."publishedAt"::text AS "publishedAt",kc."documentId",kc."chunkIndex",kc."tokenCount",kc.content,kv."originalName",(kc.embedding <=> ${JSON.stringify(embedding)}::vector)::float8 AS distance
    FROM "KnowledgeChunk" kc JOIN "KnowledgeDocumentVersion" kv ON kv.id=kc."documentVersionId" JOIN "KnowledgeDocument" kd ON kd.id=kc."documentId"
    WHERE ${visibleKnowledge(orgId, scope)} AND kc.embedding IS NOT NULL AND kv."embeddingModel"=${env.OPENAI_EMBEDDING_MODEL}
    ORDER BY distance ASC,kc.id ASC LIMIT ${Math.min(limit, 20)}
  `;
    return rows.filter(r => Number.isFinite(Number(r.distance))).map(r => ({ ...r, distance: Number(r.distance), score: 1 - Number(r.distance), document: { originalName: r.originalName } }));
}
export async function searchKnowledgeChunksByVector(orgId: string, query: string, limit: number, suppliedScope?: KnowledgeScope) {
    const scope = suppliedScope ?? await currentKnowledgeScope(orgId);
    const result = await createTextEmbedding(query);
    if (!result.embedding)
        return { status: result.status, results: [] as Candidate[], missingEmbeddings: null as number | null };
    try {
        const results = await queryVectorCandidates(orgId, result.embedding, limit, scope);
        const counts = await prisma.$queryRaw<Array<{
            missing: number;
        }>> `SELECT count(*)::int AS missing FROM "KnowledgeChunk" kc JOIN "KnowledgeDocumentVersion" kv ON kv.id=kc."documentVersionId" JOIN "KnowledgeDocument" kd ON kd.id=kc."documentId"
      WHERE ${visibleKnowledge(orgId, scope)} AND (kc.embedding IS NULL OR kv."embeddingModel" IS DISTINCT FROM ${env.OPENAI_EMBEDDING_MODEL})`;
        const missingEmbeddings = counts[0]?.missing ?? 0;
        return { status: (missingEmbeddings ? "INDEX_INCOMPLETE" : "OK") as SearchStatus, results, missingEmbeddings };
    }
    catch {
        console.warn({ event: "retrieval.vector_failed" });
        return { status: "VECTOR_FAILED" as SearchStatus, results: [] as Candidate[], missingEmbeddings: null };
    }
}
