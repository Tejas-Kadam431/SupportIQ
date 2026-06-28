import http from "http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { initRealtimeServer } from "./modules/realtime/realtime.service.js";
import { startKnowledgeProcessingWorker } from "./modules/knowledge-base/kb.queue.js";
import { ensureUploadDirectories } from "./config/uploads.js";

const httpServer = http.createServer(app);
ensureUploadDirectories();
initRealtimeServer(httpServer);
startKnowledgeProcessingWorker();

httpServer.listen(env.PORT, () => {
  console.log(`API server running on port ${env.PORT}`);
});