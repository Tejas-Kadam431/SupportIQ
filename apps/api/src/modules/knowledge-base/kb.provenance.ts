import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/AppError.js";
import { authorizeKnowledge } from "./kb.version.service.js";
export async function resolveCopilotKnowledge(userId: string, orgId: string, runId: string) {
    await authorizeKnowledge(prisma, userId, orgId);
    const run = await prisma.copilotRun.findFirst({ where: { id: runId, organizationId: orgId }, select: { id: true, sources: true, retrievalVersion: true, knowledgeSources: { include: { version: { select: { id: true, versionNumber: true, publishedAt: true, contentHash: true, sourceHash: true, originalName: true, chunks: { select: { contentHash: true } }, document: { select: { id: true, archivedAt: true, currentPublishedVersion: { select: { id: true, versionNumber: true, contentHash: true, sourceHash: true, chunks: { select: { contentHash: true } } } } } } } } } } } });
    if (!run)
        throw new AppError("Copilot run not found", 404);
    return { runId: run.id, snapshots: run.sources, sources: run.knowledgeSources.map(link => {
            const historical = link.version, current = historical.document.currentPublishedVersion;
            const oldHashes = new Set(historical.chunks.map(c => c.contentHash)), newHashes = new Set(current?.chunks.map(c => c.contentHash) ?? []);
            return { documentId: historical.document.id, documentTitle: historical.originalName, documentVersionId: historical.id, versionNumber: historical.versionNumber, publishedAt: historical.publishedAt, chunkId: link.chunkId,
                archived: !!historical.document.archivedAt, currentVersionId: current?.id ?? null, currentVersionNumber: current?.versionNumber ?? null, isCurrent: !historical.document.archivedAt && current?.id === historical.id,
                contentChanged: current ? current.contentHash !== historical.contentHash : null, sourceChanged: current?.sourceHash && historical.sourceHash ? current.sourceHash !== historical.sourceHash : null,
                distinctChunkHashesAdded: [...newHashes].filter(h => !oldHashes.has(h)).length, distinctChunkHashesRemoved: [...oldHashes].filter(h => !newHashes.has(h)).length };
        }), legacyVersionUnknown: run.retrievalVersion !== "hybrid-rrf-published-v2" && run.knowledgeSources.length === 0 };
}
