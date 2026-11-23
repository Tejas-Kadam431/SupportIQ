import { prisma } from "./config/prisma.js";
import { closeKnowledgeProcessingResources } from "./modules/knowledge-base/kb.queue.js";
import { startKnowledgeRuntime } from "./modules/knowledge-base/kb.runtime.js";
import { installShutdown } from "./common/shutdown.js";
const stopMaintenance = startKnowledgeRuntime();
installShutdown(async () => { await stopMaintenance(); await closeKnowledgeProcessingResources(); await prisma.$disconnect(); });
