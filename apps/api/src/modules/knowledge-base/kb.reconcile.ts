import { prisma } from "../../config/prisma.js";
import { lockDocument } from "./kb.version.service.js";
import { requestProcessing } from "./kb.outbox.js";
import { getObjectStorage } from "../../common/storage.js";
import { ingestionConfig } from "../../config/ingestion.js";
import { log, metric } from "../../common/operations.js";
// Fixed-size pages and cursors keep old rows from starving later versions.
export async function reconcileKnowledge(cursor?: string) {
    const versions = await prisma.knowledgeDocumentVersion.findMany({ take: 50, orderBy: { id: "asc" }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), include: { document: true, ingestion: true, sourceObject: true, _count: { select: { chunks: true } } } });
    const findings: Array<{
        versionId: string;
        category: string;
        repaired: boolean;
    }> = [];
    for (const version of versions) {
        const record = version.ingestion;
        try {
            if (version.sourceObject) {
                if (version.sourceObject.backend !== ingestionConfig.KNOWLEDGE_STORAGE || !await getObjectStorage().exists(version.sourceObject.objectKey))
                    findings.push({ versionId: version.id, category: "SOURCE_MISSING", repaired: false });
            }
            else
                findings.push({ versionId: version.id, category: "LEGACY_SOURCE_IMPORT_REQUIRED", repaired: false });
            if (["READY", "PUBLISHED", "SUPERSEDED"].includes(version.status)) {
                if (!version._count.chunks || !version.contentHash || version.semanticIndexedChunks === null || version.semanticIndexedChunks > version._count.chunks)
                    findings.push({ versionId: version.id, category: "INDEX_INCOMPLETE", repaired: false });
                continue;
            }
            if (version.document.archivedAt || record?.retryable === false)
                continue;
            await prisma.$transaction(async (tx) => {
                await lockDocument(tx, version.document.organizationId, version.documentId, true);
                const live = await tx.knowledgeDocumentVersion.findUniqueOrThrow({ where: { id: version.id }, include: { ingestion: true } });
                if (["READY", "PUBLISHED", "SUPERSEDED"].includes(live.status))
                    return;
                if (live.leaseUntil && live.leaseUntil > new Date())
                    return;
                const state = live.ingestion;
                if (state && !state.retryable)
                    return;
                const pending = state ? await tx.knowledgeOutbox.findUnique({ where: { versionId_generation: { versionId: live.id, generation: state.generation } } }) : null;
                const stale = live.status === "PROCESSING";
                // Give Redis retries/backoff at least ten minutes before regenerating a stranded intent.
                const stranded = (live.status === "UPLOADED" || live.status === "FAILED") && (!state || (!pending) || ((pending.dispatchedAt?.getTime() ?? Infinity) < Date.now() - 600000 && state.updatedAt.getTime() < Date.now() - 600000));
                if (!stale && !stranded)
                    return;
                if (((state?.attempts ?? 0) >= ingestionConfig.INGESTION_MAX_ATTEMPTS || (state?.generation ?? 0) >= ingestionConfig.INGESTION_MAX_ATTEMPTS)) {
                    await tx.knowledgeDocumentVersion.update({ where: { id: live.id }, data: { status: "FAILED", processingToken: null, leaseUntil: null, errorMessage: "PROCESSING_STALE" } });
                    await tx.knowledgeIngestion.update({ where: { versionId: live.id }, data: { stage: "FAILED", errorCategory: "PROCESSING_STALE", completedAt: new Date() } });
                    return;
                }
                await tx.knowledgeIngestionAttempt.updateMany({ where: { versionId: live.id, completedAt: null }, data: { stage: "FAILED", errorCategory: "PROCESSING_STALE", completedAt: new Date() } });
                await requestProcessing(tx, live.id, true);
                findings.push({ versionId: live.id, category: stale ? "PROCESSING_STALE" : "MISSING_HANDOFF", repaired: true });
                if (stale)
                    metric("stale_recovery");
            });
        }
        catch {
            log("reconcile.failed", { knowledgeVersionId: version.id, category: "DATABASE_ERROR" });
        }
    }
    for (const f of findings)
        log("reconcile.finding", { knowledgeVersionId: f.versionId, category: f.category });
    return { findings, ...(versions.length === 50 ? { cursor: versions.at(-1)!.id } : {}) };
}
export async function inspectOrphanObjects(cursor?: string) {
    const page = await getObjectStorage().list(cursor), keys = page.objects.map(o => o.key);
    const owned = await prisma.knowledgeSourceObject.findMany({ where: { objectKey: { in: keys } }, select: { objectKey: true } }), referenced = new Set(owned.map(o => o.objectKey));
    // Report only. An upload/commit may still be in flight; this never deletes data.
    return { candidates: page.objects.filter(o => !referenced.has(o.key) && o.modified.getTime() < Date.now() - 86400000), cursor: page.cursor };
}
export async function auditSourceObjects(cursor?: string) {
    const { contentHash } = await import("../../common/utils/contentHash.js");
    const versions = await prisma.knowledgeDocumentVersion.findMany({ take: 10, orderBy: { id: "asc" }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), include: { sourceObject: true } });
    const findings = [];
    for (const v of versions) {
        try {
            if (!v.sourceObject || v.sourceObject.backend !== ingestionConfig.KNOWLEDGE_STORAGE) {
                findings.push({ versionId: v.id, category: "SOURCE_IMPORT_REQUIRED" });
                continue;
            }
            const bytes = await getObjectStorage().get(v.sourceObject.objectKey);
            if (contentHash(bytes) !== v.sourceHash)
                findings.push({ versionId: v.id, category: "SOURCE_CHANGED" });
        }
        catch {
            findings.push({ versionId: v.id, category: "SOURCE_UNAVAILABLE" });
        }
    }
    return { findings, ...(versions.length === 10 ? { cursor: versions.at(-1)!.id } : {}) };
}
