import { Queue, Worker, UnrecoverableError } from "bullmq";
import { redisConnection } from "../../config/redis.js";
import { ingestionConfig } from "../../config/ingestion.js";
import { processKnowledgeDocument } from "./kb.processing.js";
import { knowledgeJobId, type DispatchPayload } from "./kb.outbox.js";
import { classify, log } from "../../common/operations.js";
let queue: Queue<DispatchPayload> | null = null;
export function getKnowledgeQueue() { if (!queue) {
    queue = new Queue<DispatchPayload>("knowledge-processing", { connection: { ...redisConnection, maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 3000, commandTimeout: 5000 }, defaultJobOptions: { attempts: ingestionConfig.INGESTION_MAX_ATTEMPTS, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: { age: 86400, count: 1000 }, removeOnFail: { age: 604800, count: 1000 } } });
    queue.on("error", () => log("queue.error", { category: "QUEUE_UNAVAILABLE" }));
} return queue; }
export async function enqueueKnowledgeDocumentProcessing(data: DispatchPayload) { return getKnowledgeQueue().add("process-document", data, { jobId: knowledgeJobId(data.versionId, data.generation) }); }
let worker: Worker<DispatchPayload> | null = null;
export function startKnowledgeProcessingWorker() {
    if (worker)
        return worker;
    worker = new Worker<DispatchPayload>("knowledge-processing", async (job) => {
        if (!job.data.versionId || !job.data.generation)
            throw new UnrecoverableError("Legacy job requires operator requeue");
        try {
            await processKnowledgeDocument(job.data.orgId, job.data.documentId, job.data.versionId, job.data.generation);
        }
        catch (error) {
            const failure = classify(error);
            if (!failure.retryable)
                throw new UnrecoverableError(failure.category);
            throw failure;
        }
    }, { connection: redisConnection, concurrency: 2 });
    worker.on("error", () => log("worker.error", { category: "QUEUE_UNAVAILABLE" }));
    worker.on("failed", job => log("worker.failed", { jobId: job?.id, knowledgeVersionId: job?.data.versionId }));
    return worker;
}
export async function closeKnowledgeProcessingResources(force = false) { if (worker) {
    await worker.close(force);
    worker = null;
} if (queue) {
    await queue.close();
    queue = null;
} }
