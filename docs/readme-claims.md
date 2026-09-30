# README claim evidence

Implementation paths are relative to apps/api/src. Test filenames are under src/__tests__. These are evidence pointers, not claims of compliance or universal accuracy.

| Claim area | Implementation | Evidence |
|---|---|---|
| Auth | Opaque refresh-session families, cookie transport and signed short-lived access JWTs; modules/auth and common/utils/jwt.ts. | auth.session.test.ts, jwt.test.ts, stage-c.integration.test.ts. |
| Tenant/RBAC | Current membership queries; organization locks before critical writes; organizations/org.transaction.ts. | rbac.integration.test.ts; stage-c.integration.test.ts. |
| Tickets | ticket.policy.ts and transactional ticket/message services with locks and conditional updates. | ticket.policy.test.ts, ticket.service.test.ts, stage-c.integration.test.ts. |
| Realtime | realtime.authorization.ts and realtime.service.ts recheck current access before protected delivery and enforce expiry. | realtime.authorization.test.ts and realtime.socket.test.ts. |
| Knowledge ingestion | kb.validation.ts, kb.text.ts, kb.processing.ts validate, parse, chunk and prepare versions. | ingestion.unit.test.ts; stage-i.integration.test.ts. |
| Knowledge versioning | kb.version.service.ts plus immutable database guards, document locks and expected publication pointer. | knowledge.migration.integration.test.ts; stage-f.integration.test.ts. |
| Hybrid retrieval | kb.hybrid.ts merges lexical and vector ranked candidates; kb.scope.ts constrains published/evaluation versions. | retrieval.health.test.ts; stage-e.integration.test.ts. |
| Evidence policy | ai/evidence-policy.ts determines support, insufficiency, conflicts and degraded retrieval before generation. | evidence.policy.test.ts; ai.gating.test.ts. |
| Copilot | ai.service.ts, ai.core.ts, ai.provenance.ts capture input/evidence/configuration and call bounded providers. | ai.provider.test.ts, ai.provenance.test.ts; stage-d/e integration. |
| Feedback | ai.decision.ts atomically persists terminal decision and public message; classifies unchanged vs edited text. | stage-d.integration.test.ts; browser edited-send workflow. |
| Knowledge Issues | knowledge-issues/issue.service.ts derives qualifying signals, grouping and attributed sources. | knowledge-issues.test.ts; stage-g.integration.test.ts. |
| Source Health | knowledge-issues/quality.service.ts aggregates relational source attribution with explicit denominators. | stage-g.integration.test.ts; tooling/benchmarks/performance.mjs. |
| Reliability Lab | reliability/replay.service.ts snapshots/pins; replay.execution.ts runs bounded cases; replay.comparison.ts classifies. | reliability.test.ts; stage-h.integration.test.ts; browser verification flow. |
| Outbox/worker | kb.outbox.ts uses durable rows and SKIP LOCKED claims; worker.ts consumes generation-specific jobs; kb.reconcile.ts repairs interruptions. | stage-i.integration.test.ts; stage-i-services.integration.test.ts. |
| Storage | common/storage.ts abstracts filesystem and S3-compatible storage; keys are server-generated. | ingestion.unit.test.ts; stage-i-services.integration.test.ts. |
| Observability | common/operations.ts emits allowlisted structured events/request IDs; health routes and shutdown helpers bound failures. | ingestion.unit.test.ts; stage-i services tests. |
