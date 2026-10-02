# Authoritative repository reconciliation

Current implementation update: **Stage C — session reuse protection and membership consistency**, appended below on 2026-09-26. Stage A/B checkout-state statements are historical; the validated A/B work was subsequently committed as `817bebb` and pushed to `supportiq-hardening`.

## Stage A validated — 2026-09-25

Active hardening worktree: `the dedicated SupportIQ hardening checkout`.
Branch: `supportiq-hardening`; HEAD/base: `6f5b5e237bf18e5dece0a7d1294dfb1778d4793d`, confirmed against live GitHub main. Original checkout on old main is preserved. The historical content-overlay description below refers to that original checkout, not this aligned branch.

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

Final Git state: `supportiq-hardening` at upstream `6f5b5e2`, 0 ahead / 0 behind by commits, with **18 modified and 13 untracked files**, all intentionally uncommitted. No migration/schema/Copilot/refresh-service delta exists against upstream. A final binary tracked patch, untracked file copies and complete `git status` were saved alongside the durable Stage A backup as `hardening-tracked.patch`, `hardening-untracked/` and `hardening-status.txt`. Original checkout file hashes still match the pre-alignment backup.

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


## Stage C — session reuse protection and membership consistency

Implemented 2026-09-26 in the authoritative hardening worktree, branch `supportiq-hardening`, starting at `817bebb` (upstream base `6f5b5e237bf18e5dece0a7d1294dfb1778d4793d`). These changes are intentionally **uncommitted and unpushed**. No deployment, production migration or seed was performed. Stage A/B implementation and the original checkout are preserved; Stage C adds only the reopening eligibility check needed to preserve assignment consistency across Phase 1 transitions.

### Previous risks and refresh-session model

Single-use refresh rotation rejected consumed credentials but had no family identifier to revoke a stolen credential's replacements. Membership removal/demotion was separate from assignment validation and could strand active tickets with invalid assignees.

Migration `20260926000000_refresh_sessions` adds `RefreshSession` with userId, createdAt, lastUsedAt, expiresAt, revokedAt and a small LOGOUT/REUSE_DETECTED reason enum. RefreshToken gains nullable sessionId and consumedAt; existing revokedAt, hashed token storage and indexes remain. The family ID plus each token's consumption timestamp represent session lineage; no parent-pointer or device fingerprint is needed for whole-family invalidation. No plaintext credentials, IP metadata or user-agent tracking are added.

Login and registration create a session and its first hashed opaque token together through Prisma's atomic nested create. Every replacement belongs to that same session. A session has an absolute seven-day lifetime; rotation no longer extends login indefinitely. Cookie maxAge derives from the returned session expiry instead of a second seven-day constant. Access tokens remain JWTs; refresh credentials remain opaque and cookie-only. HTTP success JSON explicitly projects user/accessToken and never session internals, hashes or refresh secrets.

### Exact refresh/reuse and concurrency policy

Rotation finds the hashed credential, locks its RefreshSession row FOR UPDATE, then rereads session and token under explicitly selected READ COMMITTED isolation. It checks current revocation, session/token expiry and token ownership, conditionally consumes the token, inserts its replacement and updates lastUsedAt in one transaction. Failed replacement insertion rolls back consumption. Storage errors are wrapped as a generic 503 with a fixed structured event, preventing raw Prisma query arguments from reaching the global error logger.

A known, consumed credential within an unexpired, unrevoked session triggers REUSE_DETECTED revocation of the entire family. The transaction returns a failure result so that the revocation **commits before** the external generic 401 is thrown. Descendants are invalid because every refresh checks the family. Unknown, malformed, legacy, expired, individually revoked and session-revoked credentials have distinct fixed internal reasons; they are not mislabeled as new reuse incidents. Externally invalid credentials receive the same generic 401. An already-expired family needs no additional reuse revocation because all its credentials are already unusable.

The policy is strict, with no replay/grace window. Concurrent presentation of the same valid token has at most one successful rotation. The waiting request observes consumption, revokes that family and fails; the winner's replacement is consequently unusable. Other login sessions for the same user remain valid. This deliberately favors containment of theft over transparent retries. A lost refresh response or simultaneous tabs sharing a cookie may require login again. React StrictMode startup effect replay was a concrete duplicate source; AuthInitializer now issues only one startup refresh per mount. Cross-tab coordination is not implemented, and the server never trusts browser coordination as its enforcement mechanism.

Retain consumed credentials for at least their session lifetime if adding a cleanup job later; deleting them early would turn detectable reuse into an unknown token. No cleanup scheduler is introduced in this phase.

### Logout and migration behavior

`revokeRefreshSession(sessionId, reason)` is reusable and idempotently revokes the family. Logout accepts even an older consumed credential to identify the current family, revokes only that session and clears the existing cookie with matching path/security attributes. Current access JWTs remain valid until their short expiry; no blacklist or Socket.IO architecture change is introduced. The userId index supports a future logout-all operation cleanly; no logout-all endpoint or device UI was added.

The SQL is additive: CREATE TYPE/TABLE/INDEX plus ADD COLUMN/FOREIGN KEY only. It contains no DROP, DELETE, TRUNCATE or user-data rewrite. Existing tokens retain their data but have null sessionId and require login again. Actual production rows were not accessed; old-schema assumptions were verified against the existing migration and an isolated legacy-data fixture. Both fresh migration deployment and upgrade with a pre-existing user/token passed. A live Prisma schema diff against the migrated test database reports no difference.

Deployment must apply the migration and move **all** auth-serving API instances to the new implementation together. Older binaries do not check session revocation, so mixed-version auth serving is not a safe rollout mode. No deployment is authorized/performed here.

### Assignment authority, cleanup and race handling

`assignment.policy.ts` centralizes assignable roles (OWNER, ADMIN, AGENT), assignment authority (OWNER, ADMIN) and active statuses (OPEN, IN_PROGRESS, WAITING). AGENT/CUSTOMER cannot assign or unassign. Ticket details expose canAssign for UI controls; the server independently checks authority. Existing OWNER membership protections and customer/tenant restrictions remain.

Membership add/remove/role changes, assignment and real status transitions acquire the organization's row lock first, then query current actor/candidate membership within the transaction. The lock is FOR NO KEY UPDATE so unrelated foreign-key checks can proceed; READ COMMITTED is pinned so statements after a waiting lock see preceding committed membership changes. Both assignment and removal/demotion follow the same protocol. If assignment commits first, removal cleans it; if removal commits first, assignment sees the absent/ineligible member and fails. PostgreSQL locking applies across API processes; this is unrelated to Socket.IO's separately documented single-process limitation.

Removal or an ineligible role change unassigns all active tickets and writes activity entries in the same transaction as membership mutation. Cleanup never changes ticket status. AGENT↔ADMIN changes retain assignment. RESOLVED/CLOSED retain the historical user reference (the existing foreign key targets User, not OrganizationMember). On reopening, the same locked transaction revalidates eligibility and unassigns with REOPENED_INELIGIBLE activity if needed. Manual/automatic assignment activity records oldAssigneeId, newAssigneeId and reason; display messages include a human-readable assignee name.

Existing ticket snapshot predicates still return 409 for stale writes. The organization lock intentionally serializes these mutations per organization, trading throughput for a simple correctness boundary. This is not a claim of database-wide serializability: direct SQL, future mutation paths or maintenance jobs bypassing the protocol can violate the application invariant. Audit/remediate any pre-existing invalid active assignments before rollout; this phase does not inspect or bulk-rewrite production ticket data. No assignment-history table or new ticket FK is introduced.

Lock semantics were checked against PostgreSQL's [row-lock documentation](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS) and [READ COMMITTED documentation](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED).

### Files changed

- Schema/migration: `apps/api/prisma/schema.prisma`; `apps/api/prisma/migrations/20260926000000_refresh_sessions/migration.sql`.
- Auth: `apps/api/src/common/utils/refreshToken.ts`; `apps/api/src/modules/auth/auth.service.ts`, `auth.controller.ts`, new `auth.security.ts`.
- Membership: `apps/api/src/modules/organizations/org.service.ts`, new `org.transaction.ts`.
- Assignment: `apps/api/src/modules/tickets/ticket.service.ts`, new `assignment.policy.ts`, new `assignment.service.ts`.
- API tests: new `apps/api/src/__tests__/auth.session.test.ts`, `assignment.policy.test.ts`, `stage-c.integration.test.ts`; updated `ticket.service.test.ts`, `rbac.integration.test.ts`.
- Client: `apps/client/src/features/auth/AuthInitializer.tsx`, new `AuthInitializer.test.tsx`; `apps/client/src/features/tickets/TicketDetailsPage.tsx`, `ticketsApi.ts`.
- This engineering record. No dependency manifest/lockfile, Copilot, retrieval, message-persistence or realtime implementation changes.

### Validation and limits

- Prisma client generation, schema validation and empty schema diff against migrated PostgreSQL: passed.
- Fresh migration deployment: all six migrations passed in a new isolated PostgreSQL 18.4 cluster at loopback port 55439. Separate legacy-upgrade schema preserved its user/token row exactly with null lineage. No development/production database was used. The isolated cluster was stopped after validation; local test logs and fixture SQL remain in the sibling supportiq-stage-c-test directory.
- API infrastructure-free tests: **112 passed in eight suites**, with detectOpenHandles. These include the entire Stage B suite and Phase 1 regression checks.
- PostgreSQL-backed tests: **45 passed in three suites** (existing auth, existing RBAC, new Stage C). New cases exercise strict refresh concurrency, descendant denial, session isolation, expiry/invalid states, production cookies, failed replacement INSERT rollback, assignment permissions, member removal/demotion, history/reopening, audit failure rollback and overlapping mutations. The overlap tests hold an organization lock until both service transactions are observed waiting in pg_stat_activity before releasing them. Prisma transactions are not mocked.
- Local full integration execution uses a temporary Jest config outside the repository to stub **only the unrelated knowledge-processing queue**, because no isolated Redis instance was available. An initial run with the queue mapping in the wrong order failed; corrected mapping passed all suites without open-handle reports. Redis/knowledge-worker integration itself was not tested. CI retains the normal PostgreSQL + Redis configuration and discovers these tests without the local stub.
- Client StrictMode regression: **2 tests passed** in Vitest/jsdom, including rejected refresh with no automatic duplicate.
- Normal API build and normal client build: passed. git diff --check: passed. Frozen lockfile verification: passed offline with ignore-scripts/lockfile-only; lockfile unchanged. Existing ts-jest/TypeScript compatibility and ~572 kB client bundle warnings remain.
- No automatic commit, push, merge, deployment or production seed. Git remains on `supportiq-hardening` at `817bebb`, with Stage C changes only (12 modified files, nine new paths/files).

This bounded Stage C session/assignment security work is complete subject to the documented rollout and Redis-validation limits; it is not a blanket claim that all P0 security/concurrency work is finished. The exact next recommended phase is **feedback/message atomicity + immutable Copilot/knowledge provenance**, before hybrid retrieval and evidence-policy redesign. That phase has not begun.


## Stage D — Copilot decision integrity and provenance

Implemented 2026-09-26 on supportiq-hardening at 817bebb. Stage C and Stage D remain uncommitted and unpushed. Stage C's 21 changed/new files were preserved before Stage D in the sibling supportiq-stage-d-baseline directory with a manifest. No deployment, production migration or Stage E work was performed.

### Decision transaction and immutable linkage

Previously the browser sent a customer message and then separately upserted feedback, permitting partial success and overwritten decisions. AiDraftPanel now calls one send command: POST /api/v1/tickets/:ticketId/copilot-runs/:runId/send. It submits only finalMessage; the server derives ACCEPTED or EDITED. The existing evaluation endpoint is rejection-only and requires a reason. A staff-only GET on the run path exposes retained provenance and its linked decision/message within ticket/tenant authorization.

The send transaction acquires the organization lock, rechecks current staff membership, locks the ticket and scoped run, checks terminal state and eligibility, compares the current selected-context fingerprint, then creates the public TicketMessage, MESSAGE_SENT activity, first-response update and CopilotEvaluation together. Any database failure rolls back all these durable writes. The ticket lock conflicts with message-insert foreign-key checks, preventing a concurrent public message from crossing context validation. READ COMMITTED is explicit. Only after commit does best-effort realtime notification run; notification failure cannot undo successful persistence. No automatic AI send was introduced.

CopilotEvaluation retains its existing unique copilotRunId and gains a unique nullable messageId relation to TicketMessage. Thus one run has at most one terminal decision and one message cannot belong to multiple runs. Version-one accepted/edited decisions retain originalReply, actual finalMessage, evaluatorIdentity, timestamp and character counts; rejected decisions retain reason and have no message. Database checks/triggers verify the suggestion and message body/ticket/sender linkage. Run snapshots and decisions reject updates; linked message body/ticket/sender also reject updates. Existing nullable user FKs may clear when a user is deleted, while separate immutable identity scalars survive. These are update-integrity controls, not tamper-proof storage against a privileged database administrator or deletion; see retention below.

The same actor retrying the same normalized text returns the original result (first send 201, replay 200), without another message, activity or notification. An identical rejection retries successfully. Different text, decision or actor returns 409. Concurrent send/send and send/reject requests serialize to one terminal result. Exact retries are checked before context staleness because the first successful message itself changes context. Legacy, abstained or changed-context runs cannot send; regenerate after 409. Staleness means a changed selected context, not an arbitrary time limit. Client duplicate-submit protection, terminal-state controls and ticket-keyed state supplement server enforcement; uncertain network failures allow retrying the same run.

Whitespace policy strips only outer JavaScript whitespace. Internal spaces and line endings remain significant. The normalized submitted body is the actual persisted body. Character counts use JavaScript UTF-16 string length; they describe editing effort, not semantic correctness. Strict request schemas reject a forged disposition.

### Bounded historical inputs and evidence

The oldest-ten-message bug is fixed: select the latest ten using createdAt descending plus id descending as a deterministic tie-breaker, then reverse the selected subset into chronological prompt order. Snapshot inputs are the exact bounded context used: title (1,000 characters), description (12,000), status, priority, customer name (200), and up to ten message IDs, sender names (200), bodies (5,000) and timestamps. Unused profile/email/assignee fields are not copied. Tone and the effective normalized retrieval query (700) are included; SHA-256 of the selected context supplies stale-run comparison. Input/evidence shapes are validated with strict schemas before persistence.

Existing sources JSON is extended rather than replaced: up to five ranked results retain document/chunk IDs, document name, chunk index, search type, score, citation label, excerpt, bounded content (12,000) and SHA-256 content hash. Bounds are applied before downstream generation/fallback consumes the content. The rendered prompt records the exact shortened evidence actually sent to providers; retained source content also supports explaining local fallback. Both requested and normalized retrieval queries are retained. Evidence survives KB chunk/document deletion or rebuild because these are text snapshots, not live foreign-key joins. Hashes identify captured content; they are not full immutable knowledge versions. Retrieval candidate pools and embedding-provider internals are not archived.

### Versions, provider trace and outcome semantics

Relational run fields include provenanceVersion, status, model, promptVersion, retrievalVersion, evidencePolicyVersion, generationPath, generationDurationMs and start/completion timestamps. JSON fields hold bounded inputSnapshot, promptSnapshot, outputSnapshot, generationConfig and providerMetadata. Current identities are support-copilot-v2, semantic-then-keyword-v1, legacy-v1, support-fallback-v1 and copilot-bounds-v1. The weak existing confidence/abstention and semantic-first/keyword-fallback behavior are preserved; legacy-v1 is not calibrated confidence.

Rendered common and actual provider request prompts (including the OpenAI system prompt) are stored for exact historical inspection. This deliberately duplicates bounded customer data in the database; application logs never include these prompts or raw provider/storage errors. Successful generated text is retained before and after trim, separately from the displayed suggestion, including generated output suppressed by abstention. Model output is limited to 2,048 tokens; unusable empty or over-32,000-character provider responses fall back with a fixed failure reason rather than storing an unbounded payload.

Provider adapters record Gemini/OpenAI requested model, returned model/version and token usage when supplied; absent metadata remains null. OpenAI temperature is 0.25; unspecified Gemini temperature remains null. Logical attempts record SKIPPED/FAILED/SUCCEEDED, sanitized reason and duration. SDK-internal retries and raw SDK response blobs are not retained. Outcome COMPLETED/ABSTAINED is independent of generationPath MODEL/LOCAL_FALLBACK; provider failure versus no configured provider is explicitly recorded. Local fallback has null model/output-token limit and its own template version. Provider-generation-skipped is recorded separately. Total duration includes authorization/context/retrieval/provider work through completion, but excludes history-persistence transaction time.

CopilotRun and its required AI_REPLY_GENERATED activity commit together after provider work, with current membership revalidated. Provider failures that reach fallback are retained; failures before run construction (for example retrieval/database outage), or failure of the atomic history write, do not create a durable failed-run row. Explainability does not promise bit-identical model replay: provider aliases/defaults can change and generation is nondeterministic. No live external model calls were made during validation.

### Migration, analytics, demo and retention

Migration 20260926010000_copilot_history is additive: new columns, unique message index, FK, check and triggers. Existing Copilot runs/evaluations survive unchanged with provenanceVersion/integrityVersion zero, LEGACY status and unknown snapshot/link fields null. No historical prompts, actor identities or message links are fabricated. Legacy records remain readable and counted by existing dashboard queries; the one-evaluation-per-run shape, dispositions, rejection reasons and source identity fields are preserved. New send requires provenance version one. A legacy undecided run can still be rejected.

Deploy migration and compatible API/client together. Older clients issuing standalone ACCEPTED/EDITED feedback receive validation failure; older server upserts cannot overwrite immutable records. No mixed-version compatibility bridge is introduced. Prisma schema diff cannot describe these custom triggers/checks; real database tests verify them.

Recruiter-demo generation remains ephemeral (runId null), and send/reject remain blocked at route and service boundaries. Demo interactions consequently do not feed AI Quality history. Manual copying into the ordinary message composer does not infer a Copilot link; only the explicit atomic send command establishes authoritative linkage.

Existing organization/ticket cascades can delete all associated runs/decisions. The product currently has no ticket-delete feature; a future delete feature must make retention explicit before exposing that cascade. Organization deletion is an intentional data-erasure boundary, tested with linked messages. Individual linked-message deletion is blocked by the NO ACTION FK; KB deletion preserves snapshots. User FK clearing preserves new actor identity scalars. Direct privileged deletion/maintenance can erase history; there is no indefinite-retention, redaction, archival, outbox or tamper-evident ledger system. Stored prompts/evidence require the same access control and future privacy/retention handling as customer support data.

### Files and validation

Stage D changes schema plus migration 20260926010000_copilot_history; AI controller/routes/schema/service; new ai.decision.ts, ai.provenance.ts, ai.provider.ts and ai.logging.ts; message.service.ts shared persistence/notification helpers; client AiDraftPanel.tsx and aiApi.ts; new ai.provenance.test.ts, ai.provider.test.ts, stage-d.integration.test.ts and AiDraftPanel.test.tsx; and this record. Stage C files remain preserved alongside these changes.

- Prisma format, validate and generate: passed. All seven migrations deployed to a fresh isolated PostgreSQL 18.4 database and to the pre-Stage-D database with seeded legacy Copilot data. Legacy run/evaluation preservation assertions passed; migrated-schema diff reports no difference.
- API infrastructure-free tests: 125 passed across ten suites, including Phase 1 and Stage B/C regressions.
- PostgreSQL integration: 68 passed across four suites, including 23 Stage D cases. Coverage includes injected real INSERT failures for each durable component, generation/activity atomicity, exact and conflicting concurrent retries, send/reject races, stale/abstained/tenant/customer denial, DB linkage/update protection, user deletion identity retention, evidence surviving live context edits and KB deletion, provider/fallback traces, HTTP 201/200 behavior, demo guards and dashboard counts.
- These tests use real Prisma transactions and PostgreSQL. Provider generation is mocked in integration tests; separate provider unit tests exercise adapter requests/metadata/failures. Realtime failure is injected to prove post-commit independence. As in Stage C, a temporary external Jest config stubs only the unrelated knowledge queue because isolated Redis is unavailable; Redis/worker integration is not covered.
- Client tests: nine passed in two suites (seven Copilot flow tests plus two Stage C startup-auth tests). API TypeScript build and client TypeScript/Vite production build passed. Frozen lockfile validation passed offline with ignore-scripts/lockfile-only; no dependency changes. git diff --check passed. Existing ts-jest compatibility warnings remain; client output is about 573 kB before gzip.
- Validation used only loopback isolated databases. Fixture SQL and logs remain in sibling supportiq-stage-d-test; the temporary PostgreSQL cluster is stopped after validation. No production data or services were changed.

The Stage D quality bar is met for new persisted runs and the authoritative Copilot send/reject flow, subject to the legacy, deletion, external-provider and failure-record limitations above. Git remains at 817bebb on supportiq-hardening with combined Stage C/D work uncommitted (19 modified files and 18 new files). No commit, push or deployment was performed.

The exact recommended next phase is **Stage E — Evidence Policy v2 + Hybrid Retrieval**: measured retrieval/evidence fixtures, vector-plus-lexical retrieval, and deterministic evidence gating to replace the weak legacy logic. Stage E has not begun. Knowledge versions, Reliability Lab, object storage and broader analytics redesign remain later work.


## Stage E — Hybrid retrieval and evidence policy v2

Implemented 2026-09-26/27 in the authoritative supportiq-hardening worktree at 817bebb. Stage C/D work was preserved in sibling supportiq-stage-e-baseline with a manifest before editing. This appendix supersedes Stage D's next-phase recommendation only; earlier engineering history remains intact. No commit, push, deployment, production migration or automatic knowledge reprocessing was performed.

### Retrieval contract and query design

The previous service returned semantic results whenever any existed; otherwise it used substring counts. Raw semantic percentages and keyword counts fed the same confidence thresholds, and providers ran before abstention. The replacement always attempts semantic and lexical candidate retrieval for a nonempty query, independently records failures, fuses their ranked lists and evaluates evidence before generation.

buildRetrievalQuery deterministically reserves up to 200 characters for title, 250 for the latest customer message within the selected latest-ten context, and 250 for description; whitespace is normalized and the final query is bounded at 700. Agent messages are excluded from customer-fact extraction. The Stage D context snapshot now includes an isCustomer marker derived from the ticket's customerId, not a guessed sender name. The actual resulting query remains in the existing immutable run snapshot. No query-generation LLM is involved. A customer message older than the latest-ten window is not included; this is an explicit bounded-context limitation.

kb.lexical.ts isolates parameterized PostgreSQL FTS SQL. English stemming and stopword removal produce query lexemes; quoted lexemes are OR-combined for recall, then ts_rank_cd ranks matches in the database with chunk-ID ties. Coverage separately measures the fraction of query lexemes present in each returned chunk. Pure numeric/date literals and a small explicit generic-support-word list do not drive topical coverage; the original values remain in the recorded query/context. This fixed an integration case where supplying an order number and date accidentally weakened otherwise relevant policy evidence. Numeric-only queries are consequently not supported lexical searches; alphanumeric identifiers such as ERR42 remain searchable. This is English retrieval, not multilingual search.

Both SQL paths filter KnowledgeChunk.organizationId AND KnowledgeDocument.organizationId and require document status READY. This also rejects inconsistent cross-tenant parent/child rows. Existing staff-only KB routes and demo write guards remain unchanged. Queries return bounded top-20 candidate sets, with document data joined in SQL; the application does not load/rank the entire KB or perform per-document fetches. Empty hybrid queries return empty results without embedding calls.

kb.vector.ts retains exact cosine-distance pgvector retrieval at 1,536 dimensions, orders by distance then chunk ID, and records raw distance and similarity (1-distance). Neither is a probability. Embedding vectors must have the expected dimension, finite values and nonzero magnitude. Embedding calls use a bounded ten-second timeout with SDK retries disabled. Logs contain fixed event names rather than raw provider/SQL errors. Missing configuration, embedding failure, vector-query failure and missing embeddings are distinct states. Vector similarity quality gates occur in the evidence policy, not an arbitrary percentage display.

### Fusion, deduplication and diversity

kb.retrieval.ts defines top-20 candidates per modality, RRF k=60 and up to five final retrieved chunks. RRF sums 1/(60+rank) across modalities; raw FTS and cosine scores are never compared to one another. k=60 is a deliberately untuned baseline that moderates rank differences; candidate bounds keep at most forty entries in memory and snapshots. Stable chunk IDs merge modality hits, repeated IDs within a list contribute only once, and fused ties use a deterministic ID comparison. Candidate fusion rank and selected rank are explicit.

Normalized lowercase/whitespace SHA-256 content hashes eliminate exact repeated text. The final selection allows at most two chunks per document, so adjacent chunks cannot act as five independent sources. It does not force unrelated documents into the result or require multiple documents to answer. Independent document count and chunk count are recorded separately. Overlapping but non-identical chunks are not semantically deduplicated; document caps and count-independent evidence rules limit their influence.

Selected-result provenance retains semantic/lexical ranks and raw scores, semantic distance, lexical coverage, fused score, matchedBy and final rank. Candidate diagnostics retain the bounded ranked identities and normalized deduplication hashes. Existing Stage D sources retain raw-text hashes, exact bounded evidence text and an evidenceEligible flag. Thus weak retrieved evidence remains inspectable even when excluded from the prompt. Only eligible evidence enters the generated prompt/local fallback. The two hash purposes are distinct: source contentHash covers the captured text; candidate contentHash covers normalized text used for deduplication.

### Deterministic evidence rules and fixture selection

The dedicated evidence-policy.ts returns decision, reason, evidence strength, eligible evidence, missing facts, warnings and generationAllowed. Chunk quantity never increases strength by itself. A chunk qualifies through any of these explicit rules:

- Semantic similarity at least 0.82; or
- Lexical coverage at least 0.60 with a lexical result; or
- Semantic similarity at least 0.65 AND lexical coverage at least 0.35.

STRONG requires meaningful support from both modalities on at least one eligible chunk. Otherwise eligible evidence is LIMITED; no eligible evidence is INSUFFICIENT. The existing database LOW/MEDIUM/HIGH enum is retained solely as a compatibility projection of those levels, not an answer probability. The UI now labels these values Evidence: Insufficient/Limited/Strong, removes source-score displays from the draft panel, and shows ranked results in KB search. Abstention displays the actual reason rather than incorrectly calling every case missing knowledge.

Thirty named deterministic fixtures cover exact policies/identifiers, semantic paraphrases, weak overlap, duplicate chunks, one useful result amid noise, source agreement, narrow conflicts, empty KB, each degraded modality, missing/supplied customer facts, ambiguous queries and threshold boundaries. All thirty pass. Initial boundaries separate the fixture examples: semantic-only 0.80 is rejected while 0.84 is accepted, lexical coverage 0.55 is rejected while 0.65 is accepted, and agreement cases straddle the 0.65/0.35 cutoffs. A fixture sweep demonstrates that lowering the semantic-only threshold to 0.60 admits known fixture negatives.

These are deliberately constructed regression fixtures with supplied semantic scores, not a measured production embedding corpus, blinded benchmark or calibrated confidence model. Real PostgreSQL tests separately verify lexical tokenization/ranking/coverage. Live embedding relevance and threshold generalization remain unvalidated; these constants are provisional, conservative policy choices constrained by the fixtures. Changes to embedding models/domains require a representative evaluation set and a policy-version change rather than treating these numbers as universal. No LLM reranker or production-quality calibration claim is made.

### Gating, clarification, conflicts and degradation

ANSWER_SUPPORTED is the only decision that permits generateWithProviders and its existing Gemini -> OpenAI -> local-template fallback chain. INSUFFICIENT_KNOWLEDGE, NEEDS_CUSTOMER_INFO, CONFLICTING_KNOWLEDGE and RETRIEVAL_DEGRADED all persist a run with null suggestion/output, generationPath SKIPPED_EVIDENCE and providerCallAttempted false. The rendered prompt is retained as the planned context, while requests is empty to make clear it was not sent. Four service-level gating tests explicitly assert no provider call and no customer-facing fallback. An embedding request for retrieval is distinct from a generation-provider request.

Healthy retrieval with no qualifying evidence means INSUFFICIENT_KNOWLEDGE. Any incomplete/unavailable modality with no qualifying evidence means RETRIEVAL_DEGRADED, avoiding a false clean knowledge miss. A working modality with sufficient evidence may still answer with a reduced-coverage warning. Both modality statuses/latencies, overall latency, candidate/fused counts, missing embedding count where knowable, unique documents and selected chunks are persisted in Stage D providerMetadata; the evidence decision/level/reason are also persisted in outputSnapshot. Versions are hybrid-rrf-v1, evidence-v2 and support-copilot-v3. Historical strings/records are not rewritten.

Customer clarification is intentionally narrow: explicit require/required/requires/must-provide phrases can identify order number and purchase date requirements; bounded customer text is checked for those facts. Missing facts block generation and are distinct from missing KB. The policy is not a general information-extraction system. Clearly different explicit refund windows in days across selected documents block generation; arbitrary semantic contradictions, plan applicability, negation and policy effective dates are not reliably understood. No freshness/version metadata exists yet to resolve competing sources automatically. Human review remains necessary even for ANSWER_SUPPORTED.

Provider failure after an allowed generation retains the Stage D operational failure/fallback trace; abstention cannot fall through to a generic customer reply. Dashboard metrics preserve legacy records and dispositions, while evidence-v2 RETRIEVAL_DEGRADED and NEEDS_CUSTOMER_INFO runs are excluded from KB-gap signals. Broader source-quality/gap analytics are deferred. Pending Stage D runs use their original context-fingerprint shape so the new isCustomer marker alone does not invalidate them. Atomic send, immutable decisions and exact retries remain unchanged.

### Database provisioning and processing completeness

Migration 20260926020000_hybrid_retrieval adds a GIN index on the exact to_tsvector('english',content) expression and nullable KnowledgeDocument.semanticIndexedChunks. Legacy null means unknown, not zero. Processing clears the count and records actual successful embeddings while READY means lexical content is usable. When semantic querying is available, the database counts READY chunks lacking vectors and reports INDEX_INCOMPLETE instead of a clean semantic miss. With an unconfigured/failed provider, coverage is explicitly unknown and the subsystem is degraded. No automatic re-embedding/backfill occurs.

Runtime extension/column DDL is removed. The migration provisions pgvector and the existing embedding vector(1536) column only if the server has the extension installed/available. A deployment with available pgvector needs extension/DDL privileges for migration; errors are not silently ignored. A database without the installed extension receives FTS and remains explicitly lexical/degraded. After an operator later installs pgvector, prisma/operations/enable-knowledge-vector.sql supplies the same idempotent provisioning outside requests. The vector column remains SQL-managed, as before; no approximate index is added for this small exact-search deployment. Increasing scale will require measured vector-index design. Embedding ingest/query model configuration must remain consistent; this phase does not version or migrate legacy embedding models.

Compose and CI now use the documented pgvector/pgvector:0.8.6-pg16 image instead of plain PostgreSQL 16. CI sets SUPPORTIQ_TEST_PGVECTOR=1, making the real-vector SQL test mandatory. The local PostgreSQL 18.4 installation has no vector extension and cannot execute that test. No container image was deployed/pulled here. Existing Alpine-origin database volumes should be backed up and compatibility/collation checked before operators change their database image. Production hosting/extension privileges were not accessed. The FTS index is a normal migration index build; plan a maintenance window on large write-heavy tables rather than assuming zero-lock online creation.

Design references: [PostgreSQL FTS parsing/ranking](https://www.postgresql.org/docs/16/textsearch-controls.html) and [pgvector distance/provisioning and supported images](https://github.com/pgvector/pgvector). The implementation uses built-in English text search and exact vector queries; no Elasticsearch or external vector store was added.

### Validation, performance and remaining limits

- Prisma format/validate/generate passed. All eight migrations applied to a fresh isolated database; Stage D and seeded legacy databases upgraded successfully. Two pre-existing Copilot runs and evaluations compared byte-for-byte unchanged across the Stage E migration. No historical data rewrite or knowledge reprocessing was performed.
- API unit tests: 168 passed in thirteen suites, including thirty policy fixtures, service-level generation gates, independent retrieval failure behavior, fingerprint compatibility, prior security and lifecycle regressions.
- PostgreSQL integration: 78 passed in five suites, one explicitly skipped local pgvector test. Ten new real-PostgreSQL Stage E cases cover FTS ranking/stemming/stopwords/identifier handling, tenant/status filters, parameter safety, lexical retrieval during embedding failure, provenance, provider gating, customer clarification, explicit conflicts, customer-only query context and the FTS index. Stage C/D transaction tests remain included. External generation/embedding calls are mocked; database transactions and FTS SQL are real.
- The vector test is committed and required in CI: it uses real vector SQL with synthetic orthogonal vectors to test ordering, tenant filtering, fusion and incomplete coverage. It has NOT been executed locally, and CI has not been run/pushed. Neither mocked semantic fixtures nor synthetic vectors establish real embedding relevance. The available local environment therefore validates the lexical/degraded path, not the full deployed hybrid path.
- As in Stage C/D, local integration uses the external temporary Jest config to stub only the unrelated knowledge-processing queue because isolated Redis is unavailable. Queue/worker integration remains untested.
- Ten client tests passed, including evidence terminology and specific abstention reason display, along with Stage D retry/terminal controls and Stage C startup auth.
- API TypeScript and client TypeScript/Vite builds passed; frozen lockfile validation passed offline without dependency changes. Existing TypeScript/ts-jest compatibility and approximately 572 kB client bundle warnings remain. git diff --check passed after removing one trailing blank line.
- EXPLAIN (ANALYZE, BUFFERS) on a rollback-only fixture of 10,000 chunks (100 matching) used KnowledgeChunk_content_fts_idx, a bitmap heap scan and top-N sort. It returned twenty rows in approximately 3.6 ms execution plus 3.4 ms planning locally. This is one warm synthetic query, not a production latency guarantee. Its JSON plan is in sibling supportiq-stage-e-test/fts-explain.json. No local vector query-plan measurement is possible without pgvector.
- Logs, migration comparisons and fixture artifacts are retained in supportiq-stage-e-test. Only isolated loopback PostgreSQL was used; the temporary cluster is stopped after validation.

Stage E changes 29 paths relative to the saved Stage D baseline: migration and optional provisioning SQL; schema; kb.retrieval/lexical/hybrid/vector/service/processing; evidence-policy and AI service/provenance/decision compatibility; dashboard; client draft/search components and their API types; CI/Compose; gating, policy, retrieval-health, provenance, Stage D/E integration and client tests plus the thirty-fixture file; and this appendix. No earlier-stage work was discarded.

This bounded implementation is complete with the explicit pgvector execution, live-embedding calibration, English-only rules, narrow conflict/fact detection and Redis-validation limits above. No Stage F work was started. The exact next phase is **Stage F — Immutable Knowledge Versioning + Publication Provenance**, making historical Copilot evidence traceable to immutable published knowledge and preparing replay-based evaluation. Before deployment, run the mandatory pgvector-enabled CI suite and assess initial policy constants against representative embedding results; neither has been claimed complete here.

## Stage F — Immutable knowledge versions and publication provenance

Implemented and validated 2026-09-27/28 in the authoritative `supportiq-hardening` worktree at `817bebb2fed91d7437fefc85cb94eb9da11f3829`. The sibling `supportiq-stage-f-baseline` preserves the 56 dirty/new files present before this phase, with a manifest. Earlier Stage C–E work remains intact and uncommitted. This appendix supersedes Stage E's next-phase recommendation; earlier appendices remain historical records. No commit, push, deployment, production migration or Stage G implementation occurred.

### Domain and product decision

Previously, a logical KnowledgeDocument owned mutable chunks and reprocessing deleted/recreated them. The domain is now KnowledgeDocument → KnowledgeDocumentVersion → KnowledgeChunk. The document retains its identity, compatibility metadata and a `currentPublishedVersionId`; it also has `archivedAt` and a server-managed next-version counter. Each version owns upload metadata, an opaque storage reference, uploader identity, timestamps, source/extracted-text hashes, extracted text, processing state, embedding completeness/model and its own chunks. Chunk IDs and version IDs are separate identities. Embeddings remain SQL-managed vector columns on version-owned chunks.

**Every new version, including v1, requires explicit OWNER/ADMIN publication.** Uploading and successful processing never immediately change production evidence. This gives administrators one understandable prepare → publish workflow and a staging boundary for later evaluation. Staff can read version history; customers cannot access the KB or provenance endpoints. Existing organization authorization and demo guards remain, with fresh role checks under the organization lock for mutations. No AI suggestion is automatically sent.

The lifecycle is `UPLOADED → PROCESSING → READY → PUBLISHED → SUPERSEDED`, with `FAILED` and explicit processing retry for unsuccessful unpublished versions. READY means extraction/chunking succeeded and lexical retrieval is usable. Zero or partial embeddings are represented explicitly and remain publishable under Stage E's degraded-retrieval policy. Published versions are never reprocessed; changing them requires a new upload. Previously published content remains retained when superseded.

### Creation, processing and concurrency

Creation locks the organization and existing logical document, allocates `nextVersionNumber`, creates the version, increments the counter and writes activity in one transaction. A database unique constraint on `(documentId, versionNumber)` and a positive-number check provide additional enforcement. Concurrent distinct uploads receive unique monotonic numbers; numbers are not supplied by clients or recycled after maintenance deletion.

SHA-256 covers exact uploaded bytes, normalized extracted text and each chunk's exact content. Processing verifies the stored source hash and parses that same in-memory byte buffer, avoiding a second file read between verification and extraction. Upload filenames use UUIDs. An identical source hash within the same logical document returns the existing version without creating chunks or repeating completed embedding work. This includes prior superseded versions: an identical historical upload does not create a new rollback publication. A changed file whose extracted text is identical can still create a version; cross-version chunk embedding reuse is deferred. Legacy/seed source bytes remain explicitly unknown rather than guessed.

Workers receive an explicit version ID and claim a 30-minute lease with a unique processing token under the document lock. Chunk creation, completion and failure transitions verify that token. Embedding writes also require the owning unpublished version and matching token. A stale worker cannot overwrite a reclaimed attempt's chunks, mark its result FAILED or alter a publication. The race test pauses one worker, rejects a duplicate active lease, expires/reclaims the lease, completes the new attempt and proves the old completion leaves READY/chunks unchanged.

Processing touches only the target unpublished version. A failed replacement leaves the current pointer and its chunks untouched. Completion/failure and upload activities retain document/version/number/actor/transition without logging content; worker activities have no interactive actor. The installed pdf-parse v2 adapter now uses PDFParse/getText/destroy, loaded only for PDF input; TXT/Markdown parsing does not eagerly load its native dependencies.

### Publication and database invariants

Publishing locks and reauthorizes the organization/document, validates the target version and requires the caller's observed `expectedCurrentVersionId`. In one transaction it supersedes the previous publication, publishes the READY target, changes the current pointer and records both transitions. Concurrent different publications from the same observed pointer produce one success and one 409. Repeating the already-current target is idempotent; publishing an older numbered version is rejected. An injected activity INSERT failure rolls back the pointer and both version states.

A partial unique index allows at most one PUBLISHED version per document. Deferred constraint triggers ensure a non-null current pointer refers to that document's PUBLISHED version after the transaction. Application transactions enforce the full transition and required audit; the constraints are not a replacement for the service authorization layer. The database also rejects changes to published version metadata/content and published chunks, including embeddings; it allows only the PUBLISHED → SUPERSEDED status transition. Version identity, number, source hash and storage reference are immutable from creation. Chunk triggers check matching document/organization/version and content hash and lock their parent against concurrent publication.

Published/superseded versions and their logical documents cannot be hard-deleted while their organization exists. Unpublished, unreferenced versions can be deleted by maintenance; there is no new draft-delete API. Organization deletion remains the existing explicit whole-tenant erasure boundary, including retained knowledge and Copilot history. The corrective migration `20260927011000_knowledge_source_cascade` makes the two source-link retention FKs deferred: integration exposed otherwise-valid whole-organization cascades checking nested deletion order too early. This preserves standalone deletion protection while allowing the existing erasure transaction. Its behavior passed the full integration cleanup, including runs with linked knowledge.

### Current retrieval and historical provenance

`kb.scope.ts` captures active published version IDs once per hybrid request. Semantic candidates, lexical candidates and embedding-coverage counts use the same organization/archive/version predicate and scope. Production routes cannot accept arbitrary version overrides. A new request sees the new publication after commit. A request already in flight can finish against its captured previous publication; both modalities stay on that same as-of-start version set instead of mixing publications. Archive checks remain in each query, so archival may remove a captured source during the request. No draft or merely READY version is visible. The internal scope boundary permits a later evaluation implementation without exposing historical overrides now.

New Copilot evidence snapshots retain all Stage D/E text, hashes, eligibility and ranking metadata and now include `documentVersionId`, `versionNumber` and `publishedAt`. Retrieval metadata is `hybrid-rrf-published-v2`; `evidence-v2`, prompt behavior, RRF and generation gates remain unchanged. New `CopilotKnowledgeSource` rows link every persisted retrieved source snapshot (including ineligible diagnostic candidates) to its chunk and version in the same run/history transaction. Database checks enforce published source lineage and tenant matching. Immutable snapshots remain alongside relational links.

The tenant-authorized service `resolveCopilotKnowledge` and staff endpoint `GET /api/v1/organizations/:orgId/kb/copilot-runs/:runId/sources` resolve historical title/version/publication/chunk identity and return the original snapshots, current version, archive/current flags, source/text-change indicators and counts of distinct chunk hashes added/removed. These counts are a simple set comparison, not an ordered text diff or semantic comparison. Legacy runs have no invented relational linkage; `legacyVersionUnknown` distinguishes them from new runs with legitimately no evidence. Existing document-level source-quality aggregation remains compatible; the analytics redesign is deferred.

### Routes and client behavior

Existing `POST .../kb/documents` creates a document plus v1. `POST .../kb/documents/:documentId/versions` uploads a replacement under the same identity. Version history, explicit version processing and explicit version publication are available under that document. Publication requires `{ expectedCurrentVersionId: string | null }`. Existing `DELETE .../kb/documents/:documentId` now archives rather than destroys knowledge: normal lists/retrieval exclude it while staff can resolve its historical provenance. Restore and an archive-management UI are not introduced.

The KB list shows current publication number/date and latest staged status. Expandable history shows retained versions; OWNER/ADMIN can upload replacements and publish READY versions. Publication conflicts are shown without silently retrying against a newer pointer. Latest UPLOADED/FAILED attempts offer processing retry. The backend can explicitly retry an expired PROCESSING lease; automatic lease recovery and a specialized stalled-job UI remain deferred. Copilot source cards carry their captured version number. Raw chunks/embedding internals are no longer the default document view.

### Migration and preservation

`20260927010000_knowledge_versions` is additive except for replacing the old per-document chunk-index uniqueness with per-version uniqueness. It creates deterministic `legacy-version-<documentId>` version-1 IDs, attaches every existing chunk without changing its ID/content/vector, and initializes the next counter to 2. Existing READY documents with chunks become current PUBLISHED v1; READY without chunks becomes FAILED; FAILED stays FAILED; UPLOADED/PROCESSING become UPLOADED and require explicit requeue. Old queue payloads without a version ID are rejected, never guessed.

SQL cannot recover original file bytes or a trustworthy historical publication event. Migrated `sourceHash` and `extractedText` are null. The migrated content hash covers ordered newline-joined stored chunks, which is not necessarily the original extraction because chunk overlaps may exist. Migrated `publishedAt` uses the prior document `updatedAt` as a legacy proxy, **not an attested original publication time**. New publications have actual transition timestamps and source/text hashes. No old Copilot snapshots, decisions or evidence-policy version strings are rewritten; old chunk IDs are not sufficient evidence to guess what an earlier run used.

All ten migrations are applied in the fresh isolated database. A repeatable integration test builds the actual pre-F migration chain in a fresh temporary schema, seeds legacy statuses/chunks/run/evaluation/message records, applies both F migrations, and explicitly compares unchanged IDs/content/history and status mappings. It additionally checks exact vector preservation when CI requires pgvector. Independent before/after comparisons against the representative legacy database verified **4 documents, 4 chunks, 2 Copilot runs, 1 evaluation and 5 messages**, including every original column/snapshot, plus all four new chunk/version relationships. No re-embedding was required.

Seed helpers now construct synthetic versioned publications transactionally; seed file-byte hashes remain unknown. Seed reset uses the existing organization-erasure boundary rather than trying to destroy retained publications individually.

### Validation and retrieval performance

- Prisma format and validate passed. Generate passed after the integration process released its Windows engine DLL (the initial concurrent attempt hit a file lock). API TypeScript build and client TypeScript/Vite production build passed.
- API unit tests: **168 passed / 13 suites**. PostgreSQL integration: **96 passed / 7 suites, 2 explicitly skipped local vector cases**. The final migration-only rerun also passed after replacing deprecated concurrent queries on one pg client with sequential reads.
- Stage F integration covers concurrent version allocation/publication, hash duplicates/tampering, staging, failure preservation, zero embeddings, publication readiness, activity rollback, shared retrieval scope, historical links/snapshots/comparison, archive, immutable-row protection, permissible failed-version maintenance deletion, upload HTTP identity, customer/tenant/demo denial, worker lease fencing and queue-failure persistence. Prior C/D/E regression suites remain included.
- Client: **14 tests passed / 3 suites**, including version history/publication pointer, visible conflict, same-document replacement upload and staff-only controls. A first local worker startup timed out before executing tests; a single-thread-worker retry and final run passed. A separate real minimal PDF smoke test passed against the installed PDFParse v2 and compiled extraction helper.
- Frozen lockfile validation passed offline with ignore-scripts/lockfile-only; dependencies and lockfile were not changed. `git diff --check` passed. Existing Prisma configuration deprecation, ts-jest/TypeScript compatibility and ~574 kB client-bundle warnings remain.
- Real pgvector is unavailable on the local PostgreSQL 18.4 installation. **Both Stage E and Stage F vector integration tests remain mandatory under `SUPPORTIQ_TEST_PGVECTOR=1` in the pgvector CI service**, as does the migration's vector-preservation assertion. They have not run locally or in remote CI during this no-push phase. Synthetic vectors validate SQL lineage/filtering, not live embedding relevance.
- Local integration uses real PostgreSQL/Prisma, transactions, migrations and FTS. The external Jest configuration still substitutes the unrelated Redis queue; Stage F explicitly mocks enqueue success/failure and embedding writes while exercising actual extraction/chunk persistence. BullMQ transport/worker lifecycle and live providers remain unvalidated.
- A rollback-only **10,000-chunk / 100-match** fixture measured the production lexical SQL with version joins. After clearing the GIN bulk-insert pending list, three warm executions were **2.184 / 2.009 / 2.063 ms**, versus **1.673 / 1.588 / 1.649 ms** for the same query without version joins/predicates. The versioned plan used the FTS GIN index together with document/version indexes and returned 20 rows. Initial planning was 5.261 ms, then ~0.7 ms. The freshly inserted, unmaintained fixture initially chose a document-index scan filtering 9,900 rows and took **69.5 ms**; GIN pending-list/statistics maintenance materially affects that plan. These are local synthetic measurements, not a production SLA or proof for all tenant sizes. Vector query plans and very large publication-ID sets remain unmeasured.
- Test logs, migration snapshots, before/after file inventory and query plans/scripts are retained in sibling `supportiq-stage-f-test`. Only isolated loopback databases were used; the temporary PostgreSQL cluster is stopped after final validation.

### Limits, changed areas and next phase

Local source files remain on disk behind a storage reference; UUID uploads and application rules prevent overwrite, but privileged filesystem changes are outside database immutability. Extracted text/chunks/snapshots are retained in PostgreSQL. Duplicate/rejected uploads can leave unused local files; cleanup/object storage is deferred. Queue enqueue is deliberately outside the upload transaction: an unavailable queue returns a recoverable error with the version still saved, requiring retry. There is no outbox, automatic expired-lease sweeper, distributed ingestion protocol, malware scan, replay, semantic diff or rollback-to-old-publication workflow. Long jobs can exceed the 30-minute lease and duplicate compute on reclaim, but fencing protects persisted state. Version history and captured publication-ID sets are not yet paginated for large installations.

Stage F changes **36 paths relative to the saved Stage E baseline**, including this appendix: schema, two migrations, seed/helper; shared hash; version/processing/queue/upload/parser/service/controller/routes; shared retrieval scope and semantic/lexical/hybrid contracts; Copilot provenance/linkage/resolution; KB list/history/upload and Copilot source UI/API types; Stage F/migration/client tests plus necessary Stage D/E/retrieval fixtures. The exact path inventory is in `supportiq-stage-f-test/changed-files.json` (documentation is included at completion). Previous security, feedback, ticket and analytics work remains present.

The Stage F quality bar is met for the locally validated lexical/degraded path: publishing v2 changes future retrieval while old runs keep exact v1 content/identity, and failed replacement processing leaves v1 serving. Full deployed hybrid-path validation still requires the mandatory pgvector-enabled CI suite and the existing external-provider/Redis checks; no broader production-readiness claim is made. Git remains on `supportiq-hardening` at `817bebb`, with the combined Stage C–F delta uncommitted: 36 modified tracked files, 39 untracked files, and nothing staged.

The exact recommended next stage is **Stage G — Knowledge Issues + Source Health + AI Quality Analytics**: turn existing failure signals into persistent, tenant-scoped operational knowledge issues tied to immutable document versions, with explicit issue lifecycle and version-aware source health. Preserve existing feedback/provenance/evidence gates; replay verification and Reliability Lab remain later phases. **Stage G has not begun.**

## Stage G — Knowledge Issues and AI quality intelligence

Implemented and validated 2026-09-28 on the authoritative `supportiq-hardening` worktree at `817bebb2fed91d7437fefc85cb94eb9da11f3829`. Before editing, the 75 accumulated dirty/new Stage C–F files were copied to sibling `supportiq-stage-g-baseline` with a manifest. Earlier appendices remain historical records. No commit, push, deployment, production migration or Stage H implementation occurred.

### Baseline findings and preserved systems

The prior dashboard loaded all organization Copilot runs into application memory, grouped gaps by a lowercased topic, counted repeated chunks as source uses and treated any edit/rejection as negative evidence against every retrieved document. This phase replaces that runtime aggregation with the shared quality service used by both the existing dashboard and the new AI Quality area. Existing ticket dashboard behavior, Copilot runs/decisions, immutable snapshots, knowledge publications, evidence-v2 and generation gates remain authoritative. Compatibility dashboard percentage fields retain their previous integer rounding; the new quality API returns explicit rate objects with one-decimal percentages.

Inspection also found a concrete Stage F regression: the hybrid function captured a publication scope but its lexical helper call omitted that scope, while the semantic helper received it. The lexical call now receives the same scope, and the regression test asserts both helper arguments. This fixes publication consistency rather than redesigning Stage F. Previous direct-helper scope tests had not caught the missing hybrid call argument.

### Signal taxonomy and conservative classification

`issue.classification.ts` is the independently tested deterministic domain classifier, version `knowledge-signal-v1`. It separates human feedback, policy outcomes and recorded operational failures. The SQL facts used by analytics implement the same classification rules and are parity-tested against the pure classifier. Analytics derive from immutable runs/evaluations directly, so a missed issue-ingestion attempt does not reduce quality failure counts.

- Explicit EDITED/REJECTED feedback with WRONG_KNOWLEDGE, INSUFFICIENT_KB, IRRELEVANT_EVIDENCE or UNSUPPORTED_CLAIM qualifies. ACCEPTED does not become a failure even if legacy data has an inconsistent reason.
- Evidence-v2 abstentions with INSUFFICIENT_KNOWLEDGE or CONFLICTING_KNOWLEDGE qualify. Their deterministic policy classification takes precedence over later feedback on that same abstained run.
- NEEDS_CUSTOMER_INFO and RETRIEVAL_DEGRADED are explicitly excluded, including when inconsistent human feedback is attached. BAD_TONE, MISSING_CUSTOMER_CONTEXT, INCORRECT_RECOMMENDATION, INCOMPLETE_RESPONSE, OTHER and an unexplained edit do not independently establish a knowledge problem.
- Legacy abstention alone is not sufficient evidence of a KB defect. Legacy explicit qualifying feedback can still create an issue, without inventing source-version identity.
- Recorded embedding/vector/lexical failures and failed generation-provider attempts are counted as operational signals, not automatic Knowledge Issues. Provider failure alone cannot create a knowledge failure. A genuine explicit human knowledge diagnosis and an operational event may coexist on a supported run; their counts are not mutually exclusive. Socket/network failures and errors that never persisted a run are outside these historical analytics.
- NOT_CONFIGURED and other retrieval coverage statuses are separately visible in the retrieval-health breakdown; they are not all mislabeled as provider exceptions. All deterministic policy outcomes, including degradation and clarification, have separate distribution counts.

### Persistent issue domain, grouping and counts

The additive schema introduces KnowledgeIssue, KnowledgeIssueSignal, KnowledgeIssueSource and KnowledgeIssueHistory. An issue owns workflow state, an optimistic revision, tenant/grouping key, normalized topic/title, classification reason, current staff membership assignment, candidate knowledge version, fix note and publication/dismissal metadata. Signals link to immutable CopilotRun records and therefore their ticket and terminal evaluation. Source links reference verified Stage F version lineage. History is a separate internal table, not customer-facing ticket activity.

A unique `copilotRunId` permits **one qualifying knowledge signal per run**, independent of how many chunks it retrieved. The initial deterministic abstention classification remains stable if that run later receives a terminal decision. A supported run becomes eligible for a signal when qualifying terminal feedback arrives. Signal rows carry classifier version, reason, the run's creation timestamp and actual ingestion timestamp.

Grouping is tenant + SHA-256 of classifier version, failure category, normalized full topic and sorted selected source-version identities. Topics are NFKC-normalized/lowercased with punctuation/noise and whitespace cleanup; common greetings are removed while product identifiers, numbers, hyphens, underscores and internal periods are retained. An empty normalized topic uses run identity to avoid merging unknown problems. The current structured topic originates from the ticket title, so this remains conservative lexical grouping, not semantic understanding. Different identifiers, source versions, failure categories, wording or source combinations remain separate. This deliberately under-merges rather than guessing that different failures are the same problem. There is no LLM clustering call.

Source snapshots only establish source links after matching the run's immutable CopilotKnowledgeSource relationships. Legacy/malformed/unselected source claims cannot create guessed relational provenance. The issue's reason is common to its group rather than a synthetic weighted dominant-reason score.

Counts are **derived from signal/run relationships**, not permanently incremented counters: `signalCount` is the number of linked runs; `affectedTicketCount` is distinct ticket IDs. First/last seen correspond to the earliest/latest run creation time. Issue creation and history timestamps separately record when detection/workflow actions actually occurred. Severity is transparent and lifetime-based: LOW for 0–2 affected tickets, MEDIUM for 3–5, HIGH for 6+. Repeated experiments on one ticket do not increase severity. Lists rank distinct tickets first, then signals and last seen; no probability or causal risk score is claimed.

### Lifecycle, assignment, proposed fixes and publication

The pure policy permits DETECTED → REVIEWING → FIX_PROPOSED → PUBLISHED. Active states can be dismissed; FIX_PROPOSED/PUBLISHED/DISMISSED can return to REVIEWING. Arbitrary jumps are rejected. `VERIFIED` exists in the database for the future verification service but no current transition/API/UI can set it. Publication is explicitly not verification.

OWNER/ADMIN mutations take the organization lock, recheck current role/demo restrictions and require `expectedRevision`. Concurrent conflicting commands yield one success and one 409. Issue mutation and its required internal history entry commit together; an injected history INSERT failure proves status/assignment/revision rollback.

Assignments accept only current OWNER/ADMIN/AGENT membership in the same tenant. Membership demotion/removal clears issue assignment and records ASSIGNMENT_REVOKED inside the existing membership transaction, using the same organization lock as assignment. This extends Stage C consistency to the new domain. Read-only agents can inspect issues and analytics; customers cannot.

FIX_PROPOSED requires a same-tenant, non-archived, unpublished READY version and a bounded explanatory note. It does not upload, modify or publish knowledge. The candidate FK automatically reflects the version's actual publication status/time when Stage F publishes it. The workflow deliberately remains FIX_PROPOSED until an admin records PUBLISHED; that command verifies the candidate is still the current non-archived publication and copies its real publication time into the issue. This is the explicit publication-relationship record in internal history. No automatic success/verification claim is made.

Dismissal requires a reason (NOT_A_KNOWLEDGE_PROBLEM, DUPLICATE, EXPECTED_BEHAVIOR or OTHER), actor, timestamp and note. Dismissed issues are retained and the same grouping key receives future signals instead of creating endless duplicate issues. Neither dismissal nor publication automatically reopens on one signal. Detail exposes recurrence after the recorded publication and admins can return the issue to REVIEWING. Failures attributed to a different newly published version may form a separate group by design; automated merging/reopening is deferred.

### Ingestion, failure isolation and historical reconciliation

After the Stage D generation or terminal-decision transaction commits, a safe synchronous post-commit helper attempts signal derivation. It locks the organization, reads the authoritative run/evaluation, finds or creates the stable issue, inserts its unique signal and linked versions, and records initial detection in one transaction. Repeated exact decision retries can also repair a previously missed signal. Unique constraints plus the shared lock make concurrent ingestion idempotent.

Analytics errors log only a fixed event plus organization/run IDs and do not escape to the already-successful customer operation. Tests inject real signal INSERT failure after terminal rejection and a post-commit analytics lookup failure after sending a reply: the authoritative evaluation/message remain successful. There is no Socket.IO work or analytics transaction inside the message/decision transaction.

Until Stage I adds a durable outbox, a process crash between commit and ingestion can miss an issue signal. The repair boundary is the tenant-scoped `reconcileKnowledgeSignals` service and explicit maintenance command, run from `apps/api`:

```text
pnpm exec tsx prisma/reconcileKnowledgeIssues.ts <organizationId> [afterId] [limit]
```

One invocation processes at most 500 runs (default 100), returns scanned/created counts and a cursor, performs no AI-provider calls and has no customer-facing side effects. This is an operator command, not an unauthenticated HTTP endpoint or an automatically scheduled job. Resume the returned cursor to finish a pass; periodically start again without a cursor to find late terminal decisions on older runs. Reruns are safe. A failed batch can be retried because each per-run transaction is atomic.

The retained isolated historical database contained 35 runs across 28 organizations at reconciliation time. The first complete pass created **3 signals**; the second scanned the same 35 runs and created **0**. Full Copilot rows compared unchanged before/after. Separate integration fixtures exercise bounded cursors, late decisions and repeated/concurrent ingestion. No production backfill was run. Counters need no repair because they are query-derived; a future classifier-version change requires a deliberate migration/reclassification plan rather than silently rewriting issue workflow history.

### Version-aware source health and rate definitions

A source use means **one evidence-eligible, relationally verified document version per CopilotRun**, regardless of its number of chunks. Unselected diagnostic candidates and legacy snapshots without verified version identity are excluded from version-specific health. This avoids guessing that the current publication supplied a historical answer.

Attribution rules are intentionally narrower than issue creation:

- Accepted/edited/rejected usage is counted without implying source correctness.
- BAD_TONE and arbitrary edits/rejections incur no knowledge penalty.
- INSUFFICIENT_KB/INSUFFICIENT_KNOWLEDGE can create a gap but do not establish that an existing source is bad, including when no source exists.
- WRONG_KNOWLEDGE and IRRELEVANT_EVIDENCE plausibly implicate a source only when exactly one eligible verified version supplied evidence. Multiple selected versions make that attribution ambiguous, so no individual source is blamed automatically.
- CONFLICTING_KNOWLEDGE policy can implicate the selected versions collectively.
- UNSUPPORTED_CLAIM creates an output-grounding issue but is not automatically blamed on a retrieved document.
- Retrieval degradation/customer clarification produce no source penalty.

Version rows return use/evaluated/accepted/edited/rejected counts, attributed failure counts, specific wrong/relevance/conflict counts, current/superseded status and linked issue count/filtering. v3 never inherits v2's numerator/denominator. `observedFailureRate` is attributed **evaluated** failures / evaluated uses; `signalRate` is all attributed human/policy signals / all uses. Both return numerator, denominator and percentage, with zero for an empty denominator. Fewer than ten evaluated uses is labeled Limited data. Ordering uses observed counts, not dramatic small-sample percentage rankings. These are observed associations, not proof a publication improved outcomes.

### Shared analytics, UI, time windows and query strategy

The existing dashboard delegates its AI section to the same quality services; its old unbounded Copilot aggregation and broad source penalties are removed. The new `/quality` UI has Overview, Knowledge Issues, Source Health and Copilot Runs. The organization selector excludes customer memberships. Rates always show counts; policy outcomes separate missing inputs, insufficient/conflicting knowledge and degradation. Recorded retrieval status combinations, human reasons, knowledge failures/distinct tickets, operational failures and mean recorded duration/sample count are available. Issue detail includes sources, authorized ticket/run links, candidate state, current assignee, signal pagination and internal history. Run details use the existing authorized historical-run endpoint. No Reliability Lab UI is introduced.

Quality overview/source/run endpoints under `/api/v1/organizations/:orgId/quality` default to the last 30 days, support 7/30/90-day presets and validated custom ISO `from`/`to` ranges of at most 90 days. Windows are inclusive-from/exclusive-to and filter **CopilotRun.createdAt in PostgreSQL before aggregation**. Late feedback is attributed to its run's cohort, not to an unrelated decision-date period. Every persisted run is feedback-eligible here because Stage D permits rejecting abstained/legacy runs: evaluation coverage is evaluated / all persisted runs. Acceptance/edit/rejection use evaluated runs; abstention uses all runs. `eligibleRuns` explicitly equals that feedback-eligible population. These are descriptive cohorts, not feedback-bias corrections.

Issue recurrence/severity lists are deliberately lifetime operational views, labeled as such, with status/severity/assignee/source-version filters. They do not silently inherit the overview's date range. Lists and signals are paginated at 25 rows. Current issue history returns the newest 50 events; older history remains retained in PostgreSQL. Staff lookup for filtering returns at most 200 staff identities and no email/customer profile fields. Future larger deployments need expanded lookup/history pagination.

SQL performs counts/distributions/distinct-ticket/version attribution within the bounded tenant/date cohort; it does not send all run snapshots to Node. Separate clear aggregate queries are used instead of a monolithic BI query. A composite CopilotRun(organizationId,createdAt) index supports date ranges. Issue/status/assignment/candidate and signal/source indexes match list/relationship queries. Source health still parses selected evidence JSON and joins verified lineage; it is intentionally the heaviest analytics query. A wider analytics warehouse or denormalized fact table is not introduced.

### Migration, tests and performance

Migration `20260928010000_knowledge_issues` creates the four domain tables, status enum, indexes, unique run/group constraints and tenant/source-lineage triggers. Candidate and signal-source retention FKs are deferred to preserve the existing whole-organization erasure cascade. No existing Copilot decisions, source snapshots or immutable knowledge versions are updated. Schema creation is separate from application backfill. A repeatable migration test starts from the real Stage F migration chain with published knowledge, a historical linked run and evaluation, applies G, compares all original rows and proves migration alone creates no issue signals.

- All **11 migrations** deployed to a fresh isolated database; Stage F → G deployment also passed against the retained representative database.
- Explicit preservation assertions passed for **52 documents, 58 versions, 50 chunks, 34 runs, 13 evaluations and 43 messages** captured before the upgrade. Every captured original row compared unchanged. The subsequent reconciliation fixture also included one additional retained test run, explaining its 35-run count.
- Prisma format/validate/generate, API TypeScript build, client TypeScript/Vite build, offline frozen lockfile validation and `git diff --check` passed. No dependency/lockfile change was required. Existing Prisma configuration/ts-jest compatibility warnings and the ~590 kB client bundle warning remain.
- API unit tests: **201 passed / 14 suites**, including classification exclusions, attribution/deduplication, normalization/grouping, severity boundaries, transition rules, dates and the corrected shared retrieval-scope assertion.
- PostgreSQL integration: **111 passed / 9 suites, 2 skipped local pgvector cases**. G covers concurrent signal creation, distinct-ticket counts, severity/ranking, idempotent bounded reconciliation/late decisions, source attribution and version separation, candidate workflow, PUBLISHED versus VERIFIED, dismissal/recurrence, revision conflicts, assignment revocation, audit rollback, tenant/customer/agent/demo denial, date/empty/legacy cohorts, classifier SQL parity and post-commit failure isolation. Prior C–F transaction/security/retrieval tests remain included.
- Client tests: **20 passed / 4 suites**, including ratio counts, read-only detail, candidate/revision submission, conflict display without retry, publication gating and customer exclusion. CI now also runs these client tests after building. Local browser end-to-end/visual testing was not performed; component behavior and production compilation were verified.
- pgvector remains unavailable locally. The existing E/F real-vector tests remain mandatory in CI under SUPPORTIQ_TEST_PGVECTOR=1 and were not weakened. No remote CI run/push occurred. Local integration uses real PostgreSQL and FTS with the existing external queue stub; no live providers or real Redis-worker transport were exercised.
- Representative isolated performance fixture: **20,000 runs, 10,000 evaluations, 2,000 signals, 300 issues, 1,000 tickets and 50 published versions**, with repeated chunk references and ~1 kB evidence text per chunk. Three service-call measurements including authorization/database round trips were: overview **503.7 / 196.9 / 573.3 ms**, issue list **32.3 / 12.6 / 23.8 ms**, source health **806.0 / 701.6 / 575.3 ms**. The bounded run-range EXPLAIN used `CopilotRun_organizationId_createdAt_idx` in an index-only scan. These are synthetic local timings without HTTP serialization, not an SLA or a scale guarantee. Source-health cohort JSON work and deep offset pagination remain costs to revisit as volume grows. The benchmark's organization/data were removed through the existing tenant-erasure boundary afterward.
- Logs, migration/backfill/preservation assertions, benchmark script/plan and exact delta inventory are retained in sibling `supportiq-stage-g-test`. The isolated PostgreSQL cluster is stopped after final validation; no production service/data was accessed.

### Limits, quality bar and next stage

Deterministic title-derived grouping under-merges paraphrases and may separate the same problem after source-version changes. Shared-source ambiguity is left unattributed, legacy source versions remain unknown, and tiny samples are not reliable comparative evidence. Severity is lifetime recurrence rather than recency/financial risk. Unpersisted failures cannot be reconstructed from historical runs. There is no durable outbox or automatic reconciliation scheduler; operators must run repair passes after outages and for historical data. Workflow history is retained but its UI currently shows the latest 50 entries. Classifier changes need explicit versioned handling. Local provider/Redis/vector validation limits from prior stages remain.

Stage G changes 31 paths relative to the preserved Stage F baseline, including this appendix: one migration/schema; issue classifier/policy/schema/services/routes and maintenance command; post-commit Copilot hooks and membership consistency; shared dashboard analytics; AI Quality UI/API/navigation/styles and client CI step; unit/integration/migration/client tests; and the focused lexical-scope regression fix. Prior uncommitted work remains present. Git remains on `supportiq-hardening` at `817bebb`: 42 modified tracked files, 54 untracked files and nothing staged across the accumulated Stage C–G work. No commit, push or deployment occurred.

The Stage G quality bar is met within these limits: qualifying failures become persistent auditable issues with separate run/ticket counts; staff can review, assign and link a staged knowledge fix; the published candidate relationship is visible and can be deliberately recorded; publication is never described as verified improvement. Version-level observations and explicit denominators support investigation while distinguishing KB, customer-input and operational problems.

The exact next phase is **Stage H — AI Reliability Lab + Historical Replay**: build tenant-scoped, bounded evaluation cohorts from immutable Copilot history and KnowledgeIssue signals; evaluate explicitly selected candidate knowledge versions with recorded retrieval/evidence-policy/provider settings; retain replay provenance and compare outcomes with baseline runs; expose measured verification evidence and gate VERIFIED through that service. Keep replay separate from customer message sending and production publication. Prompt/model experiments, provider variability and evaluation criteria need explicit controls; Stage G observations alone are not causal validation. **Stage H has not begun.**

## Stage H — AI Reliability Lab and historical replay

### Purpose, scope and preservation

Stage H evaluates candidate knowledge and registered AI configurations against immutable support history before customer-facing adoption. Historical ACCEPTED/EDITED/REJECTED feedback remains a human usefulness signal, never an objective accuracy label. Replay cannot send customer messages, create production CopilotRuns/decisions/signals, change ticket state/assignment, or write customer-visible activities. Verification writes only the issue status/revision and its internal history.

Work continued in the existing `supportiq-hardening` worktree at `817bebb2fed91d7437fefc85cb94eb9da11f3829`. Before editing, all **96** accumulated changed/untracked files were copied to sibling `supportiq-stage-h-baseline`, with a manifest and base SHA. The original stale checkout was not edited. Existing Phase 1 and Stages A–G remain preserved; prior sections of this record are unchanged. Nothing was committed, pushed or deployed. Stage I was not started.

### Domain and historical baseline

Migration `20260929010000_reliability_lab` adds `EvaluationSuite`, `EvaluationCase`, `EvaluationExperiment`, `EvaluationScopeVersion` and `EvaluationResult`, plus purpose/status/classification enums. Suites and experiments belong to an organization; cases inherit tenant scope through their suite and historical run, and results through their experiment/case. Database triggers reject cross-tenant issue/run/version links and results from the wrong suite. Unique constraints prevent duplicate suite/run and experiment/case pairs. Indexes cover tenant/date/status/purpose, issue/suite/run links, candidate versions and result classification.

A suite is an immutable collection. Case creation copies the Stage D input, exact recorded retrieval query, original evidence, original suggestion, feedback disposition/reason/final response, provider/model and prompt/retrieval/evidence versions/configuration. It does **not** retrieve current ticket messages or rerun a baseline. Later ticket edits or late feedback cannot rewrite an existing case. A new suite captures a new historical selection. Runs without valid bounded Stage D input provenance are explicitly rejected rather than reconstructed from current tickets. Historical filters support disposition, abstention, evidence decision and a bounded date range (default 30 days, maximum 90). Explicit run selections deduplicate IDs. An over-limit selection is rejected rather than silently truncated.

Suite/case/configuration/scope/result content is immutable in PostgreSQL. Experiments execute once: DRAFT → RUNNING → COMPLETED/FAILED/CANCELLED, with DRAFT → CANCELLED also supported. A new execution requires a new experiment. Completed and partial results cannot be edited or overwritten. Referenced historical runs and knowledge versions are retained; deferred retention FKs preserve existing whole-organization erasure behavior. There is no general evaluation deletion or editing endpoint. Manual case authoring and human scoring are deferred; the demo uses clearly marked illustrative histories.

### Shared core and isolation boundary

`ai.core.ts` extracts the existing context → retrieval → evidence policy → prompt → gated generation pipeline from `ai.service.ts`. Production still wraps that core with the existing CopilotRun/activity persistence and post-commit Stage G derivation. Its HTTP generation/decision/message behavior is preserved.

`replay.case.ts` imports the shared core, read-only retrieval, registered provider helper, snapshot validators and deterministic comparison. It imports no ticket/message commands, realtime transport, production decision service or knowledge-signal ingestion. `replay.execution.ts` orchestrates evaluation-table persistence and current authorization. The separate verification command performs the explicitly authorized internal issue transition. Tests compare complete before/after ticket, message, activity, CopilotRun, decision, issue and signal rows and spy on the customer-event emitter. Replay leaves those production records unchanged, including under provider/retrieval failure. Verification itself changes only the expected issue/history records.

### Candidate scope and configuration

Only server registration `support-replay-v1` is accepted. It records the current `support-copilot-v3` prompt, `evidence-v2`, the selected retrieval strategy, configured Gemini/OpenAI models, embedding model, generation mode, limits and estimated application-level calls. Arbitrary prompts, code, provider names or model strings are not accepted from clients. Execution rejects unsupported/stale configuration versions or changed configured models rather than silently evaluating another setup. One current prompt/provider chain is implemented; no artificial model or prompt variants were invented.

Experiment creation captures current published versions, then replaces only the logical documents named by explicit overrides. READY unpublished, current PUBLISHED and explicitly selected SUPERSEDED versions are allowed in replay. Other documents retain the publication captured at creation. Scope is capped at 1,000 current documents and ten overrides, with at most one override per logical document. Cross-tenant, archived-at-creation, missing and unprocessed versions are rejected. All scope versions have relational references and content hashes.

The internal `evaluation-snapshot` scope permits pinned READY content while normal retrieval still captures current publications and accepts no HTTP scope override. Once pinned, version content, chunks and embeddings cannot change, including moves of pinned chunks into another version. Publication/supersession remain allowed without changing content. An already captured replay scope remains readable across later publication/archive changes; verification separately demands that the whole scope still matches current non-archived publications. Source names come from the immutable version, and unpublished evidence has an explicit null publication timestamp rather than a fabricated date.

### Retrieval-only, hybrid and generation behavior

The default is **lexical retrieval plus RRF selection and Evidence Policy v2**, registered as `lexical-rrf-v1`. Semantic embedding requests and response generation are both disabled, so this mode makes zero provider calls. Diagnostics explicitly record semantic DISABLED, and sources are labeled keyword retrieval. This is a narrower evidence-coverage test than production hybrid retrieval, not a claim that semantic retrieval ran for free. It reuses Stage E lexical search/fusion and the shared evidence core.

Optional hybrid mode uses the current Stage E semantic/lexical implementation and pinned common scope. Its query embeddings can incur provider cost; the UI estimates those calls separately. Missing configuration, incomplete vector coverage or operational retrieval failures disqualify successful verification. Deliberate semantic DISABLED in lexical mode is a declared configuration, not an infrastructure failure.

Generation is independently opt-in and remains gated by the evidence decision. The same registered prompt and configured provider chain are reused, with request parameters, resolved model/usage where available, attempt timings, fallback reason, outputs and rendered prompt recorded in the evaluation result. Replay provider requests have a 15-second timeout per attempt, and OpenAI retries are disabled for replay; production provider options are unchanged. A failed or unconfigured requested generation path is operational ERROR even if a local fallback text exists. Actual caught provider failures retain the retrieval/evidence result. Unexpected execution exceptions retain a sanitized error result. No provider errors become production knowledge defects or normal analytics traffic. No deterministic-generation seed or accuracy/similarity score is claimed.

### Comparison, guardrails and verification

Every case stores raw source-version additions/removals/overlap, baseline/candidate decisions, answer/abstention transitions, diagnostics and an explanation. Classifications are IMPROVED, UNCHANGED, REGRESSED, INCONCLUSIVE or ERROR:

- Operational retrieval/generation failures are ERROR, never knowledge regression.
- Previously supported cases that lose support are REGRESSED. Accepted guardrails pass only when evidence support remains; this does not prove their generated wording is correct.
- Insufficient-knowledge cases improve only with ANSWER_SUPPORTED evidence selecting an intended candidate version. Conflict cases additionally rely on the existing narrow explicit refund-window conflict policy; there is no general contradiction detector.
- WRONG_KNOWLEDGE requires supported evidence from the intended replacement and exclusion of every formerly selected version. IRRELEVANT_EVIDENCE additionally requires at least 60% direct lexical coverage from an eligible intended source. These are declared historical evidence criteria, not factual-truth adjudication.
- Unsupported-claim and other cases without an adequate automatic criterion remain INCONCLUSIVE. Ordinary historical comparison reports unchanged decisions without inventing a correctness score.

Issue suites include **all current issue signals** plus up to ten previously ACCEPTED, ANSWER_SUPPORTED, provenance-bearing runs related to the same logical document or exact case-insensitive normalized topic. Selection is deterministic: oldest run timestamp, then ID. Guards exclude failure IDs. Missing snapshots or a combined population above 50 block automatic creation/verification; required cases are not silently omitted. Exact-topic matching can miss paraphrases, so the relationship is intentionally narrow.

Only the dedicated OWNER/ADMIN verification command can transition PUBLISHED → VERIFIED. The ordinary Stage G status endpoint still rejects VERIFIED. Verification requires a COMPLETED POST_PUBLICATION_VERIFICATION experiment for the same tenant/issue; the exact linked candidate must still be the current PUBLISHED version, with the recorded hash, and the entire evaluated scope must still equal current publication. All original failure cases and every current issue signal must have an IMPROVED result. All currently sampled guardrails must be covered and preserved, with at least one guardrail. Missing, cancelled, failed, error, inconclusive or regressed results block verification. Coverage is recalculated under the organization lock, so later signals or newly required guardrails cannot be silently ignored. A pre-publication result or an experiment for an older published version cannot verify a newer fix.

The internal VERIFIED audit records experiment/version identity, failure and guardrail denominators, timestamp, actor and criteria version. The UI says “Verified against N historical cases.” It means these defined evidence criteria passed, not that knowledge is objectively perfect. PRE_PUBLICATION never publishes a document or changes the issue publication state. GENERAL_COMPARISON never unlocks verification.

### Runner limits, authorization and UI

Limits are 50 cases per suite/experiment, ten cases when generation is enabled, serial case execution, and one active execution per organization. Database RUNNING state prevents ordinary duplicate starts; a process-local slot remains held until in-flight work returns, even after cancellation. A cooperative three-minute deadline is checked between cases. Cancellation retains completed rows and accurate completed/total counts, prevents further result writes, and cannot undo a provider request already sent. Infrastructure failure retains completed results and marks FAILED where storage remains available. A process crash or sustained database outage can leave RUNNING; an admin must cancel it and create a new experiment. This is synchronous bounded execution, **not** a durable queue or resumable worker. Multi-process cancellation/worker recovery is not claimed.

OWNER/ADMIN may create suites/experiments, execute/cancel and verify. AGENT can inspect; CUSTOMER and other tenants cannot. Current authorization and demo checks are enforced in service transactions as well as routes, and are rechecked between cases. Demo API users cannot mutate or incur provider cost. Lists paginate at 25 with validated filters; detail is bounded by the 50-case limit. Provider-call estimates distinguish embeddings and at most two application generation attempts per case; currency cost is not estimated.

AI Quality now includes Reliability Lab. Its home lists purpose/status/candidate, actor/time, case counts and classifications, with status/purpose/date filters. Creation supports issue cohorts, historical filters or existing immutable suites; an admin reviews the prepared count, candidate version, registered configuration and optional provider modes before creating a draft and deliberately executing it. Detail exposes frozen inputs, historical feedback/final text, baseline and candidate answers/evidence, version changes, diagnostics and explicit denominators. Issue detail links its experiments, exposes verification through completed post-publication runs, and renders audited coverage counts. Rich prompt editing, general model benchmarking, manual scoring and optional add-to-suite/source-health shortcuts are not included.

### Seeded demonstration

`seedReliability.ts` is invoked by the existing operator seed. It labels the organization’s new histories and experiments as DEMO/illustrative; it does not claim real customer observations. Baseline guardrail evidence references the actual seeded publication. Candidate results are produced by the real lexical/evidence runner with both paid provider modes disabled, not hard-coded result percentages.

Validated in a separate empty demo test database, then reseeded successfully:

- Staged policy v2: **5/6 failures improved**, one unchanged, **10/10 guardrails preserved**, zero regressions/errors.
- Published policy v3 adds the missing deployment exception: **6/6 failures improved**, **10/10 guardrails preserved**, zero regressions/errors.
- The illustrative issue has a VERIFIED audit linked to the completed post-publication experiment and exact v3. Read-only demo users inspect the completed story without executing it.

### Validation and measured limits

Fresh final migration deployment applied all **12 migrations**. A retained Stage G database upgraded to H without changing captured rows: **54 tickets, 48 messages, 179 activities, 35 CopilotRuns, 13 decisions, 52 documents, 58 versions, 50 chunks, three issues, three signals, four issue-source links and three history rows**. The repeatable G → H migration test independently builds the earlier chain with publication/run/decision/issue fixtures, applies H and compares original rows. Whole-tenant erasure with pinned evaluation data remains tested.

Final test/build counts and Git inventory are recorded below after the final checks. Local tests use real PostgreSQL/FTS with the existing external queue stub; paid provider credentials are disabled. Local pgvector is unavailable: the two existing vector cases remain skipped locally and mandatory in pgvector-enabled CI. No Redis transport, live provider, remote CI or browser end-to-end/visual run was performed. The existing client bundle-size warning remains. Frozen-lockfile validation required no dependency/lockfile changes.

The 50-case synthetic retrieval-only benchmark ran serially with zero embedding/generation calls. Observed service execution times were **5,346 ms**, **3,512 ms** and **682 ms** across cold/concurrent and warm local runs. Corresponding per-case pipeline medians were 9/6/1 ms and p95 values 20/11/2 ms. These measurements include per-case pipeline work and, for total time, authorization/result persistence; setup of the historical fixture is excluded. SQL query counts were not instrumented. The small-text fixture is not a large-snapshot throughput or production latency guarantee.

Known limits: lexical replay has narrower coverage than hybrid; deterministic source/coverage rules are not factual labels; exact-topic guardrails under-match paraphrases; no guards means no verification; large issue cohorts require a future coverage design rather than truncation; only the current registered prompt/provider chain is available; model outputs remain nondeterministic; partial execution is retained but not resumed; cancellation cannot reclaim spent provider tokens; large bounded snapshots can still make detail responses heavy. Stored actor identities and snapshots intentionally retain historical context until tenant erasure.

The Stage H quality bar is met within those limits: immutable historical baselines, unpublished candidate evaluation, zero customer-side effects, transparent measured comparisons, guardrail protection and exact-publication verification form a working end-to-end product workflow. **Do not start Stage I automatically.** The next phase is **Stage I — Production Ingestion, Recovery, Storage + Observability**: replace local-file assumptions with object storage, harden DB → queue handoff, add idempotent processing/reconciliation and recovery, and introduce structured operational observability. It should address durable execution/recovery deliberately rather than retroactively claiming Stage H is a distributed worker system.

### Final validation and file inventory

- API unit: **210 passed / 15 suites**.
- PostgreSQL integration: **125 passed / 11 suites**, with the **two existing local pgvector skips** retained. Stage H contributes 13 behavioral tests and one migration test. The final 13-case Stage H suite was rerun successfully after cancellation-slot and provenance-label adjustments.
- Client: **24 passed / five suites**, including explicit denominator, role visibility and audited verification-count assertions.
- API TypeScript and client TypeScript/Vite builds, Prisma format/validate/generate, fresh migrations, preserved-history upgrade, demo seed/reseed assertions, offline frozen lockfile and whitespace checks passed. The ~604 kB client bundle warning remains.
- Artifact logs, before/after preservation evidence, demo result assertions and exact baseline-relative inventory are retained in sibling `supportiq-stage-h-test`; credentials/provider payloads are not logged.
- Git remains on `supportiq-hardening` at `817bebb`: **42 modified tracked files and 69 untracked files**, nothing staged, across accumulated C–H work. Stage H changes **32 paths** relative to the preserved G baseline. No commit, push or deployment.

Stage H paths (earlier-stage files not listed here remain preserved):

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/seed.ts`
- `apps/api/src/app.ts`
- `apps/api/src/modules/ai/ai.service.ts`
- `apps/api/src/modules/knowledge-base/kb.vector.ts`
- `docs/repository-reconciliation.md`
- `apps/api/prisma/migrations/20260929010000_reliability_lab/migration.sql`
- `apps/api/prisma/seedReliability.ts`
- `apps/api/src/__tests__/reliability.migration.integration.test.ts`
- `apps/api/src/__tests__/reliability.test.ts`
- `apps/api/src/__tests__/stage-h.integration.test.ts`
- `apps/api/src/modules/ai/ai.core.ts`
- `apps/api/src/modules/ai/ai.provenance.ts`
- `apps/api/src/modules/ai/ai.provider.ts`
- `apps/api/src/modules/ai/evidence-policy.ts`
- `apps/api/src/modules/knowledge-base/kb.hybrid.ts`
- `apps/api/src/modules/knowledge-base/kb.lexical.ts`
- `apps/api/src/modules/knowledge-base/kb.retrieval.ts`
- `apps/api/src/modules/knowledge-base/kb.scope.ts`
- `apps/api/src/modules/reliability/replay.case.ts`
- `apps/api/src/modules/reliability/replay.comparison.ts`
- `apps/api/src/modules/reliability/replay.execution.ts`
- `apps/api/src/modules/reliability/replay.routes.ts`
- `apps/api/src/modules/reliability/replay.schema.ts`
- `apps/api/src/modules/reliability/replay.service.ts`
- `apps/client/src/features/quality/QualityPage.test.tsx`
- `apps/client/src/features/quality/QualityPage.tsx`
- `apps/client/src/features/quality/ReliabilityLab.test.tsx`
- `apps/client/src/features/quality/ReliabilityLab.tsx`
- `apps/client/src/features/quality/quality.css`
- `apps/client/src/features/quality/qualityApi.ts`
- `apps/client/src/features/quality/reliabilityApi.ts`


## Stage I — Production ingestion, recovery and observability

Implementation recorded 2026-09-30 on supportiq-hardening. **Stage I implementation and local acceptance validation are complete:** real Redis/BullMQ, S3-compatible storage and pgvector tests passed. No Stage J work, push or deployment was performed.

### Checkpoint and scope

Before Stage I, reviewed the completed C–H delta against upstream base 6f5b5e237bf18e5dece0a7d1294dfb1778d4793d, checked the 111-path inventory for secrets/generated files, and committed 61bf9fee43542898ff28530cb9bef6dec4085ea3 (Checkpoint completed C-H security, knowledge intelligence and Reliability Lab). The branch/worktree was clean after that checkpoint. Stage I changes remain uncommitted for review.

### Implementation

- Private S3-compatible and filesystem adapters; server-generated keys; strict extension/MIME, PDF signature/parser, UTF-8, byte/text bounds; SHA-256 verification on processing and explicit audits. PDF native failures are contained by a child process with a deadline and V8 heap bound. No malware scanning claim.
- Object storage precedes the version/outbox transaction. Compensation verifies absence of references and defers ambiguous cleanup. Archive retains historical source objects. Legacy imports add mappings without rewriting immutable source identity.
- Additive 20260930010000_ingestion_operations migration creates KnowledgeSourceObject, KnowledgeIngestion, KnowledgeIngestionAttempt and KnowledgeOutbox. Existing versions, chunks, vectors, AI/issue/replay history are not rewritten.
- Focused transactional outbox with SKIP LOCKED/token claims, explicit UTC comparisons, deterministic generation IDs, bounded exponential retry, exhaustion visibility and 30-day eligible dispatched-event retention. A Redis outage no longer turns a durable upload into an HTTP failure.
- Database-fenced processing, durable attempts, 120-second default renewable leases, bounded reconciler pages and recovery budgets. Old tokens/generations cannot overwrite current attempts. READY/published retries do no work. Staged chunks survive retries and vectors are reused only for compatible model identity.
- Provider batching defaults to four. Final READY verifies actual stored chunk/vector counts. Lexical and semantic readiness are distinct; configured provider failure cannot produce false semantic readiness. The old publication remains active until explicit publication.
- Separate API and worker entry points; bounded SIGTERM/SIGINT resource closure; liveness and dependency readiness; safe error taxonomy, context allowlist/redaction, request→outbox→job→attempt correlation, tenant-scoped operational metrics and minimal version-history controls. Reliability Lab execution is unchanged.
- CI enables mandatory vector/Redis/S3 integration flags. A pinned-source MinIO test image avoids removed upstream registry images. Production storage remains provider-neutral. Existing frontend resolver resolution was made explicit with Vite Zod deduplication after the shared pnpm store exposed a missing optional import; API/shared TypeScript stays pinned to the checkpoint compiler (6.0.3). Unrelated package upgrades were removed.

### Evidence available

- Prisma format/validate/generate and API/worker compilation passed.
- Fresh 13-migration chain and H→I upgrade passed with the final distinct migration timestamp. The final migration checksum comparison preserved counts and row-content hashes across all 24 pre-existing tables.
- Unit suite: 222 passed across 16 suites, including actual valid/malformed PDF parsing, size/MIME/control-byte rejection, private filesystem round-trip, key validation, redaction, correlation and bounded shutdown.
- Full PostgreSQL/Redis/S3/pgvector integration suite: **144 passed across 13 suites, zero skips**. Prior C–H suites remain green. New failures injected include queue refusal, enqueue-before-acknowledgement failure, competing claims, DB rollback, partial provider failure paths, stale recovery, missing/tampered objects, compensation failure, dead-dispatch recovery and inconsistent readiness.
- Client: all 27 tests passed across six suites, including version-specific retry and access controls. Client build passed with the existing >500 kB bundle warning. API liveness smoke test returned 200 and shutdown exited zero. Worker startup with unavailable Redis emitted sanitized errors and shutdown exited zero.
- A 399-chunk mocked-provider/real-vector run measured 75 ms upload, 781 ms injected dispatch, 17.31 s processing and 296 ms reconciliation, with maximum embedding concurrency four. The lexical comparison measured 88 ms / 51 ms / 595 ms / 154 ms. These are local single-run timings, not service SLAs or live-provider performance.
- Frozen lockfile validated. Workflow and Compose YAML parsed; Compose config validated. The pgvector 0.8.6-pg16 registry tag was verified. No GitHub CI run was triggered.

### Validation closure and remaining deployment checks

Docker recovered without deleting data/settings. The pinned-source MinIO image built and real service checks passed. A Windows-reserved S3 port was replaced with configurable localhost port 55442. Shared Jest setup now loads worker cleanup only at teardown, allowing provider mocks to install correctly. The full regression passed after that correction. Paid provider smoke tests and production credentials/deployment checks were not run. Native PDF allocations are not fully constrained by a V8 heap limit. Model-only reindexing of identical bytes is not exposed as an admin operation; do not mutate historical models to force compatibility.

Operational procedures and environment descriptions: [ingestion-operations.md](ingestion-operations.md). Decisions: [ADR 005](adr/005-ingestion-reliability.md). Detailed acceptance/report: [stage-i-report.md](stage-i-report.md).

Stage J remains deferred. After Stage I sign-off, freeze features, complete final regression/demo/accessibility and performance QA, consolidate deployment/architecture docs, and prepare the failure-recovery demonstration and engineering ownership notes. Do not add major architecture during Stage J.

## Stage J — final quality and feature-freeze validation (2026-10-01)

Stage I was reviewed and committed as fd0ca833574d7576afda9ec728248fa7d0deb022 before Stage J, from a clean working tree. The C–H checkpoint remains 61bf9fee43542898ff28530cb9bef6dec4085ea3. Existing upstream Copilot, evaluation, analytics, abstention and refresh systems were retained.

Stage J closes bounded defects: guarded local demo reset; current-membership checks inside ticket/message/note writes; customer staff-control/internal-note-count protection; bounded history/document/chunk navigation; SQL first-response aggregation; sanitized client diagnostics; accessible organization selection without effect-driven state initialization; unused legacy upload/App removal. No new product architecture, migration, paid AI feature or distributed service was introduced.

Validation: 228 API units in 17 suites; 146 all-services integration tests in 13 suites with PostgreSQL/pgvector, Redis/BullMQ and private S3 enabled; 27 client tests in six suites; five Playwright workflows, no automatic retries. API/client typechecks/builds pass. Configured client ESLint passes; API lint is still a placeholder. Prisma validates and all thirteen migrations are current. A fresh E2E database and baseline-five-to-current-thirteen upgrade both pass; retained original User/Organization/Ticket/CopilotRun/CopilotEvaluation columns are unchanged and old runs remain LEGACY. Stage I's separate H→I 24-table preservation record remains applicable; Stage J changes no migration.

Both API/worker and nginx client images build from clean locked installs. nginx configuration validates and API image runs as UID 1000 with both entrypoints present. The first client image pull failed due to registry DNS; a subsequent build succeeded. No image was pushed and no environment was deployed. GitHub-hosted CI is not claimed green without a push; the workflow now includes Prisma validation, client lint and browser acceptance in addition to existing service checks.

Local synthetic 20k-run Source Health: 238–263 ms; fifty-case retrieval-only replay: 7.7–12.4 s. See performance.md for all samples and limitations. The public schema is the supported migration target; a custom-schema pgvector lookup probe failed and is documented, not concealed by editing historical migrations.

README, claim map, architecture/ingestion diagrams, ten ADRs, threat model, evaluation methodology, demo/reset, deployment/local setup/testing/performance docs and interview syllabus are complete. Interview material includes three resume bullets, three summary lengths, 66 questions, sixteen subsystem ownership sections and an ordered code-reading map. See stage-j-report.md for the 34-point acceptance record and known-limitations.md for residual constraints. Final local checkpoint is the commit containing this entry; no Stage K is proposed.
