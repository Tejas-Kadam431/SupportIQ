import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { chunkText } from "./kb.chunker.js";
import { validateKnowledgeBytes } from "./kb.validation.js";
import { saveKnowledgeChunkEmbedding } from "./kb.vector.js";
import { lockDocument, knowledgeActivity } from "./kb.version.service.js";
import { contentHash } from "../../common/utils/contentHash.js";
import { env } from "../../config/env.js";
import { ingestionConfig as config } from "../../config/ingestion.js";
import { randomUUID } from "node:crypto";
import { getObjectStorage } from "../../common/storage.js";
import { classify, IngestionFailure, log, metric, requestId } from "../../common/operations.js";
import { knowledgeJobId } from "./kb.outbox.js";
export async function processKnowledgeDocument(orgId: string, documentId: string, versionId: string, generation?: number) {
    const token = randomUUID(), started = Date.now();
    const claimed = await prisma.$transaction(async (tx) => {
        await lockDocument(tx, orgId, documentId);
        const version = await tx.knowledgeDocumentVersion.findFirstOrThrow({ where: { id: versionId, documentId }, include: { sourceObject: true, ingestion: true } });
        if (["PUBLISHED", "SUPERSEDED", "READY"].includes(version.status))
            return null;
        let ingestion = version.ingestion;
        if (!ingestion)
            ingestion = await tx.knowledgeIngestion.create({ data: { versionId, requestId: requestId(undefined) } });
        if ((generation !== undefined && ingestion.generation !== generation) || !ingestion.retryable)
            return null;
        if (version.leaseUntil && version.leaseUntil > new Date())
            return null;
        const now = new Date(), attempt = ingestion.attempts + 1;
        await tx.knowledgeIngestionAttempt.updateMany({where:{versionId,completedAt:null},data:{stage:"FAILED",errorCategory:"PROCESSING_STALE",completedAt:now}});
        await tx.knowledgeDocumentVersion.update({ where: { id: versionId }, data: { status: "PROCESSING", processingToken: token, leaseUntil: new Date(Date.now() + config.INGESTION_LEASE_MS), errorMessage: null, semanticIndexedChunks: null } });
        await tx.knowledgeIngestion.update({ where: { versionId }, data: { stage: "FETCHING_SOURCE", attempts: attempt, startedAt: now, heartbeatAt: now, completedAt: null, errorCategory: null } });
        await tx.knowledgeIngestionAttempt.create({ data: { id: token, versionId, generation: ingestion.generation, attempt, startedAt: now, jobId: knowledgeJobId(versionId, ingestion.generation), requestId: ingestion.requestId, stage: "FETCHING_SOURCE" } });
        return { version, ingestion };
    });
    if (!claimed)
        return { versionId, status: "UNCHANGED" };
    const { version, ingestion } = claimed;
    async function fenced<T>(action: (tx: Prisma.TransactionClient) => Promise<T>) {
        return prisma.$transaction(async (tx) => {
            await lockDocument(tx, orgId, documentId, true);
            const current = await tx.knowledgeDocumentVersion.findUniqueOrThrow({ where: { id: versionId } });
            if (current.processingToken !== token || current.status !== "PROCESSING" || !current.leaseUntil || current.leaseUntil <= new Date())
                throw new IngestionFailure("PROCESSING_STALE", true);
            return action(tx);
        });
    }
    async function heartbeat(stage?: string) {
        await fenced(async (tx) => {
            await tx.knowledgeDocumentVersion.update({ where: { id: versionId }, data: { leaseUntil: new Date(Date.now() + config.INGESTION_LEASE_MS) } });
            await tx.knowledgeIngestion.update({ where: { versionId }, data: { heartbeatAt: new Date(), ...(stage ? { stage } : {}) } });
            if (stage)
                await tx.knowledgeIngestionAttempt.update({ where: { id: token }, data: { stage } });
        });
    }
    let beating = false, leaseLost = false;
    const timer = setInterval(() => { if (beating)
        return; beating = true; void heartbeat().catch(() => { leaseLost = true; }).finally(() => { beating = false; }); }, Math.max(10000, Math.floor(config.INGESTION_LEASE_MS / 3)));
    timer.unref();
    try {
        if (!version.sourceObject || version.sourceObject.backend !== config.KNOWLEDGE_STORAGE)
            throw new IngestionFailure("SOURCE_MISSING", false);
        const bytes = await getObjectStorage().get(version.sourceObject.objectKey);
        if (contentHash(bytes) !== version.sourceHash)
            throw new IngestionFailure("SOURCE_CHANGED", false);
        await heartbeat("EXTRACTING");
        const text = await validateKnowledgeBytes(bytes, version.originalName, version.mimeType);
        await heartbeat("CHUNKING");
        const chunks = chunkText(text);
        if (!chunks.length)
            throw new IngestionFailure("INVALID_FILE", false);
        const created = await fenced(async (tx) => {
            const existing = await tx.knowledgeChunk.findMany({ where: { documentVersionId: versionId }, orderBy: { chunkIndex: "asc" } });
            // Immutable bytes and deterministic chunking permit safe in-version retry reuse.
            if (existing.length && (existing.length !== chunks.length || existing.some((c, i) => c.contentHash !== contentHash(chunks[i]!.content))))
                throw new IngestionFailure("SOURCE_CHANGED", false);
            if (!existing.length)
                await tx.knowledgeChunk.createMany({ data: chunks.map(c => ({ ...c, documentId, documentVersionId: versionId, organizationId: orgId, contentHash: contentHash(c.content) })) });
            if (version.embeddingModel && version.embeddingModel !== env.OPENAI_EMBEDDING_MODEL)
                throw new IngestionFailure("INDEX_INCOMPLETE", false);
            await tx.knowledgeDocumentVersion.update({ where: { id: versionId }, data: { embeddingModel: env.OPENAI_API_KEY ? env.OPENAI_EMBEDDING_MODEL : null } });
            await tx.knowledgeIngestion.update({ where: { versionId }, data: { chunksTotal: chunks.length, embeddingModel: env.OPENAI_API_KEY ? env.OPENAI_EMBEDDING_MODEL : null } });
            return existing.length ? existing : tx.knowledgeChunk.findMany({ where: { documentVersionId: versionId }, orderBy: { chunkIndex: "asc" } });
        });
        await heartbeat("EMBEDDING");
        let count = 0;
        if (!env.OPENAI_API_KEY && config.INGESTION_REQUIRE_SEMANTIC === "true")
            throw new IngestionFailure("EMBEDDING_PROVIDER_FAILED", true);
        if (env.OPENAI_API_KEY) {
            for (let offset = 0; offset < created.length; offset += config.INGESTION_EMBEDDING_BATCH) {
                if (leaseLost)
                    throw new IngestionFailure("PROCESSING_STALE", true);
                const batch = await Promise.all(created.slice(offset, offset + config.INGESTION_EMBEDDING_BATCH).map(chunk => saveKnowledgeChunkEmbedding(chunk.id, chunk.content, token)));
                count += batch.filter(Boolean).length;
                await fenced(tx => tx.knowledgeIngestion.update({ where: { versionId }, data: { chunksEmbedded: count } }));
                if (batch.some(v => !v))
                    throw new IngestionFailure("EMBEDDING_PROVIDER_FAILED", true);
                await heartbeat("EMBEDDING");
            }
        }
        await heartbeat("INDEXING");
        await fenced(async (tx) => {
            if (await tx.knowledgeChunk.count({ where: { documentVersionId: versionId } }) !== chunks.length || (env.OPENAI_API_KEY && count !== chunks.length))
                throw new IngestionFailure("INDEX_INCOMPLETE", true);
            if (env.OPENAI_API_KEY) {
                const indexed = await tx.$queryRaw<Array<{
                    count: number;
                }>> `SELECT count(*)::int AS count FROM "KnowledgeChunk" WHERE "documentVersionId"=${versionId} AND embedding IS NOT NULL`;
                if (indexed[0]?.count !== chunks.length)
                    throw new IngestionFailure("INDEX_INCOMPLETE", true);
            }
            await tx.knowledgeDocumentVersion.update({ where: { id: versionId }, data: { status: "READY", extractedText: text, contentHash: contentHash(text), semanticIndexedChunks: count, embeddingModel: count ? env.OPENAI_EMBEDDING_MODEL : null, processingToken: null, leaseUntil: null, errorMessage: null } });
            await tx.knowledgeIngestion.update({ where: { versionId }, data: { stage: "READY", completedAt: new Date(), chunksEmbedded: count, lexicalReady: true, semanticReady: count === chunks.length } });
            await tx.knowledgeIngestionAttempt.update({ where: { id: token }, data: { stage: "READY", completedAt: new Date(), durationMs: Date.now() - started } });
            await knowledgeActivity(tx, orgId, null, documentId, versionId, version.versionNumber, "VERSION_PROCESSING_COMPLETED");
        });
        metric("processing_success");
        metric("processing_duration_ms", Date.now() - started);
        log("knowledge.ready", { requestId: ingestion.requestId, knowledgeVersionId: versionId, durationMs: Date.now() - started });
        return { versionId, status: "READY", chunkCount: chunks.length, embeddedChunkCount: count };
    }
    catch (error) {
        const failure = classify(error);
        await prisma.$transaction(async (tx) => {
            await lockDocument(tx, orgId, documentId, true);
            const changed = await tx.knowledgeDocumentVersion.updateMany({ where: { id: versionId, status: "PROCESSING", processingToken: token }, data: { status: "FAILED", processingToken: null, leaseUntil: null, errorMessage: failure.category } });
            if (changed.count) {
                await tx.knowledgeIngestion.update({ where: { versionId }, data: { stage: "FAILED", errorCategory: failure.category, retryable: failure.retryable, completedAt: new Date(), lexicalReady: false, semanticReady: false } });
                await tx.knowledgeIngestionAttempt.update({ where: { id: token }, data: { stage: "FAILED", errorCategory: failure.category, retryable: failure.retryable, completedAt: new Date(), durationMs: Date.now() - started } });
                await knowledgeActivity(tx, orgId, null, documentId, versionId, version.versionNumber, "VERSION_PROCESSING_FAILED");
            }
        }).catch(() => log("knowledge.failure_record_deferred", { knowledgeVersionId: versionId, category: "DATABASE_ERROR" }));
        metric("processing_failure");
        log("knowledge.failed", { requestId: ingestion.requestId, knowledgeVersionId: versionId, category: failure.category });
        throw failure;
    }
    finally {
        clearInterval(timer);
    }
}
