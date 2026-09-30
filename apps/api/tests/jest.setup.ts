afterAll(async () => {
  // Load only at teardown so test-local provider mocks are installed first.
  const { closeKnowledgeProcessingResources } = await import("../src/modules/knowledge-base/kb.queue.js");
  await closeKnowledgeProcessingResources();
});
