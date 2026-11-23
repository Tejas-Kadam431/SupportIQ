import { startKnowledgeRuntime } from "../modules/knowledge-base/kb.runtime.js";
import { startKnowledgeProcessingWorker, getKnowledgeQueue } from "../modules/knowledge-base/kb.queue.js";
import { dispatchKnowledgeOutbox, cleanupDispatchedOutbox } from "../modules/knowledge-base/kb.outbox.js";
import { reconcileKnowledge } from "../modules/knowledge-base/kb.reconcile.js";
import { log } from "../common/operations.js";
jest.mock("../modules/knowledge-base/kb.queue.js",()=>({startKnowledgeProcessingWorker:jest.fn(),getKnowledgeQueue:jest.fn()}));
jest.mock("../modules/knowledge-base/kb.outbox.js",()=>({dispatchKnowledgeOutbox:jest.fn(),cleanupDispatchedOutbox:jest.fn()}));
jest.mock("../modules/knowledge-base/kb.reconcile.js",()=>({reconcileKnowledge:jest.fn()}));
jest.mock("../common/operations.js",()=>({log:jest.fn(),counters:{}}));
beforeEach(()=>{jest.useFakeTimers();jest.resetAllMocks();(dispatchKnowledgeOutbox as jest.Mock).mockResolvedValue(undefined);(reconcileKnowledge as jest.Mock).mockResolvedValue({cursor:undefined});(getKnowledgeQueue as jest.Mock).mockReturnValue({getJobCounts:jest.fn().mockResolvedValue({waiting:0})});});
afterEach(()=>jest.useRealTimers());
test("maintenance cannot overlap, shutdown waits for in-flight work and prevents future dispatch",async()=>{
    let release!:()=>void;(dispatchKnowledgeOutbox as jest.Mock).mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve;}));
    const stop=startKnowledgeRuntime();expect(startKnowledgeProcessingWorker).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(6000);expect(dispatchKnowledgeOutbox).toHaveBeenCalledTimes(1);
    let closed=false;const closing=stop().then(()=>{closed=true;});await Promise.resolve();expect(closed).toBe(false);
    release();await closing;expect(cleanupDispatchedOutbox).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(10000);expect(dispatchKnowledgeOutbox).toHaveBeenCalledTimes(1);
});
test("a maintenance DB failure is sanitized and a later tick can recover",async()=>{
    (dispatchKnowledgeOutbox as jest.Mock).mockRejectedValueOnce(new Error("secret database details"));
    const stop=startKnowledgeRuntime();await jest.advanceTimersByTimeAsync(4000);
    expect(dispatchKnowledgeOutbox).toHaveBeenCalledTimes(2);expect(log).toHaveBeenCalledWith("worker.maintenance_failed",{category:"DATABASE_ERROR"});await stop();
});
