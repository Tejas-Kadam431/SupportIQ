# SupportIQ engineering audit

> HISTORICAL: this audit describes local commit `95e6756`, not the later GitHub main. Its AI/feedback/auth conclusions are superseded by [repository-reconciliation.md](repository-reconciliation.md). Do not use its roadmap to plan new features. Phase 1's implementation record remains relevant.

Audit date: 2026-09-24. Findings below describe the inspected baseline, before Phase 1. This is a source review, not a penetration test. Existing uncommitted health routes, app wiring, and API TypeScript configuration are preserved.

## A. Current architecture

The pnpm workspace contains a React/Vite client with Redux Toolkit Query, an Express API with Prisma/PostgreSQL, and a shared package containing only the application name. HTTP routes apply authentication, validation and selected organization/demo guards; services implement membership and ticket-ownership checks. Socket.IO authenticates a JWT at connection and authorizes ticket room joins. Only public message events are broadcast.

The API process also starts a BullMQ worker backed by Redis. Uploads live on local disk. Processing extracts text, replaces document chunks in a database transaction, then embeds each chunk with OpenAI. Vector storage is added through runtime DDL. Retrieval uses vector results when available, otherwise keyword substring matching. Copilot assembles a prompt, tries Gemini then OpenAI then a template fallback, returns an editable draft and writes partial source metadata to activity logs. Sending is a separate user action.

Primary evidence: `apps/api/prisma/schema.prisma`, `src/server.ts`, `src/app.ts`, the API modules, client `app/api.ts`, ticket detail and draft components, and `.github/workflows/ci.yml`.

## B. Already strong

- Organization-scoped roles, protected owner membership, and admin privilege restrictions exist in `org.service.ts`.
- Ticket reads enforce customer ownership; notes, internal activity, Copilot and dashboard services reject customers. KB routes enforce staff access before upload processing.
- Message, note, ticket creation and ticket mutations use transactions for their activity records.
- Refresh tokens are hashed at rest; passwords use bcrypt. Refresh cookies are HttpOnly and secure in production.
- Draft generation does not send messages. The client requires an explicit send confirmation.
- Tenant predicates exist in keyword/vector search; SQL vector values are passed as parameters.
- Queue retries, bounded ticket pagination, upload controls, RBAC integration tests and CI are present.

## C. Concrete correctness and security findings

| Priority | Evidence | Failure and consequence |
| --- | --- | --- |
| P0 | `tickets/ticket.service.ts`, `assignTicket` | Assignment writes status using an earlier read; it implicitly starts OPEN tickets and can overwrite a concurrent status change. |
| P0 | `tickets/ticket.service.ts`, `getStatusDates` / `updateTicketStatus` | Every enum-to-enum transition is accepted. Reopening retains completion dates, repeated resolution resets time, and concurrent changes record stale old status. |
| P0 | `auth/auth.service.ts`, `refreshAccessToken` | Read, revoke and replacement creation are separate operations. Concurrent requests can both rotate one token. Reuse rejects the old token but does not revoke its replacement/session family. |
| P0 | `realtime/realtime.service.ts` | Membership and ownership are checked only at join. Removed or demoted members retain room access; connected sockets continue after JWT expiry. |
| P0 | `organizations/org.service.ts` | Demotion/removal leaves existing ticket assignments pointing to non-staff/non-members. Assignment validation and mutation are not serialized with membership changes. |
| P1 | `messages/message.service.ts` | Two staff replies can overwrite firstResponseAt because the null check uses a pre-transaction snapshot. |
| P1 | `ai/ai.service.ts` | Low/zero evidence still invokes generation. Raw keyword counts and vector similarity percentages share confidence thresholds. Number of chunks can inflate HIGH confidence. This is not deterministic abstention. |
| P1 | `ai/ai.service.ts` | Ascending message order with take 10 selects the oldest ten messages despite labeling them recent. |
| P1 | `knowledge-base/kb.queue.ts`, `kb.service.ts` | Database create and enqueue have no atomic outbox; enqueue failure strands uploads. Timestamp job IDs do not deduplicate document work and contain colon separators that need validation against the installed BullMQ version. |
| P1 | `kb.processing.ts`, schema | Reprocessing deletes historical chunk identities; deletion cascades chunks. Embedding failures can still yield READY. Concurrent document processing can replace each other's chunks. |
| P1 | `ai.service.ts`, schema, `AiDraftPanel.tsx` | No durable generated text/prompt snapshot, immutable evidence version, acceptance/edit/rejection record or run identifier. Activity metadata cannot reconstruct historical responses. |
| P1 | `auth/auth.controller.ts` | Refresh tokens are returned in JSON as well as cookies, exposing them to JavaScript despite HttpOnly cookies. Cookie lifetime is hardcoded independently of token expiry. |
| P1 | error handler, AI/vector error logging | Raw error objects are logged without a redaction boundary. Secret-free logs are not enforced; actual credential leakage was not demonstrated. |
| P2 | `tickets/ticket.service.ts` | Customer ticket responses include internal-note counts (not note bodies). Remove this internal metadata from customer projections. |
| P2 | `TicketDetailsPage.tsx` | Customer UI renders staff controls and internal panels; backend denies calls, but the UI is not role-aware. |
| P2 | `jest.config.cjs`, CI | Jest discovers only `src/__tests__`, omitting `tests/auth.test.ts`; setupEnv is not wired. CI uses db push instead of testing migrations. API lint is a placeholder. |

Additional boundaries needing dedicated tests: cross-tenant denial across every endpoint and socket event; demo resource protection against other authorized actors (the current guard is actor-email based); production cookie/origin policy; upload/queue crash recovery. These are follow-up verification areas, not claims of demonstrated exploits.

## D. Areas needing deeper ownership

Confidence labels need measured evidence rules and evaluation data. Provider failures should be distinct from insufficient knowledge. The dashboard measures ticket counts rather than support intelligence. Local uploads and a worker inside the web process need an explicit operational model. The shared package does not yet define contracts. Large service functions, scattered role types, broad `any` queries, runtime schema changes and missing migration coverage make invariants harder to maintain.

## E. Partial feature implementation

| Requested capability | Baseline state |
| --- | --- |
| Hybrid retrieval | Semantic retrieval with keyword fallback; no fusion or full-text ranking. |
| Evidence evaluation | Heuristic confidence and warnings; no abstention gate. |
| Structured Copilot | HTTP metadata and sources exist; model returns unvalidated free text. |
| Traceability | Activity contains IDs/scores; no complete immutable run/evidence snapshots. |
| Feedback | Editable draft and manual send; edits and rejection decisions are not recorded. |
| Source health | Processing status/error and chunk counts; no quality or outcome attribution. |
| Knowledge versioning | Mutable documents/chunks only. |
| Reliability Lab / KnowledgeIssue / verification loop | No models, routes or UI found. |
| Demo protection | Write-route guards and skipped AI activity for demo actor. |
| Reliable ingestion | BullMQ retries and unique document/chunk-index pair; no transactional outbox/reconciliation. |

## F. Recommended final architecture

Keep a modular monolith and extract the worker deployment independently. Centralize tenant/actor access policies and explicit domain commands. Enforce tenant-consistent relations with composite keys where practical. Separate assignment from lifecycle, and make mutations plus audit records atomic.

Use immutable DocumentVersion and ChunkVersion records backed by object storage. Ingestion publishes version-scoped outbox events; workers claim idempotency keys, stage chunks/embeddings, then atomically activate a complete version. A reconciler repairs abandoned work. Put vector DDL and indexes in migrations.

Build retrieval from tenant-filtered full-text and vector candidate sets with rank fusion. A versioned deterministic evidence policy returns answer/clarify/abstain plus reason codes before generation; model output then passes a structured schema and citation validator. Persist CopilotRun, retrieval candidates, evidence snapshots, model/prompt/policy versions, timings and failure classifications. Store human decisions and edited text separately from generated output and link approved messages to runs.

Aggregate failure signals into KnowledgeIssue and source health records. Reliability Lab replays immutable cases through a runner with no message-sending capability, records coverage and paired baseline/candidate outcomes, and verifies knowledge fixes before issue closure. Exact model text reproduction is not guaranteed; reconstruct inputs and preserve actual historical output.

Product navigation: Overview (acceptance/edit/rejection/abstention, coverage, failure reasons), Knowledge Issues (recurrence, tickets, severity, status), Source Health (problem documents/versions), Copilot Runs (trace), Reliability Lab (historical comparisons). Roll out prompt/policy versions only after regression gates.

## G. Prioritized implementation roadmap

1. **Phase 1: ticket lifecycle correctness.** Explicit transition policy, independent assignment, atomic concurrency checks, stable first response, actionable UI errors and tests.
2. **Security foundation (P0):** atomic refresh rotation with family reuse response, cookie-only browser contract, redacted logs, socket expiry and authorization revalidation, membership/assignment consistency, tenant/customer/demo adversarial tests and role-aware projections.
3. **AI foundation (P1):** immutable knowledge versions and run storage first; hybrid retrieval, versioned evidence gating, structured generation, feedback and trace UI. No automatic public messages.
4. **Differentiation (P2):** KnowledgeIssue, source health, historical evaluation datasets, isolated replay runner, knowledge-fix verification and overview metrics with explicit denominators.
5. **Operations (P3):** object storage, transactional outbox, worker leases/idempotency, reconciliation, tracing/redaction, latency/token budgets and migration/recovery/load tests. Bring ingestion reliability forward before enabling mutable version publishing.
6. **Presentation (P4):** cohesive navigation, safe seeded demonstration scenarios, measured examples, README, architecture diagrams and decision records. Rebranding is optional and deferred.

## H. Exact Phase 1 change plan

- Add `apps/api/src/modules/tickets/ticket.policy.ts`: active states may move among active states or resolve; RESOLVED can close or reopen; CLOSED must reopen to OPEN. Same-state requests are idempotent. Reopening clears current-cycle completion dates. Historical transitions stay in activity logs.
- Change `ticket.service.ts`: enforce policy with conditional updateMany and reread inside the audit transaction; reject stale status/assignment writes with 409; assignment writes only assigneeId. Expose allowed transitions in ticket details for the UI.
- Change `messages/message.service.ts`: set firstResponseAt only when still null inside the transaction, using the saved message timestamp.
- Change client `ticketsApi.ts` and `TicketDetailsPage.tsx`: display server-provided transitions and surface mutation errors.
- Add policy/service regression tests under `apps/api/src/__tests__` and record validation in this document.

Invariants: customers retain existing ownership restrictions and cannot read notes; tenant checks remain; assignment never changes status; state/audit writes commit together; first-response time cannot be replaced by subsequent replies; no AI send behavior changes; demo write guards remain. No schema migration, deletion, historical backfill or seed operation is needed. Existing timestamp inconsistencies are deliberately retained until a separately reviewed repair can distinguish historical facts from guesses.

The transition table is a new explicit product decision, not a claim about the old behavior. Existing clients attempting direct OPEN-to-CLOSED receive 409 and must resolve first. Existing staff assignment permissions are preserved; membership-demotion races remain in Phase 2.

### Phase 1 implementation and decision record

Implemented the planned policy, service and client changes. Added `ticket.policy.test.ts` (all 25 status pairs), `ticket.service.test.ts` (authorization, eligible assignees, independent assignment, stale-write rejection, no-op status and first-response predicates), and two database-backed cases in `rbac.integration.test.ts` (lifecycle history/timestamps and subsequent staff replies).

The lifecycle policy is pure and independently testable. Ticket details expose allowed transitions so the client does not maintain a second transition table. Conditional writes compare the observed status/assignee and updatedAt, within the same transaction as the activity record; a conflict returns 409 rather than silently overwriting a competing update. This uses existing schema fields and avoids a destructive migration. A dedicated integer revision can replace timestamp-based concurrency control if stronger version guarantees are required. The first-response conditional update uses the saved public-message timestamp and never changes assignment or status.

Deferred deliberately: repairing old timestamps, tenant policy centralization, assignment cleanup on membership changes, refresh/session security, socket revocation, AI/retrieval behavior, document versioning, queue recovery and product-wide navigation. Phase 1 does not establish the full final quality bar.

### Validation results

- Locked dependency installation succeeded; lockfile unchanged. Prisma Client 6.19.0 generated successfully; no database migration was run.
- `node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/__tests__/ticket.policy.test.ts src/__tests__/ticket.service.test.ts` from `apps/api`: **36 tests passed, 2 suites passed**. Jest reports existing ts-jest configuration deprecation and TypeScript 6 compatibility warnings.
- Client `tsc -b` and Vite production build: **passed**, with a bundle-size warning (565 kB main JS before gzip).
- API `tsc --noEmit`: **blocked** by the pre-existing uncommitted `module: NodeNext` / `moduleResolution: bundler` combination (TS5095/TS5109).
- API `tsc --noEmit --moduleResolution NodeNext`: **blocked only by three import-resolution diagnostics in the pre-existing uncommitted health module**. Its controller/routes use extensionless relative imports. Those files and the configuration were not changed by Phase 1.
- Database-backed integration cases were added but **not run**: this checkout has no configured local `.env`/`.env.test` or confirmed isolated PostgreSQL/Redis test environment. Mocked unit tests verify service decisions and predicates, not PostgreSQL isolation behavior or transaction rollback. Run the integration suite against a disposable test database before deployment.
- `git diff --check`: **passed**. Git emits normal Windows line-ending notices.

No production service was started, no existing data was mutated, and no changes were committed or deployed.
