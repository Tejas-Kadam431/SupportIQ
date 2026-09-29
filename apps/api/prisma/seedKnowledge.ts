import type { Prisma, PrismaClient } from "@prisma/client";
import { contentHash } from "../src/common/utils/contentHash.js";
// Seed-only synthetic publications have no uploaded file hash; chunks remain real immutable rows.
export async function createSeedKnowledge(prisma: PrismaClient, input: {
    data: Omit<Prisma.KnowledgeDocumentUncheckedCreateInput, "chunks"> & {
        chunks: {
            create: Array<{
                organizationId: string;
                chunkIndex: number;
                tokenCount: number;
                content: string;
            }>;
        };
    };
}) {
    return prisma.$transaction(async (tx) => {
        const { chunks, ...data } = input.data;
        const doc = await tx.knowledgeDocument.create({ data: { ...data, nextVersionNumber: 2 } });
        const text = chunks.create.map(c => c.content).join("\n");
        const v = await tx.knowledgeDocumentVersion.create({ data: { documentId: doc.id, versionNumber: 1, status: "READY", originalName: doc.originalName, mimeType: doc.mimeType, sizeBytes: doc.sizeBytes, storageRef: doc.storagePath, createdByIdentity: doc.uploadedById, contentHash: contentHash(text), extractedText: text, semanticIndexedChunks: 0 } });
        await tx.knowledgeChunk.createMany({ data: chunks.create.map(c => ({ ...c, documentId: doc.id, documentVersionId: v.id, contentHash: contentHash(c.content) })) });
        await tx.knowledgeDocumentVersion.update({ where: { id: v.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
        return tx.knowledgeDocument.update({ where: { id: doc.id }, data: { currentPublishedVersionId: v.id } });
    });
}
