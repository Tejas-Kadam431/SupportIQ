import { startKnowledgeProcessingWorker, getKnowledgeQueue } from "./kb.queue.js";
import { dispatchKnowledgeOutbox, cleanupDispatchedOutbox } from "./kb.outbox.js";
import { reconcileKnowledge } from "./kb.reconcile.js";
import { log, counters } from "../../common/operations.js";
/** Shared maintenance loop for the dedicated worker and opt-in single-instance demo. */
export function startKnowledgeRuntime() {
    startKnowledgeProcessingWorker();
    let stopped = false, busy = false, cursor: string | undefined, round = 0;
    let active: Promise<void> = Promise.resolve();
    async function tick() {
        try {
            await dispatchKnowledgeOutbox();
            if (round++ % 15 === 0) {
                cursor = (await reconcileKnowledge(cursor)).cursor;
                await cleanupDispatchedOutbox();
                const counts = await getKnowledgeQueue().getJobCounts("waiting", "active", "failed", "delayed");
                for (const [stage, count] of Object.entries(counts)) log("queue.metrics", { stage, count });
                for (const [stage, count] of Object.entries(counters)) log("worker.metrics", { stage, count });
            }
        } catch { log("worker.maintenance_failed", { category: "DATABASE_ERROR" }); }
    }
    const timer = setInterval(() => {
        if (stopped || busy) return;
        busy = true;
        active = tick().finally(() => { busy = false; });
    }, 2000);
    log("worker.started");
    return async () => { stopped = true; clearInterval(timer); await active; };
}
