import http from "http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { initRealtimeServer } from "./modules/realtime/realtime.service.js";

const httpServer = http.createServer(app);

initRealtimeServer(httpServer);

httpServer.listen(env.PORT, () => {
  console.log(`API server running on port ${env.PORT}`);
});