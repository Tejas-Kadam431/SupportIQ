import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/AppError.js";
import { log, requestId } from "../../common/operations.js";
export function knowledgeJobId(versionId: string, generation = 1) { if (!/^[a-zA-Z0-9-]+$/.test(versionId) || !Number.isSafeInteger(generation) || generation < 1)
    throw new Error("Invalid job identity"); return "knowledge-version-" + versionId + "-g" + generation; }
// Caller holds the document lock, using the same lock order as publication/processing.
export async function requestProcessing(tx: Prisma.TransactionClient, versionId: string, recovery = false) {
    const current = await tx.knowledgeIngestion.findUnique({ where: { versionId } });
    if (current?.stage === "QUEUED" && !recovery)
        return current;
    if (current && !current.retryable)
        throw new AppError("Upload corrected content as a new version", 409);
    const generation = (current?.generation ?? 0) + 1, correlation = current?.requestId ?? requestId(undefined);
    const record = await tx.knowledgeIngestion.upsert({ where: { versionId }, create: { versionId, generation, requestId: correlation }, update: { generation, stage: "QUEUED", errorCategory: null, retryable: true, completedAt: null, heartbeatAt: null, lexicalReady: false, semanticReady: false } });
    await tx.knowledgeDocumentVersion.update({ where: { id: versionId }, data: { status: "UPLOADED", processingToken: null, leaseUntil: null, errorMessage: null } });
    await tx.knowledgeOutbox.create({ data: { versionId, generation, requestId: correlation, availableAt: new Date(), createdAt: new Date() } });
    return record;
}
export type DispatchPayload = {
    orgId: string;
    documentId: string;
    versionId: string;
    generation: number;
    requestId: string;
    outboxEventId: string;
};
export async function dispatchKnowledgeOutbox(enqueue?: (data: DispatchPayload) => Promise<unknown>, limit = 20) {
    const send = enqueue ?? (await import("./kb.queue.js")).enqueueKnowledgeDocumentProcessing;
    let dispatched = 0;
    for (let n = 0; n < Math.min(limit, 100); n++) {
        const token = randomUUID();
        const rows = await prisma.$queryRaw<Array<{
            id: string;
            versionId: string;
            generation: number;
            requestId: string;
            attempts: number;
        }>> `
   UPDATE "KnowledgeOutbox" SET "claimToken"=${token},"claimUntil"=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')+interval '30 seconds',attempts=attempts+1
   WHERE id=(SELECT id FROM "KnowledgeOutbox" WHERE "dispatchedAt" IS NULL AND "availableAt"<=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AND ("claimUntil" IS NULL OR "claimUntil"<(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')) AND attempts<20 ORDER BY "availableAt",id FOR UPDATE SKIP LOCKED LIMIT 1)
   RETURNING id,"versionId",generation,"requestId",attempts`;
        const event = rows[0];
        if (!event)
            break;
        try {
            const version = await prisma.knowledgeDocumentVersion.findUniqueOrThrow({ where: { id: event.versionId }, include: { document: true } });
            await send({ orgId: version.document.organizationId, documentId: version.documentId, versionId: event.versionId, generation: event.generation, requestId: event.requestId, outboxEventId: event.id });
            await prisma.knowledgeOutbox.updateMany({ where: { id: event.id, claimToken: token }, data: { dispatchedAt: new Date(), claimToken: null, claimUntil: null, errorCategory: null } });
            dispatched++;
        }
        catch {
            await prisma.knowledgeOutbox.updateMany({ where: { id: event.id, claimToken: token }, data: { claimToken: null, claimUntil: null, errorCategory: "OUTBOX_DISPATCH_FAILED", availableAt: new Date(Date.now() + Math.min(300000, 2000 * 2 ** Math.min(event.attempts, 8))) } });
            if (event.attempts >= 20)
                await prisma.$transaction(async (tx) => {
                    const version = await tx.knowledgeDocumentVersion.findUniqueOrThrow({ where: { id: event.versionId } });
                    await tx.$queryRaw `SELECT id FROM "KnowledgeDocument" WHERE id=${version.documentId} FOR UPDATE`;
                    const current = await tx.knowledgeIngestion.findUniqueOrThrow({ where: { versionId: event.versionId } });
                    if (current.generation === event.generation && current.stage === "QUEUED") {
                        const changed = await tx.knowledgeDocumentVersion.updateMany({ where: { id: event.versionId, status: "UPLOADED" }, data: { status: "FAILED", errorMessage: "QUEUE_UNAVAILABLE" } });
                        if (changed.count)
                            await tx.knowledgeIngestion.update({ where: { versionId: event.versionId }, data: { stage: "FAILED", errorCategory: "QUEUE_UNAVAILABLE", retryable: true, completedAt: new Date() } });
                    }
                });
            log("outbox.dispatch_failed", { outboxEventId: event.id, knowledgeVersionId: event.versionId, requestId: event.requestId, category: "QUEUE_UNAVAILABLE" });
        }
    }
    return { dispatched };
}
export async function cleanupDispatchedOutbox() { const rows = await prisma.knowledgeOutbox.findMany({ take: 100, where: { dispatchedAt: { lt: new Date(Date.now() - 30 * 86400000) }, ingestion: { stage: { in: ["READY", "FAILED"] } } }, select: { id: true } }); return prisma.knowledgeOutbox.deleteMany({ where: { id: { in: rows.map(r => r.id) }, dispatchedAt: { not: null } } }); }
