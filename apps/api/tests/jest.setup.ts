import { closeKnowledgeProcessingResources } from "../src/modules/knowledge-base/kb.queue.js";

afterAll(async () => {
  await closeKnowledgeProcessingResources();
});