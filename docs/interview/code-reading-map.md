# Ordered code-reading map

Paths under modules/common/config are relative to apps/api/src. Test names refer to apps/api/src/__tests__. Read each implementation beside the named test, then explain one failure path aloud.

| Order / concept | Important files and functions | Tests / exercise |
|---|---|---|
| 1. Request/runtime | server.ts, app.ts, worker.ts, config/env.ts, common/operations.ts | ingestion.unit.test.ts; trace request ID through an error |
| 2. Authentication | modules/auth/auth.service.ts; common/utils/jwt.ts | auth.session.test.ts, jwt.test.ts, stage-c.integration.test.ts; explain committed reuse revocation |
| 3. Tenant/RBAC | organizations/org.transaction.ts, common/middleware | rbac.integration.test.ts; remove a member during a mutation |
| 4. Ticket lifecycle | tickets/ticket.policy.ts, ticket.service.ts; messages/message.service.ts | ticket.policy.test.ts, ticket.service.test.ts; race two first responses |
| 5. Realtime | realtime/realtime.authorization.ts, realtime.service.ts | realtime.authorization.test.ts, realtime.socket.test.ts; revoke access after join |
| 6. Upload/storage | knowledge-base/kb.upload.ts, kb.validation.ts, common/storage.ts | ingestion.unit.test.ts, stage-i-services.integration.test.ts; trace rejected/spoofed input |
| 7. Version/async processing | kb.version.service.ts, kb.outbox.ts, kb.processing.ts, kb.reconcile.ts, worker.ts | stage-f.integration.test.ts, stage-i.integration.test.ts; fence a stale processing token |
| 8. Retrieval | kb.hybrid.ts retrieveHybrid/retrieveScoped; kb.lexical.ts; kb.vector.ts | retrieval.health.test.ts, stage-e.integration.test.ts; distinguish degraded from empty |
| 9. Evidence/generation | ai/evidence-policy.ts, ai.core.ts, ai.provenance.ts | evidence.policy.test.ts, ai.gating.test.ts, ai.provider.test.ts; explain one abstention |
| 10. Human decision | ai/ai.decision.ts, ai.service.ts | stage-d.integration.test.ts; retry identical send vs conflicting decision |
| 11. Knowledge intelligence | knowledge-issues/issue.service.ts, quality.service.ts | knowledge-issues.test.ts, stage-g.integration.test.ts; explain attribution denominator |
| 12. Replay/verification | reliability/replay.service.ts, replay.execution.ts, replay.comparison.ts | reliability.test.ts, stage-h.integration.test.ts; why a changed cohort invalidates verification |
| 13. Client flow | apps/client/src/app/api.ts; features/tickets, knowledge-base, ai-quality | client component tests; e2e/critical-flows.spec.ts; inspect loading/error/role states |
| 14. Release operations | prisma/migrations; .github/workflows/ci.yml; docker-compose.test.yml | migrate a fresh DB; inspect upgrade evidence; follow deployment.md without deploying |

Some directories contain focused helper files beyond this map. Use symbol search rather than assuming every decision lives in the service facade. Begin with the current code and repository-reconciliation.md, never the superseded initial audit.
