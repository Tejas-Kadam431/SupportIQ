# Transaction and concurrency boundaries

The application uses PostgreSQL READ COMMITTED with explicit locks, uniqueness constraints and conditional writes. It does not claim global serializability.

| Path | Serialization / conflict mechanism | Boundary |
| --- | --- | --- |
| Refresh rotation/reuse/logout | RefreshSession row lock; token consumed predicate; family revocation commits before 401 | Existing access JWT remains valid until expiry; refresh family is revoked |
| Membership, assignment, ticket lifecycle | Organization row lock; current membership reread; ticket status/updatedAt compare-and-set | Organization mutation throughput is deliberately serialized |
| Ticket creation, message/note writes | Organization lock and current-role check inside write transaction | Reads are point-in-time; delivery has a separate authorization check |
| First response | UPDATE WHERE firstResponseAt IS NULL with persisted message timestamp | One successful winner; transaction rollback removes both message and activity |
| Copilot decision/send | Run/organization coordination, unique evaluation and idempotent terminal decision | External generation precedes durable history; never auto-sends |
| KB numbering/publication | Document row lock; unique document/version number; expected-current pointer | Source storage is compensating, not part of a distributed DB transaction |
| Outbox dispatch | SKIP LOCKED claim with lease/token; unique version/generation | Duplicate enqueue after crash is expected and safe |
| Processing | Generation + token + expiring lease, fenced writes and durable attempts | A stale provider call can consume cost but cannot publish stale completion |
| Issue signals | Organization lock, unique run signal and grouping key | Derived signal can be reconciled after a secondary failure |
| Replay | Organization mutation lock + status transition + unique experiment/case result | Bounded synchronous execution; interrupted runs require cancellation/new experiment |
| Verification | Current publication/cohort/experiment checks in transaction | VERIFIED applies to the historical cohort; no universal correctness claim |

See org.transaction.ts, auth.service.ts, ai.decision.ts, kb.version.service.ts, kb.outbox.ts, kb.processing.ts, issue.service.ts and replay.execution.ts under apps/api/src/modules. Regression evidence lives in the Stage C–I integration suites and ticket.service.test.ts.
