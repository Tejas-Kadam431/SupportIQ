import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/AppError.js";
import { requestProcessing } from "./kb.outbox.js";
import type { SearchKnowledgeQuery } from "./kb.schema.js";
import { retrieveHybrid } from "./kb.hybrid.js";
import { createVersionRecord, authorizeKnowledge, lockDocument, archiveKnowledgeDocument, type SourceUpload } from "./kb.version.service.js";
const summary = { id: true, versionNumber: true, status: true, createdAt: true, publishedAt: true, errorMessage: true, semanticIndexedChunks: true } as const;
const include = { uploadedBy: { select: { id: true, name: true, email: true, avatarUrl: true } }, currentPublishedVersion: { select: summary }, versions: { orderBy: { versionNumber: "desc" as const }, take: 1, select: summary }, _count: { select: { chunks: true } } };
export async function createKnowledgeDocument(userId: string, orgId: string, input: SourceUpload, documentId?: string) {
    const result = await createVersionRecord(userId, orgId, input, documentId);
    return getKnowledgeDocument(orgId, result.document.id);
}
export async function listKnowledgeDocuments(orgId: string) { return prisma.knowledgeDocument.findMany({ where: { organizationId: orgId, archivedAt: null }, include, orderBy: { createdAt: "desc" } }); }
export async function getKnowledgeDocument(orgId: string, documentId: string) {
    const doc = await prisma.knowledgeDocument.findFirst({ where: { id: documentId, organizationId: orgId }, include });
    if (!doc)
        throw new AppError("Document not found", 404);
    return doc;
}
export async function listKnowledgeChunks(orgId: string, documentId: string) { const doc = await getKnowledgeDocument(orgId, documentId); return doc.archivedAt || !doc.currentPublishedVersionId ? [] : prisma.knowledgeChunk.findMany({ where: { organizationId: orgId, documentVersionId: doc.currentPublishedVersionId }, orderBy: { chunkIndex: "asc" } }); }
export async function searchKnowledgeBase(orgId: string, query: SearchKnowledgeQuery) { const limit = Number(query.limit); return retrieveHybrid(orgId, query.q, Number.isInteger(limit) && limit > 0 ? Math.min(limit, 5) : 5); }
export async function reprocessKnowledgeDocument(orgId: string, documentId: string, userId: string, versionId?: string) {
    const target = await prisma.$transaction(async (tx) => {
        await authorizeKnowledge(tx, userId, orgId, true);
        await lockDocument(tx, orgId, documentId);
        const target = await tx.knowledgeDocumentVersion.findFirst({ where: { documentId, ...(versionId ? { id: versionId } : {}) }, orderBy: { versionNumber: "desc" } });
        if (!target)
            throw new AppError("Version not found", 404);
        if (["READY", "PUBLISHED", "SUPERSEDED"].includes(target.status))
            throw new AppError("Upload a new version to change prepared or published knowledge", 409);
        if (target.leaseUntil && target.leaseUntil > new Date())
            throw new AppError("Version is already processing", 409);
        await requestProcessing(tx, target.id);
        return target;
    });
    return getKnowledgeDocument(orgId, documentId);
}
export async function deleteKnowledgeDocument(orgId: string, documentId: string, userId: string) { return archiveKnowledgeDocument(userId, orgId, documentId); }
