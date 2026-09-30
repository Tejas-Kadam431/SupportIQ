# Implementation question bank

Talking points are prompts for code reading, not memorized claims. Module paths are under apps/api/src; tests are under src/__tests__.

## Product/problem

Reference: docs/demo.md; docs/ai-evaluation.md.

1. **Why is this more than a support chatbot?** Trace decision → attributed signal → immutable fix → historical verification.

2. **What does VERIFIED mean, and what does it not prove?** Captured failures and guardrails under pinned configuration; no universal future guarantee.

3. **Which demo numbers are measured outcomes?** Seeded 6/6 and 10/10 are illustrative; distinguish local benchmarks and actual test runs.

## Frontend

Reference: apps/client/src/app/api.ts; features/tickets; e2e/critical-flows.spec.ts.

4. **How does RTK Query keep ticket views current?** Query keys, tag invalidation and realtime refresh; inspect the actual subscriptions.

5. **How are customers kept out of staff controls?** Server capabilities plus role-gated rendering; UI is not authorization.

6. **What can go wrong with hard navigation during refresh?** An aborted rotating-cookie response may lose the successor; browser tests wait for completed initialization.

## Node/Express

Reference: apps/api/src/app.ts; server.ts; worker.ts.

7. **Why separate API and worker entrypoints?** Request lifecycle versus queue/dispatch/reconciliation lifecycle; prevent duplicate worker startup.

8. **Which work must stay outside a transaction?** Socket/network delivery and slow provider/object operations where possible; explain durable intent and recovery.

## Authentication

Reference: modules/auth/auth.service.ts; common/utils/jwt.ts; auth.session.test.ts.

9. **How is a refresh token stored and transported?** Opaque secret, database hash, HTTP-only cookie; no JSON return.

10. **What happens when two requests reuse one refresh token?** Row lock, one successor, committed reuse revocation of family.

11. **Does logout instantly invalidate every access JWT?** Explain short-lived JWT lifetime and actual server checks; do not claim access-token revocation not implemented.

## RBAC

Reference: organizations/org.transaction.ts; rbac.integration.test.ts.

12. **Why re-read membership inside the write transaction?** Avoid using authorization captured before removal/demotion.

13. **When does demotion preserve ticket access?** An authorized customer still owns their ticket; role change is not automatic total revocation.

## Multi-tenancy

Reference: ticket.service.ts; kb.scope.ts; stage-c/f/g/h.integration.test.ts.

14. **Where must organizationId appear in queries?** Direct filters or verified parent relationship; never trust a URL identifier alone.

15. **How do you test cross-tenant identifiers?** Authenticate a real member elsewhere, reuse valid foreign IDs, assert denial and unchanged state.

16. **How is historical source access protected?** Version/run provenance resolution still checks present tenant authorization.

## PostgreSQL

Reference: apps/api/prisma/schema.prisma; prisma/migrations.

17. **Which invariants are enforced by the database?** FK/unique constraints, immutable-version guards, processing/publication checks; cite actual migrations.

18. **Why inspect query plans instead of adding a cache?** Distinguish scan, join, aggregate and hydration costs; use representative cardinality.

19. **What is the supported upgrade path?** Ordered migrate deploy from baseline; preserve historical row checksums and verify fresh migration separately.

## Prisma

Reference: config/prisma.ts; quality.service.ts; ticket.service.ts.

20. **When is raw SQL justified?** Lock clauses, specialized aggregate/FTS/vector queries; retain parameter binding.

21. **What is the cost of an unbounded include?** Hydration and memory grow with history; bound selected relations and page explicitly.

## Transactions

Reference: messages/message.service.ts; ai/ai.decision.ts.

22. **What commits together when sending a Copilot reply?** Public message, activity, first response and terminal evaluation as implemented.

23. **Why must realtime failure not undo a message?** Durable write is primary; notification follows commit and fails safely.

24. **What does READ COMMITTED not guarantee?** Each statement sees committed state; locks/CAS protect chosen invariants, not arbitrary serializability.

## Locking/concurrency

Reference: docs/concurrency.md; ticket.service.test.ts.

25. **What lock order is used for membership-sensitive writes?** Organization before domain rows; consistent ordering limits deadlocks.

26. **How is first response safe under concurrent replies?** Conditional update in the message transaction; only eligible staff replies.

27. **How does publication detect a stale editor?** Document lock and expected current-version pointer, returning conflict.

## Redis/BullMQ

Reference: kb.queue.ts; kb.outbox.ts; stage-i-services.integration.test.ts.

28. **Why does Redis success not replace an outbox?** Database commit and queue publish cannot be atomic without a protocol.

29. **Is processing exactly once?** No; delivery repeats, effects are guarded by generation/lease/token checks.

30. **What recovers after Redis is unavailable?** Durable pending outbox, bounded backoff, terminal category/manual retry and reconciliation.

## Object storage

Reference: common/storage.ts; kb.version.service.ts.

31. **Why are keys generated on the server?** Avoid user-controlled paths and tenant-object guessing becoming access authority.

32. **What if object upload succeeds but the DB write fails?** Orphan handling/audit; no distributed transaction claim.

33. **Why must API and worker share storage configuration?** Both must resolve the same durable private object namespace.

## Socket.IO

Reference: realtime.service.ts; realtime.authorization.ts; realtime.socket.test.ts.

34. **Why is join authorization insufficient?** Membership, ownership and token lifetime can change after joining.

35. **What happens on authorization lookup failure?** Fail closed for protected delivery; sanitize logs; preserve persisted message.

36. **What changes with multiple API instances?** Shared adapter for room/event transport; permission helper remains unchanged.

## RAG

Reference: ai.core.ts; ai.provenance.ts; kb.hybrid.ts.

37. **Which content is allowed into the prompt?** Bounded public conversation and authorized knowledge; internal notes are excluded.

38. **How do you reproduce an earlier run?** Captured input/evidence/configuration; provider nondeterminism still limits exact text replay.

## FTS/pgvector

Reference: kb.lexical.ts; kb.vector.ts; retrieval.health.test.ts.

39. **When can lexical retrieval outperform vector retrieval?** Exact product names, identifiers and policy terminology.

40. **How is empty retrieval different from degraded retrieval?** No matches versus a failed/unavailable channel; inspect diagnostics and gating behavior.

41. **Why constrain publication scope before ranking?** Prevent unpublished, archived or cross-tenant evidence from entering eligible results.

## RRF

Reference: kb.hybrid.ts; ADR-003.

42. **Why combine ranks rather than raw scores?** Different scoring units and calibration; rank contributions are comparable.

43. **What are RRF limitations?** Ignores raw-score magnitude; rank constant/candidate bounds affect results; requires evaluation.

## Evidence policy

Reference: ai/evidence-policy.ts; evidence.policy.test.ts.

44. **Why not use model confidence as a probability?** Self-reported confidence is not calibrated evidence quality.

45. **How do conflicts and missing information affect generation?** Trace actual deterministic branches and explain conservative false abstentions.

46. **Can this eliminate prompt injection?** No; scoped evidence, bounded prompts and human send reduce impact, not a formal guarantee.

## Copilot feedback

Reference: ai/ai.decision.ts; stage-d.integration.test.ts.

47. **How is EDITED determined?** Compare final text to captured suggestion with implemented whitespace normalization.

48. **Why is ACCEPTED not ground truth?** Agent incentives, superficial review and selection bias.

## Knowledge versioning

Reference: kb.version.service.ts; stage-f.integration.test.ts.

49. **Why retain superseded content?** Historical provenance and replay must resolve the exact evidence used.

50. **What separates READY from PUBLISHED?** Prepared content versus explicit active publication; uploading never silently switches it.

## Reliability Lab

Reference: reliability/replay.service.ts; replay.execution.ts; replay.comparison.ts.

51. **Why cap retrieval-only replay at fifty cases?** Bound duration/cost and inspectable cohorts; do not silently omit failures.

52. **Why include successful guardrails?** A fix can solve prior failures while breaking earlier successes.

53. **When is a comparison inconclusive?** Explain classifier rules and missing attribution instead of forcing improvement.

54. **Can replay send messages or create production feedback?** Evaluation core is separate from command/signal/message paths.

## Testing

Reference: docs/testing.md; e2e/critical-flows.spec.ts.

55. **Which invariants need a real database?** Locks, constraints, migration guards, concurrent writes and transactional rollback.

56. **Why avoid paid provider calls in CI?** Nondeterminism, cost and credentials; real-provider evaluation is a separate controlled exercise.

57. **How were browser flakes handled?** Diagnose navigation/fixture readiness; no blind retry configuration.

## Deployment

Reference: docs/deployment.md; .github/workflows/ci.yml.

58. **What must be configured before HTTPS authentication works?** Exact origins, secure cookies, secret, trusted proxy topology and client build URLs.

59. **Why run migrations once per release?** Controlled failure handling and backup/rollback planning; not every replica startup.

## Scalability

Reference: docs/performance.md; docs/known-limitations.md.

60. **What is the first measured bottleneck?** Use current synthetic measurements and workload shape; no universal SLA.

61. **Which state is process-local?** Socket rooms and execution slots; distinguish DB-backed state and adapter requirements.

## Security

Reference: docs/threat-model.md; seedGuard.ts; ingestion.unit.test.ts.

62. **Why restrict the demo reset target?** An explicit destructive flag alone is insufficient; also check environment and disposable local DB name.

63. **What upload threats remain?** Validation/process bounds do not replace malware scanning or deployment isolation.

64. **How do logs avoid leaking secrets?** Allowlisted metadata and sanitized categories instead of raw errors/prompts/tokens.

## Tradeoffs

Reference: docs/adr/README.md; docs/known-limitations.md.

65. **Why a modular monolith?** Shared transactional invariants, lower operational complexity; independent modules/process roles.

66. **What would you deliberately not build next?** No speculative distributed stack; learning, deployment maintenance and measured bug fixes.

Total: 66 questions.
