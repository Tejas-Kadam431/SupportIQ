# Authoritative repository reconciliation

## Stage A validated — 2026-09-25

Active hardening worktree: `C:/Users/kadam/.codex/visualizations/2026/09/24/01a0d482-ea6d-7251-a026-67608cd44412/supportiq-hardening`.
Branch: `codex/supportiq-hardening`; HEAD/base: `6f5b5e237bf18e5dece0a7d1294dfb1778d4793d`, confirmed against live GitHub main. Original checkout on old main is preserved. The historical content-overlay description below refers to that original checkout, not this aligned branch.

Durable verified backup: sibling `supportiq-backup-20260925/manifest.json` and `delta/`, with raw SHA-256 hashes and Git blob identities. The older temporary backup also exists. No commits, pushes, resets, stashes or destructive operations were performed.

Exactly 20 files differed from upstream and were reapplied:

- `.github/workflows/ci.yml`
- `apps/api/jest.config.cjs`, `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/tests/setupEnv.cjs`
- `apps/api/src/__tests__/rbac.integration.test.ts`, `ticket.policy.test.ts`, `ticket.service.test.ts`
- `apps/api/src/app.ts`
- `apps/api/src/modules/health/health.controller.ts`, `health.routes.ts`, `health.service.ts`
- `apps/api/src/modules/tickets/ticket.policy.ts`, `ticket.service.ts`
- `apps/api/src/modules/messages/message.service.ts`
- `apps/client/src/features/tickets/TicketDetailsPage.tsx`, `ticketsApi.ts`
- `docs/engineering-audit.md` (historical record only), `docs/repository-reconciliation.md`, `docs/screenshots/tickets-detail-ai.png` (retained asset)

Stage A validation: normal API build passed; normal client build passed (bundle-size warning); 36 infrastructure-free tests passed; diff check passed. No Copilot, auth, analytics, schema or migration delta against upstream. No conflicts. All 20 files remained uncommitted (14 modified, 6 untracked); the baseline and working diff now accurately represent upstream plus intentional work. Jest patterns were made independent of absolute path glob escaping, with explicit source/test roots, after the new hidden-directory path exposed a discovery failure. One health-controller trailing blank line was removed.

Dependencies for local validation reuse the already installed locked packages through ignored directory junctions; source files and build output are isolated in this worktree. Fresh installs use the committed manifests/lockfile normally.

Stage B begins only after the above checks passed.

## Stage B — authorization lifetime implemented

The same aligned worktree/branch is authoritative for this implementation. Work remains uncommitted; no push, deployment or database migration was performed. The original checkout is preserved.

### Inspected baseline and unchanged event contract

`server.ts` initializes Socket.IO on the API HTTP server. Previously, the handshake verified a JWT, stored userId/email, and `ticket:join` loaded the ticket and organization membership once. `ticket:leave` removed membership. Public message creation committed its transaction and broadcast `ticket:message_created` to the whole room. Socket CORS treated CLIENT_URL as one string, unlike HTTP's comma-separated allowlist. There were no dedicated realtime tests.

Event names and public message payload fields remain unchanged: incoming `ticket:join` / `ticket:leave` with acknowledgement; outgoing `ticket:message_created`. No internal-note event is registered or emitted.

### Architecture and changed files

- New `realtime.authorization.ts` validates identifiers and projects current ticket ownership plus that user's current membership in the ticket's organization. OWNER/ADMIN/AGENT can access organization tickets; CUSTOMER must own the ticket; missing/unknown membership and missing tickets deny. Lookup errors propagate to a fail-closed boundary.
- `realtime.service.ts` uses the helper on join and before **each individual recipient emission**. Room state supplies candidates only. Denied recipients leave the ticket room. Lookup/delivery errors suppress that recipient's payload, disconnect the socket and produce a sanitized structured log. Another recipient's failure does not prevent authorized delivery.
- `jwt.ts` explicitly signs/verifies HS256 and requires a nonempty string subject plus a valid, future integer expiry. It introduces no new issuer/audience requirement that would invalidate existing legitimately issued tokens. HTTP continues to use the same helper, Bearer contract and failure status.
- `realtime.types.ts` stores userId and validated expiry in milliseconds. The server schedules disconnect at expiry, caps/reschedules long timers, and clears timers on disconnect. Both join and delivery recheck expiry after asynchronous authorization; delivery also rechecks current connection/room state. Client reconnect behavior is not trusted for expiry enforcement.
- `message.service.ts` starts a caught notification promise only after its transaction commits. Notification throws, rejections and slow lookups cannot change a saved message's HTTP success or overwrite Phase 1 first-response semantics. Realtime remains best-effort, without retries or a durable delivery guarantee.
- New `realtime.logging.ts` records only `{ event: "realtime.operation_failed", operation }`. It never serializes raw errors, database strings, handshake tokens or message bodies. This is scoped realtime redaction, not a claim that all existing application logs have been hardened.
- New `config/origins.ts` is shared by HTTP app wiring and sockets. CLIENT_URL is a comma-separated, trimmed exact-origin allowlist. Wildcard entries never grant access. Set explicit production frontend origins including scheme/port. Missing Origin remains supported for authenticated non-browser clients; origin is not an authentication mechanism. Socket allowRequest enforces the policy for direct WebSocket handshakes as well as polling.
- Added `socket.io-client` as an API test-only dependency, reusing locked 4.8.3 already present in the client. The lockfile contains only the new API importer entry, with no dependency upgrades.

Tradeoff: fresh permission reads per subscribed socket/event incur more DB work than cached or revocation-driven authorization. This intentionally avoids a stale authorization window from caching. It is suitable for the current single-process deployment; measure room sizes and query pressure before scaling. Permission is evaluated at the DB read immediately preceding emission; already transmitted packets cannot be recalled.

**Multiple API instances require a Socket.IO Redis adapter or equivalent shared adapter.** Current recipient enumeration is local-memory only. Adapter adoption also needs distributed recipient enumeration and authorization at each delivery boundary; installing an adapter alone is insufficient with the current local enumeration. The permission helper itself remains reusable.

### Tests and invariant coverage

- `realtime.authorization.test.ts`: all staff roles, owning/non-owning customers, nonmembers/cross-tenant users, missing tickets, invalid IDs, no cache and DB failure propagation.
- `realtime.socket.test.ts`: real loopback Socket.IO WebSocket and polling connections against controlled Prisma results. Missing/expired/malformed tokens, wrong signature/algorithm, missing claims, allowed/denied origins, uniform inaccessible-ticket responses, ownership, public-only projection, membership removal, demotion, ownership change, deletion, preserved access on valid demotion, DB failure isolation/redaction, expiry during a pending lookup, long timer lifetimes, leave and leave-during-lookup.
- `jwt.test.ts` / `origins.test.ts`: explicit token claim/algorithm validation, existing issued-token HTTP compatibility, HTTP 401 behavior and exact frontend allowlisting.
- `ticket.service.test.ts`: Phase 1 tests preserved, plus HTTP 201 after notification throws/rejects/stalls, post-commit notification ordering and no emission on transaction failure.
- `rbac.integration.test.ts`: added a real-database scenario joining sockets, removing an AGENT via the ADMIN API, changing customer ownership via a DB fixture, then persisting a public message and verifying no delivery to the revoked recipients. This complements the locally executed transport tests and is not represented as locally executed.

No AI, feedback, dashboard, auth refresh, schema or migration implementation was changed. Phase 1's policy/status/assignment code and first-response conditional write remain intact. Demo guards and note restrictions are untouched.

### Stage B validation

Final result: **95 tests passed across six infrastructure-free suites**, including real Socket.IO transports, with `--detectOpenHandles` and no reported leaked handles. Normal API/client builds, `git diff --check` and frozen-lockfile verification passed. Full discovery lists eight suites including the two infrastructure-dependent suites.

Final Git state: `codex/supportiq-hardening` at upstream `6f5b5e2`, 0 ahead / 0 behind by commits, with **18 modified and 13 untracked files**, all intentionally uncommitted. No migration/schema/Copilot/refresh-service delta exists against upstream. A final binary tracked patch, untracked file copies and complete `git status` were saved alongside the durable Stage A backup as `hardening-tracked.patch`, `hardening-untracked/` and `hardening-status.txt`. Original checkout file hashes still match the pre-alignment backup.

API normal build and client normal build pass without compiler overrides. Frozen-lockfile metadata verification passes; the first offline attempt lacked optional-platform metadata, then online verification succeeded without installing packages or running scripts. All infrastructure-free suites execute locally, including real Socket.IO transport tests. PostgreSQL/Redis integration tests remain pending an isolated test environment; CI discovers both auth and RBAC suites.

Known maintenance warnings remain: TypeScript 6 is outside ts-jest 29's advertised compatibility range; client main bundle is approximately 572 kB. Neither warning is suppressed.

Next bounded P0 work after this phase: refresh-token family/reuse response and membership/assignment consistency. Existing transactional rotation, cookie-only transport and Copilot feedback remain the foundation.

The sections below preserve the original reconciliation evidence; Stage A/B updates above supersede its checkout state and socket implementation findings.

Verified 2026-09-24 against fetched GitHub main. This document supersedes the original audit for changed code. No new AI, retrieval or feedback feature was implemented during reconciliation.

## Repository identity and why the audit differed

| Item | Verified value |
| --- | --- |
| Remote | https://github.com/Tejas-Kadam431/SupportIQ.git |
| Branch | `main` |
| Local HEAD (unchanged) | `95e6756f91cee2db0073c7d758b070355679ad5f` |
| Upstream branch | `origin/main` |
| Live remote and fetched upstream SHA | `6f5b5e237bf18e5dece0a7d1294dfb1778d4793d` |
| Ahead / behind | 0 / 8 commits |
| Working tree | Dirty before and after reconciliation; no commits or staging performed |

The earlier audit inspected an older checkout and did not refresh the remote-tracking reference. Cached origin/main also pointed to 95e6756, misleadingly showing 0/0 divergence. The local code findings were specific to that old baseline; the claims that current SupportIQ lacked feedback, persisted runs and AI analytics were not valid for GitHub main. This was a repository-baseline verification failure, not evidence that upstream features were removed.

The working files now contain upstream's product changes plus Phase 1 and explicit tooling/health reconciliations. **Git history has not been advanced:** this is an uncommitted content overlay, not a merge or fast-forward. Do not commit all upstream changes as if newly authored; history alignment remains a separate Git operation after review. No reset, checkout, pull, rebase, merge, stash, database migration, seed or deployment was executed. Fetch changed only Git metadata.

Latest 10 commits at local HEAD (newest first):

| SHA | Subject |
| --- | --- |
| 95e6756 | Add missing README screenshots |
| 8668f64 | Polish project README and demo documentation |
| e502922 | Add Gemini AI provider and demo screenshots |
| c1511aa | Add Gemini draft generation provider |
| f1169f9 | Fix ticket table layout for long text |
| 0b81165 | Fix ticket card layout for long descriptions |
| ccf4616 | Improve demo read-only error handling |
| ad18a81 | Protect recruiter demo workspace as read-only |
| 006f0ae | Update SupportIQ branding assets |
| 004336c | Update SupportIQ branding assets |

Eight upstream-only commits, newest first (upstream's latest ten are these plus 95e6756 and 8668f64):

| SHA | Date | Subject |
| --- | --- | --- |
| 6f5b5e237bf18e5dece0a7d1294dfb1778d4793d | 2026-08-24 | feat: add closed-loop AI copilot quality feedback |
| 0127ff9d982637857503a9ac94e5f2bd1c74bb1b | 2026-08-23 | refactor(auth): remove unused refresh JWT configuration |
| 29111a218e1ef3eccc8c8dcb27413c4b7a1d539a | 2026-08-23 | fix(auth): keep refresh tokens cookie-only |
| 235bb219ab50ae61153ba07742331c51275ca873 | 2026-08-06 | Seed complete recruiter demo data |
| 9913dfd5fb0fde0c6c27d593443077ff9945ac77 | 2026-08-06 | Allow dependency builds on Render |
| 05f3fbffd0b37ba1dad944ca8fae01e9c7c2724d | 2026-08-06 | Fix Render proxy configuration |
| 9abe153caaa198ffe3d735eb9c36cd644dced0ff | 2026-08-06 | Fix pnpm build script approvals |
| 0fbe55f9ed3785224d1f8d2d9a0b568304b0a43f | 2026-08-05 | refactor(api): modularize health flow and improve async error handling |

## Upstream capability evidence

All Copilot entries below were introduced in **6f5b5e2**. Paths are repository-relative.

| Capability | Exact implementation |
| --- | --- |
| CopilotRun, CopilotEvaluation, CopilotDisposition, CopilotFailureReason | `apps/api/prisma/schema.prisma` (enums at lines 48/54, models at 288/326) |
| Database migration | `apps/api/prisma/migrations/20260824024308_add_copilot_feedback_loop/migration.sql` |
| Persisted runs, suggested reply, source excerpts, abstention | `apps/api/src/modules/ai/ai.service.ts`, `generateAiDraftReply`, `buildCopilotInsights` |
| Evaluation API | `apps/api/src/modules/ai/ai.routes.ts`, PUT `/:ticketId/copilot-runs/:runId/evaluation`; `ai.controller.ts`, `evaluateCopilotHandler`; `ai.schema.ts`, `evaluateCopilotSchema` |
| Evaluation service | `apps/api/src/modules/ai/ai.service.ts`, `evaluateCopilotRun` |
| Quality, failure reasons, knowledge gaps, source quality | `apps/api/src/modules/dashboard/dashboard.service.ts`, `buildAiQuality` and `getOrganizationDashboard` |
| ACCEPTED / EDITED / REJECTED and final message capture | `apps/client/src/features/tickets/AiDraftPanel.tsx`, `handleSendDraft`, `handleRejectCopilot`; `aiApi.ts` |
| Dashboard UI and contract | `apps/client/src/pages/DashboardPage.tsx`; `apps/client/src/features/dashboard/dashboardApi.ts` |

Other corrections: cookie-only refresh responses and requests are in **29111a2**, affecting auth controller/schema, tests and client auth types. Atomic refresh consume/create is in **6f5b5e2**, `apps/api/src/modules/auth/auth.service.ts`. Unused refresh JWT configuration removal is **0127ff9**. Health module with `.js` imports is **0fbe55f**, and proxy configuration is **05f3fbf**.

## Divergence table

“Working tree before” means the preserved Phase 1 state at the start of this reconciliation. “Action” describes the resulting working files; local HEAD remains unchanged.

| Capability | Working tree before | Local HEAD | Upstream main | Action / resulting working tree |
| --- | --- | --- | --- | --- |
| Phase 1 lifecycle work | Uncommitted implementation/tests | Absent | Absent | Preserved verbatim; integration cleanup hook adjusted separately |
| CopilotRun | Absent | Absent | Persisted run model and creation | Imported upstream implementation |
| CopilotEvaluation | Absent | Absent | Unique evaluation per run, upsert | Imported; preserve, then harden history |
| Feedback loop | Draft edit/send only | Draft edit/send only | Accept/edit after send; explicit reject | Imported; no rebuild |
| AI quality dashboard | Ticket analytics only | Ticket analytics only | Counts, acceptance/abstention, reasons | Imported; improve attribution/coverage later |
| Knowledge gaps | Absent | Absent | Topic aggregation from abstention/reasons | Imported; partial issue discovery, not workflow |
| Source quality | Ingestion status only | Ingestion status only | Accepted/problematic source-use aggregation | Imported; attribution needs hardening |
| Semantic/vector search | Vector with keyword fallback | Same | Same | Retained; hybrid fusion remains missing |
| Ticket lifecycle | Explicit policy, independent assignment | Arbitrary enum transitions; assignment changes status | Same as local HEAD | Preserved Phase 1 |
| Auth fixes | Non-atomic rotation, JSON refresh tokens | Same | Cookie-only and transactional rotation | Imported; family/reuse response still missing |
| Health/config | Local module; bad imports/export case and moduleResolution | Inline health; valid NodeNext config | Modular health, `.js` imports; valid NodeNext | Retained local health response semantics, fixed imports/export use and async signature; restored NodeNext; included upstream proxy setting |
| Jest / CI | Auth tests undiscovered | Same | Both folders discovered, global queue setup; CI db push | Split infrastructure-free unit and integration projects; CI runs both and migrate deploy |

## Preservation and integration method

Before edits, every modified/untracked file plus a binary tracked patch was copied to:

`C:\Users\kadam\AppData\Local\Temp\supportiq-reconciliation-20260924`

This contains `files.txt`, `working-tree.patch`, original files at their relative paths and `upstream-overlay.patch`. It is an extra safety copy, not the sole copy of Phase 1. Copy it to durable storage before relying on it long-term; the OS temporary directory is not an archive.

The upstream diff was checked with `git apply --check`, then applied to non-overlapping working files without changing the index or HEAD. Manual reconciliation was limited to app health wiring/proxy configuration and local health/config fixes. The upstream-deleted `docs/screenshots/tickets-detail-ai.png` was retained to avoid discarding an existing asset.

No Phase 1 lifecycle file was changed by any of the eight upstream commits. Hash comparison against the backup confirms exact preservation of `ticket.policy.ts`, `ticket.service.ts`, `message.service.ts`, both new unit tests, `TicketDetailsPage.tsx` and `ticketsApi.ts`. The two Phase 1 RBAC integration cases remain; only its duplicate queue cleanup import/call was removed because the integration setup owns cleanup.

Migration differences: upstream adds one migration creating two enums, two tables, indexes and foreign keys. It contains no DROP or data rewrite. Phase 1 has no schema migration; no migration conflicts exist. Source integration is safe, but deploying the schema still needs the normal database backup/review process. No local schema was applied to a live database. Upstream seed changes were imported but never executed.

For eventual history alignment, the safest reviewed path is a separate checkout at 6f5b5e2 with only the intentional delta relative to that commit reapplied (Phase 1, health/tooling reconciliation and these docs). Keep the current checkout until that candidate passes tests. This avoids committing eight upstream commits' content as a new giant patch on old HEAD. That checkout/history operation was not performed automatically.

## Fresh assessment of the reconciled implementation

### AI and feedback

- Runs now persist suggestedReply, abstained, confidence/provider/tone, source IDs/scores/excerpts, topic, summary and recommended action. This is useful historical evidence. It does not snapshot the full prompt, recent conversation, full retrieved chunks, model identifier, policy/prompt versions or generation parameters. Run creation and activity creation are separate writes. Deleting a ticket or organization cascades runs/evaluations.
- Generation remains free text from Gemini/OpenAI. The surrounding Copilot fields are built deterministically in application code; they are not schema-validated structured model output. Topic is the first 100 characters of the ticket title, not a learned issue classification. Missing information reports missing/weak KB evidence, not a general customer-context analysis.
- Abstention exists: no sources or LOW confidence causes `suggestedReply: null` and an empty compatibility draft. The UI prevents sending an abstained suggestion. However, providers are called before the gate, and raw substring scores and vector percentages share the same confidence thresholds. Weak vector matches can pass MEDIUM at score 3; three chunks plus best score 10 can produce HIGH. The confidence policy needs replacement, not the invention of a missing abstention feature.
- Evaluation checks staff ticket access and scopes run lookup to ticket and organization. Rejection requires a reason; edits require final text; the browser captures sent final text for accept/edit. Accepted evaluations clear failure reason.
- Feedback is not atomic with public message creation. The client sends first, then evaluates; failed evaluation loses linkage despite a sent message. The schema has no messageId relation. A caller can mark a run accepted without sending a message, and acceptance need not include final text. The per-run upsert overwrites prior evaluator/disposition/reason/finalMessage, losing decision history. Treat current feedback as useful but mutable self-report.
- Demo runs deliberately are not persisted and demo evaluation is blocked. Public sending still requires human action.

### Analytics, gaps and source quality

- Acceptance rate is accepted / evaluated runs. Abstention rate is abstained / all runs. Counts and denominators exist; there is no explicit evaluation-coverage rate, date window or time series.
- Knowledge-gap signals aggregate abstained runs and INSUFFICIENT_KB / WRONG_KNOWLEDGE / IRRELEVANT_EVIDENCE reasons by normalized title-derived topic. Similar issues with different titles stay separate; repeated runs on one ticket can dominate. No persistent KnowledgeIssue, affected-ticket set, severity, status, owner or fix-verification lifecycle exists.
- Source quality loops over source snapshots and increments document accepted/problematic counts. Multiple chunks from the same document in one run count multiple times. Every edit/rejection counts as problematic for every retrieved source, including tone-only changes. This is a signal, not established document blame or a source-quality rate.
- The dashboard reads every organization run into memory, then aggregates and returns the top five gaps/sources. It needs date bounds, document/run deduplication, reason-sensitive attribution and query-side aggregation as volume grows.

### Retrieval

Fresh inspection confirms tenant-filtered vector search over READY documents, cosine-distance ordering and score `max(0, round((1 - distance) * 100, 2))`. Any nonempty vector result set wins; there is no minimum relevance cutoff or lexical fusion. Empty/unavailable vector retrieval falls back to keyword matching. Keyword ranking counts substring occurrences, includes stopwords, and ranks only a newest-first limited candidate set. These scores are not comparable probabilities.

Embedding/storage failures are caught and return empty/false, so retrieval degradation is not distinguished from no evidence. Vector DDL still runs at request time. Reprocessing still deletes/recreates chunks, and READY can include incomplete embeddings. Copilot still selects the oldest ten messages with ascending order/take 10. These are unchanged gaps confirmed in current working code.

### Ticket lifecycle

Phase 1 remains intact: assignment data contains only assigneeId; explicit transitions enforce resolve-before-close and reopen-to-OPEN; conditional writes reject stale snapshots with 409; reopening clears resolvedAt/closedAt; repeated status is a no-op; first staff response uses an atomic null predicate. Customer ownership and staff mutation guards remain.

Limits: concurrency uses updatedAt rather than an integer revision, membership validation is not serialized with ticket mutations, and membership demotion/removal can leave stale assignments. Unit tests cover decisions/predicates; real database race/rollback behavior remains an integration validation requirement.

### Auth and sockets

Do not reimplement atomic refresh rotation or cookie-only transport: both are present. The remaining refresh gap is session-family lineage/reuse response; replayed revoked tokens reject but cannot revoke descendants because the schema has no family. Refresh lifetime and cookie lifetime are both currently seven days, so the former configuration-mismatch claim is no longer current.

At the original reconciliation baseline, Socket.IO authorized only on connection/join. Stage B above now enforces expiry and current access on individual delivery. Membership/assignment consistency and application-wide secret-redacted logging remain open.

## Authoritative capability classifications and roadmap

COMPLETE below means the specifically named mechanism exists, not that the whole product has production assurance.

| Capability | Classification | Next action |
| --- | --- | --- |
| Cookie-only refresh transport | COMPLETE | Preserve tests; do not rebuild |
| Atomic single-use refresh rotation | GOOD BUT NEEDS HARDENING | Add family reuse response and failure/replay coverage |
| Refresh-token family revocation | MISSING | Add additive lineage/session design after socket P0 |
| Persisted CopilotRun | GOOD BUT NEEDS HARDENING | Preserve; add complete immutable input/evidence/version snapshots |
| Feedback capture and final agent text | GOOD BUT NEEDS HARDENING | Link actual message atomically, retain append-only decision history |
| Structured API Copilot fields | PARTIAL | Preserve fields; add validated model output/citation contract |
| Abstention behavior | PARTIAL | Move gate before generation; measure policy outcomes |
| Shared confidence thresholds | SHOULD BE REPLACED | Versioned modality-aware evidence policy calibrated with fixtures |
| AI quality dashboard | GOOD BUT NEEDS HARDENING | Explicit coverage/windowing, scalable aggregation, verified denominators |
| Knowledge-gap detection | PARTIAL | Improve grouping/deduplicate tickets; extend into persistent issues |
| Source-quality analysis | PARTIAL | Deduplicate document/run pairs, attribute by relevant reason and version |
| Semantic retrieval | GOOD BUT NEEDS HARDENING | Migration-managed vector storage, degradation telemetry, cutoff tests |
| Keyword substring ranking | SHOULD BE REPLACED | Full-text ranking and meaningful token handling |
| Hybrid retrieval/fusion | MISSING | Add to existing retrieval service after evidence/provenance groundwork |
| Immutable knowledge provenance | MISSING | Add document/chunk versions; retain existing run excerpts |
| Historical run explainability | PARTIAL | Complete snapshots, trace detail, policy/model/version identity |
| Reliability Lab / fix-verification loop | MISSING | Isolated runner without message-send capability and stored cases |
| Ticket lifecycle | GOOD BUT NEEDS HARDENING | Preserve Phase 1; validate DB races and membership consistency |
| Socket authorization after join | GOOD BUT NEEDS HARDENING | Stage B implemented and locally transport-tested; execute DB-backed CI and measure permission-query load |
| Demo mutation protection | GOOD BUT NEEDS HARDENING | Add adversarial actor/resource tests |
| Retry-safe ingestion/outbox/reconciliation | PARTIAL | Queue retries exist; add transactional delivery, leases and stable job keys |
| Object storage | MISSING | Replace local-file dependency before distributed workers |
| Observability/cost/performance budgets | PARTIAL | Structured redaction, retrieval/provider metrics, bounded analytics |
| Requested five-area product navigation | PARTIAL | Existing dashboard/feedback UI is useful; build dedicated issue/source/run/lab views incrementally |
| Tests/build/CI | GOOD BUT NEEDS HARDENING | Unit/build checks now pass; integration environment and AI/socket regression coverage remain |

Order: (1) socket P0; (2) refresh families and membership/assignment consistency; (3) feedback/message atomicity and immutable provenance; (4) evidence policy and hybrid retrieval with measured cases; (5) improve existing analytics/gap/source signals; (6) persistent issues, Reliability Lab and verification loop; (7) operational recovery/storage and presentation. Ingestion reliability must precede production version publishing. Do not build a second feedback subsystem or duplicate analytics.

## Original next-phase plan: socket authorization lifetime (now implemented)

Goal: a connected user whose token expires or ticket access is revoked must stop receiving future ticket events. Preserve public-message-only payloads, tenant/customer ownership restrictions, database message commits and Phase 1 lifecycle behavior. Do not couple realtime notification failure to successful message persistence.

Expected files:

- `apps/api/src/modules/realtime/realtime.service.ts`: validate joins and recheck current access before delivery, handle authorization lookup failure by withholding delivery, expire/disconnect sessions, normalize allowed origins.
- `apps/api/src/modules/realtime/realtime.types.ts`: retain validated token expiry/session context.
- New `apps/api/src/modules/realtime/realtime.authorization.ts`: shared ticket-access decision for joins and deliveries.
- `apps/api/src/common/utils/jwt.ts`: validate required subject/expiry and pin expected token verification policy for reuse by sockets.
- `apps/api/src/modules/messages/message.service.ts`: safely observe asynchronous notification outcomes after message commit if emission becomes asynchronous.
- New `apps/api/src/__tests__/realtime.authorization.test.ts` and `realtime.integration.test.ts`: cross-tenant denial, customer ownership, removal/demotion after join, expiry after join, DB lookup failure, valid delivery and no internal-note payloads.
- `apps/api/src/__tests__/ticket.service.test.ts`: adapt notification mocks only if required by the async contract.
- `docs/repository-reconciliation.md`: record implementation and test evidence.

No schema migration was needed. Multi-process deployment needs an explicit adapter/delivery design; room state remains local to one server. This plan was implemented after Stage A validation; see Stage B above for actual changed files and tests.

## Validation and remaining risks

- Generated Prisma Client from the reconciled schema; no database writes/migrations.
- All available infrastructure-free tests: **36 passed across 2 suites** with `jest --runInBand --selectProjects unit`.
- Test discovery: all four suites found, including `tests/auth.test.ts` and `src/__tests__/rbac.integration.test.ts`; generated dist tests are excluded.
- API normal build (`tsc`): **passed**, with no command-line compiler overrides. Fixed actual NodeNext configuration, `.js` imports, health-service export capitalization and handler Promise signature.
- Client normal build (`tsc -b` then Vite): **passed**, 572 kB main JS bundle warning remains.
- `git diff --check`: **passed**. Working-file Git hashes match all imported upstream changes except the explicitly reconciled CI/Jest/app/health files and retained screenshot; no upstream-added file is missing.
- Jest projects isolate unit tests from the upstream global Redis/Prisma setup. Integration-only setup owns queue cleanup. Deprecated globals configuration removed. TypeScript 6 remains outside ts-jest 29's advertised support range; tests pass but toolchain alignment remains a maintenance risk.
- Integration tests and CI migration execution were **not run locally**, because no isolated PostgreSQL/Redis test configuration is available. CI now runs unit and integration projects separately and uses `prisma migrate deploy` rather than db push. This CI change is source-verified, not a claim of a completed remote CI run.
- Integration environment loading no longer falls back to development `.env`; `.env.test` or explicit CI environment supplies infrastructure settings.
- Remaining Git risk: HEAD/index have not absorbed upstream history and new upstream files are untracked; do not clean the working tree. Review this overlay and align history through the separate-checkout strategy before committing.
- The saved local health response retains `ResolveFlow-api` and integer uptime; upstream uses `resolveflow-api` and fractional uptime. Naming was preserved, not silently rebranded. Runtime health response shape remains `{ data: ... }`.

No secrets were printed, no original changes discarded, no commits or deployments made.
