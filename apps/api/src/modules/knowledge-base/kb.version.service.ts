import { prisma } from "../../config/prisma.js";
import type { Prisma } from "@prisma/client";
import { AppError } from "../../common/errors/AppError.js";
import { currentMembership, lockOrganization } from "../organizations/org.transaction.js";
import { isDemoReadonlyUserId } from "../../common/middleware/demoReadOnly.middleware.js";
import { contentHash } from "../../common/utils/contentHash.js";
import fs from "node:fs/promises";
export type SourceUpload = {
    fileName: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    storagePath: string;
};
export async function authorizeKnowledge(tx: Prisma.TransactionClient, userId: string, orgId: string, write = false) {
    if (write)
        await lockOrganization(tx, orgId);
    const member = await currentMembership(tx, userId, orgId);
    if (member.role === "CUSTOMER" || (write && member.role !== "OWNER" && member.role !== "ADMIN"))
        throw new AppError("Knowledge access denied", 403);
    if (write && await isDemoReadonlyUserId(userId))
        throw new AppError("Demo account cannot change knowledge", 403);
}
export async function lockDocument(tx: Prisma.TransactionClient, orgId: string, documentId: string, allowArchived = false) {
    await tx.$queryRaw `SELECT id FROM "KnowledgeDocument" WHERE id=${documentId} AND "organizationId"=${orgId} FOR UPDATE`;
    const doc = await tx.knowledgeDocument.findFirst({ where: { id: documentId, organizationId: orgId } });
    if (!doc || (!allowArchived && doc.archivedAt))
        throw new AppError("Document not found", 404);
    return doc;
}
export async function knowledgeActivity(tx: Prisma.TransactionClient, orgId: string, actorId: string | null, documentId: string, versionId: string | null, versionNumber: number | null, transition: string) {
    await tx.activityLog.create({ data: { organizationId: orgId, actorId, type: "KNOWLEDGE_VERSION_EVENT", message: transition, metadata: { documentId, versionId, versionNumber, transition } } });
}
export async function createVersionRecord(userId: string, orgId: string, input: SourceUpload, documentId?: string) {
    // Read only the server-created upload path; never accept a client storage path.
    const bytes = await fs.readFile(input.storagePath);
    const sourceHash = contentHash(bytes);
    return prisma.$transaction(async (tx) => {
        await authorizeKnowledge(tx, userId, orgId, true);
        let document = documentId ? await lockDocument(tx, orgId, documentId) : await tx.knowledgeDocument.create({ data: { organizationId: orgId, uploadedById: userId, ...input } });
        const duplicate = await tx.knowledgeDocumentVersion.findFirst({ where: { documentId: document.id, sourceHash }, orderBy: { versionNumber: "desc" } });
        if (duplicate)
            return { document, version: duplicate, duplicate: true };
        const version = await tx.knowledgeDocumentVersion.create({ data: { documentId: document.id, versionNumber: document.nextVersionNumber, originalName: input.originalName, mimeType: input.mimeType, sizeBytes: bytes.length, storageRef: input.storagePath, sourceHash, createdByIdentity: userId } });
        document = await tx.knowledgeDocument.update({ where: { id: document.id }, data: { nextVersionNumber: { increment: 1 } } });
        if (!documentId)
            await knowledgeActivity(tx, orgId, userId, document.id, null, null, "DOCUMENT_CREATED");
        await knowledgeActivity(tx, orgId, userId, document.id, version.id, version.versionNumber, "VERSION_UPLOADED");
        return { document, version, duplicate: false };
    }, { isolationLevel: "ReadCommitted" });
}
export async function publishKnowledgeVersion(userId: string, orgId: string, documentId: string, versionId: string, expectedCurrentVersionId: string | null) {
    return prisma.$transaction(async (tx) => {
        await authorizeKnowledge(tx, userId, orgId, true);
        const doc = await lockDocument(tx, orgId, documentId);
        const target = await tx.knowledgeDocumentVersion.findFirst({ where: { id: versionId, documentId }, include: { _count: { select: { chunks: true } } } });
        if (!target)
            throw new AppError("Version not found", 404);
        if (doc.currentPublishedVersionId === target.id)
            return target;
        if (doc.currentPublishedVersionId !== expectedCurrentVersionId)
            throw new AppError("Publication changed. Refresh version history before publishing.", 409);
        if (target.status !== "READY" || !target.contentHash || target._count.chunks === 0 || target.semanticIndexedChunks === null)
            throw new AppError("Version is not ready for publication", 409);
        if (doc.currentPublishedVersionId) {
            const previous = await tx.knowledgeDocumentVersion.findUniqueOrThrow({ where: { id: doc.currentPublishedVersionId } });
            if (target.versionNumber <= previous.versionNumber)
                throw new AppError("Cannot publish an older version", 409);
            await tx.knowledgeDocumentVersion.update({ where: { id: previous.id }, data: { status: "SUPERSEDED" } });
            await knowledgeActivity(tx, orgId, userId, documentId, previous.id, previous.versionNumber, "VERSION_SUPERSEDED");
        }
        const version = await tx.knowledgeDocumentVersion.update({ where: { id: target.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
        await tx.knowledgeDocument.update({ where: { id: documentId }, data: { currentPublishedVersionId: version.id, status: "READY", errorMessage: null, semanticIndexedChunks: version.semanticIndexedChunks } });
        await knowledgeActivity(tx, orgId, userId, documentId, version.id, version.versionNumber, "VERSION_PUBLISHED");
        return version;
    }, { isolationLevel: "ReadCommitted" });
}
export async function archiveKnowledgeDocument(userId: string, orgId: string, documentId: string) {
    return prisma.$transaction(async (tx) => {
        await authorizeKnowledge(tx, userId, orgId, true);
        const doc = await lockDocument(tx, orgId, documentId, true);
        if (doc.archivedAt)
            return doc;
        const archived = await tx.knowledgeDocument.update({ where: { id: documentId }, data: { archivedAt: new Date() } });
        await knowledgeActivity(tx, orgId, userId, documentId, null, null, "DOCUMENT_ARCHIVED");
        return archived;
    }, { isolationLevel: "ReadCommitted" });
}
export async function getVersionHistory(userId: string, orgId: string, documentId: string) {
    await authorizeKnowledge(prisma, userId, orgId);
    const doc = await prisma.knowledgeDocument.findFirst({ where: { id: documentId, organizationId: orgId }, include: { versions: { orderBy: { versionNumber: "desc" }, select: { id: true, versionNumber: true, status: true, originalName: true, createdAt: true, publishedAt: true, sourceHash: true, contentHash: true, semanticIndexedChunks: true, errorMessage: true, createdByIdentity: true } } } });
    if (!doc)
        throw new AppError("Document not found", 404);
    return doc;
}
