import { startKnowledgeRuntime } from "./modules/knowledge-base/kb.runtime.js";
import http from "node:http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { initRealtimeServer, getRealtimeServer } from "./modules/realtime/realtime.service.js";
import { closeKnowledgeProcessingResources } from "./modules/knowledge-base/kb.queue.js";
import { installShutdown } from "./common/shutdown.js";
import { log } from "./common/operations.js";
const httpServer = http.createServer(app);
initRealtimeServer(httpServer);
const stopMaintenance = env.SUPPORTIQ_EMBEDDED_WORKER === "true" ? startKnowledgeRuntime() : undefined;
installShutdown(async () => {
    const closed = new Promise<void>((resolve, reject) => httpServer.close(error => error ? reject(error) : resolve()));
    const io = getRealtimeServer();
    if (io)
        await new Promise<void>(resolve => io.close(() => resolve()));
    await closed;
    await stopMaintenance?.();
    await closeKnowledgeProcessingResources();
    await prisma.$disconnect();
});
httpServer.listen(env.PORT, () => log("api.started"));
