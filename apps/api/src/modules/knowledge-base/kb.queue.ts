import { Queue, Worker } from "bullmq";
import { redisConnection } from "../../config/redis.js";
import { processKnowledgeDocument } from "./kb.processing.js";

type ProcessKnowledgeDocumentJob = {
  orgId: string;
  documentId: string;
  versionId: string;
  requestedById: string;
};

export const knowledgeProcessingQueue =
  new Queue<ProcessKnowledgeDocumentJob>("knowledge-processing", {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000
      },
      removeOnComplete: {
        age: 60 * 60,
        count: 1000
      },
      removeOnFail: {
        age: 24 * 60 * 60,
        count: 1000
      }
    }
  });

export async function enqueueKnowledgeDocumentProcessing(
  data: ProcessKnowledgeDocumentJob
) {
  return knowledgeProcessingQueue.add("process-document", data, {
    jobId: `process-version-${data.versionId}-${Date.now()}`
  });
}

let worker: Worker<ProcessKnowledgeDocumentJob> | null = null;

export function startKnowledgeProcessingWorker() {
  if (worker) {
    return worker;
  }

  worker = new Worker<ProcessKnowledgeDocumentJob>(
    "knowledge-processing",
    async (job) => {
      if (!job.data.versionId) throw new Error("Legacy job requires explicit version requeue");
      await processKnowledgeDocument(job.data.orgId, job.data.documentId, job.data.versionId);
    },
    {
      connection: redisConnection,
      concurrency: 2
    }
  );

  worker.on("completed", (job) => {
    console.log(`Knowledge document processed: ${job.data.documentId}`);
  });

  worker.on("failed", (job, error) => {
    console.error(
      `Knowledge document processing failed: ${job?.data.documentId}`,
      { event: "knowledge.worker_failed" }
    );
  });

  return worker;
}
export async function closeKnowledgeProcessingResources() {
  if (worker) {
    await worker.close();
    worker = null;
  }

  await knowledgeProcessingQueue.close();
}