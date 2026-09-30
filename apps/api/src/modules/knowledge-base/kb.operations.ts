import { prisma } from "../../config/prisma.js";
export async function knowledgeOperations(orgId: string) {
    const scope = { version: { document: { organizationId: orgId } } };
    const [states, attempts, outbox, retries, staleRecoveries, failed, successful] = await Promise.all([
        prisma.knowledgeIngestion.groupBy({ by: ["stage"], where: scope, _count: true }),
        prisma.knowledgeIngestionAttempt.aggregate({ where: { ingestion: scope }, _count: true, _avg: { durationMs: true } }),
        prisma.knowledgeOutbox.count({ where: { ingestion: scope, dispatchedAt: null } }),
        prisma.knowledgeIngestionAttempt.count({ where: { ingestion: scope, attempt: { gt: 1 } } }),
        prisma.knowledgeIngestionAttempt.count({ where: { ingestion: scope, errorCategory: "PROCESSING_STALE" } }),
        prisma.knowledgeIngestionAttempt.count({ where: { ingestion: scope, stage: "FAILED" } }),
        prisma.knowledgeIngestionAttempt.count({ where: { ingestion: scope, stage: "READY" } })
    ]);
    return { states, retries, staleRecoveries, failed, successful, attempts: attempts._count, meanProcessingMs: attempts._avg.durationMs, pendingOutbox: outbox };
}
