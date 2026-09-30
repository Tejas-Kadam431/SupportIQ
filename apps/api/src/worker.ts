import { prisma } from "./config/prisma.js";
import { startKnowledgeProcessingWorker, closeKnowledgeProcessingResources, getKnowledgeQueue } from "./modules/knowledge-base/kb.queue.js";
import { dispatchKnowledgeOutbox, cleanupDispatchedOutbox } from "./modules/knowledge-base/kb.outbox.js";
import { reconcileKnowledge } from "./modules/knowledge-base/kb.reconcile.js";
import { installShutdown } from "./common/shutdown.js";
import { log, counters } from "./common/operations.js";
startKnowledgeProcessingWorker();
let stopping = false, cursor: string | undefined, round = 0;
async function tick() { try {
    await dispatchKnowledgeOutbox();
    if (round++ % 15 === 0) {
        cursor = (await reconcileKnowledge(cursor)).cursor;
        await cleanupDispatchedOutbox();
        const counts = await getKnowledgeQueue().getJobCounts("waiting", "active", "failed", "delayed");
        for (const [stage, count] of Object.entries(counts))
            log("queue.metrics", { stage, count });
        for (const [stage, count] of Object.entries(counters))
            log("worker.metrics", { stage, count });
    }
}
catch {
    log("worker.maintenance_failed", { category: "DATABASE_ERROR" });
} }
let active: Promise<void> = Promise.resolve();
const timer = setInterval(() => { if (!stopping) {
    stopping = true;
    active = tick().finally(() => { stopping = false; });
} }, 2000);
installShutdown(async () => { clearInterval(timer); await active; await closeKnowledgeProcessingResources(); await prisma.$disconnect(); });
log("worker.started");
