import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/AppError.js";
import { chunkText } from "./kb.chunker.js";
import { extractTextFromBytes } from "./kb.text.js";
import { saveKnowledgeChunkEmbedding } from "./kb.vector.js";
import { lockDocument, knowledgeActivity } from "./kb.version.service.js";
import { contentHash } from "../../common/utils/contentHash.js";
import { env } from "../../config/env.js";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
export async function processKnowledgeDocument(orgId: string, documentId: string, versionId: string) {
    const token = randomUUID();
    const version = await prisma.$transaction(async (tx) => {
        await lockDocument(tx, orgId, documentId);
        const version = await tx.knowledgeDocumentVersion.findFirst({ where: { id: versionId, documentId } });
        if (!version)
            throw new AppError("Version not found", 404);
        if (["PUBLISHED", "SUPERSEDED", "READY"].includes(version.status))
            return null;
        if (version.leaseUntil && version.leaseUntil > new Date())
            throw new AppError("Version is already processing", 409);
        return tx.knowledgeDocumentVersion.update({ where: { id: versionId }, data: { status: "PROCESSING", processingToken: token, leaseUntil: new Date(Date.now() + 30 * 60 * 1000), errorMessage: null, semanticIndexedChunks: null } });
    });
    if (!version)
        return { versionId, status: "UNCHANGED" };
    async function fenced<T>(action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
        return prisma.$transaction(async (tx) => {
            await lockDocument(tx, orgId, documentId, true);
            const current = await tx.knowledgeDocumentVersion.findUniqueOrThrow({ where: { id: versionId } });
            if (current.processingToken !== token || current.status !== "PROCESSING")
                throw new AppError("Processing attempt replaced", 409);
            return action(tx);
        });
    }
    try {
        const bytes = await fs.readFile(version.storageRef);
        if (version.sourceHash && contentHash(bytes) !== version.sourceHash)
            throw new AppError("Uploaded source changed", 409);
        const text = await extractTextFromBytes(bytes, version.storageRef, version.mimeType);
        if (text.length > 2000000)
            throw new AppError("Extracted text exceeds processing limit", 413);
        const chunks = chunkText(text);
        if (!chunks.length)
            throw new AppError("No readable document content", 400);
        const created = await fenced(async (tx) => {
            await tx.knowledgeChunk.deleteMany({ where: { documentVersionId: versionId } });
            await tx.knowledgeChunk.createMany({ data: chunks.map(chunk => ({ ...chunk, documentId, documentVersionId: versionId, organizationId: orgId, contentHash: contentHash(chunk.content) })) });
            return tx.knowledgeChunk.findMany({ where: { documentVersionId: versionId }, orderBy: { chunkIndex: "asc" } });
        });
        let count = 0;
        for (const chunk of created)
            if (await saveKnowledgeChunkEmbedding(chunk.id, chunk.content, token))
                count++;
        await fenced(async (tx) => {
            await tx.knowledgeDocumentVersion.update({ where: { id: versionId }, data: { status: "READY", extractedText: text, contentHash: contentHash(text), semanticIndexedChunks: count, embeddingModel: count ? env.OPENAI_EMBEDDING_MODEL : null, processingToken: null, leaseUntil: null, errorMessage: null } });
            await knowledgeActivity(tx, orgId, null, documentId, versionId, version.versionNumber, "VERSION_PROCESSING_COMPLETED");
        });
        return { versionId, status: "READY", chunkCount: chunks.length, embeddedChunkCount: count };
    }
    catch (error) {
        await prisma.$transaction(async (tx) => {
            await lockDocument(tx, orgId, documentId, true);
            const changed = await tx.knowledgeDocumentVersion.updateMany({ where: { id: versionId, status: "PROCESSING", processingToken: token }, data: { status: "FAILED", processingToken: null, leaseUntil: null, errorMessage: "Processing failed. Verify the source file and retry." } });
            if (changed.count)
                await knowledgeActivity(tx, orgId, null, documentId, versionId, version.versionNumber, "VERSION_PROCESSING_FAILED");
        });
        console.warn({ event: "knowledge.processing_failed", versionId });
        throw new AppError("Knowledge processing failed", 503);
    }
}
