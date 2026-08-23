import { closeKnowledgeProcessingResources } from "../modules/knowledge-base/kb.queue.js";

afterAll(async () => {
  await closeKnowledgeProcessingResources();
});