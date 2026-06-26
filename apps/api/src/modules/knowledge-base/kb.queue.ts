import { Queue, Worker } from "bullmq";
import { redisConnection } from "../../config/redis.js";
import { processKnowledgeDocument } from "./kb.processing.js";

type ProcessKnowledgeDocumentJob = {
  orgId: string;
  documentId: string;
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
    jobId: `process-document:${data.documentId}:${Date.now()}`
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
      await processKnowledgeDocument(job.data.orgId, job.data.documentId);
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
      error
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