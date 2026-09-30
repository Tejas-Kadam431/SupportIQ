# Subsystem ownership map

Use each section to explain a real code path and one failing test. Paths are under apps/api/src unless stated otherwise. Scaling notes are proposals, not implemented claims.

## Auth

### What problem does it solve?

Keep identity separate from tenant permissions.

### How is it implemented?

Opaque refresh-session families, cookie transport and signed short-lived access JWTs; modules/auth and common/utils/jwt.ts.

### Why this approach?

A stolen rotating credential can trigger family revocation without storing raw refresh tokens.

### What alternatives existed?

Long-lived JWTs or server sessions for every request.

### What can fail?

Parallel refresh/reuse; stolen access JWT remains valid until expiry.

### How is it tested?

auth.session.test.ts, jwt.test.ts, stage-c.integration.test.ts.

### How would it scale?

Shared database session state; manage connection capacity.

### What would I improve next?

Account-specific abuse protection when exposure warrants it.

## Tenant/RBAC

### What problem does it solve?

Prevent cross-organization and customer data access.

### How is it implemented?

Current membership queries; organization locks before critical writes; organizations/org.transaction.ts.

### Why this approach?

Membership changes must affect later operations.

### What alternatives existed?

Role claims embedded in long-lived tokens; a generic policy engine.

### What can fail?

Read/write timing races and missed scoping in a new query.

### How is it tested?

rbac.integration.test.ts; stage-c.integration.test.ts.

### How would it scale?

Database indexes; authorization logic stays shared across instances.

### What would I improve next?

Expand adversarial cases as new endpoints appear.

## Tickets

### What problem does it solve?

Keep status, assignment and first response consistent.

### How is it implemented?

ticket.policy.ts and transactional ticket/message services with locks and conditional updates.

### Why this approach?

Business transitions belong in server policy, not only button visibility.

### What alternatives existed?

UI-only validation or last-write-wins status changes.

### What can fail?

Stale status, removed assignee or simultaneous first responses.

### How is it tested?

ticket.policy.test.ts, ticket.service.test.ts, stage-c.integration.test.ts.

### How would it scale?

Tenant indexes, bounded histories and selective locking.

### What would I improve next?

Cursor pagination if offset drift becomes disruptive.

## Realtime

### What problem does it solve?

Stop stale subscriptions leaking future messages.

### How is it implemented?

realtime.authorization.ts and realtime.service.ts recheck current access before protected delivery and enforce expiry.

### Why this approach?

Room membership is routing state, not a permanent capability.

### What alternatives existed?

Join-only checks or a distributed revocation service.

### What can fail?

DB outage must fail closed; disconnected clients miss events.

### How is it tested?

realtime.authorization.test.ts and realtime.socket.test.ts.

### How would it scale?

Add Socket.IO Redis/shared adapter; preserve per-recipient authorization.

### What would I improve next?

Measure authorization-query cost at realistic fan-out.

## Knowledge ingestion

### What problem does it solve?

Turn untrusted uploads into bounded searchable content.

### How is it implemented?

kb.validation.ts, kb.text.ts, kb.processing.ts validate, parse, chunk and prepare versions.

### Why this approach?

Resource bounds and process isolation limit malformed parser impact.

### What alternatives existed?

Synchronous upload processing or trusting MIME alone.

### What can fail?

Malformed PDFs, parser deadlines, missing objects and embedding outages.

### How is it tested?

ingestion.unit.test.ts; stage-i.integration.test.ts.

### How would it scale?

Independent worker concurrency within DB/provider limits.

### What would I improve next?

Malware scanning if threat/exposure justifies it.

## Knowledge versioning

### What problem does it solve?

Retain historical evidence while publishing fixes.

### How is it implemented?

kb.version.service.ts plus immutable database guards, document locks and expected publication pointer.

### Why this approach?

A previous Copilot Run must still refer to the content it used.

### What alternatives existed?

Mutating chunks in place or external content snapshots only.

### What can fail?

Competing publication, incomplete candidate or stale expected version.

### How is it tested?

knowledge.migration.integration.test.ts; stage-f.integration.test.ts.

### How would it scale?

Index version lookup; bounded history and deliberate retention.

### What would I improve next?

Plan archival policy without breaking provenance.

## Hybrid retrieval

### What problem does it solve?

Find exact terms and semantic paraphrases within a tenant.

### How is it implemented?

kb.hybrid.ts merges lexical and vector ranked candidates; kb.scope.ts constrains published/evaluation versions.

### Why this approach?

Rank fusion avoids pretending lexical/vector scores share units.

### What alternatives existed?

Vector-only, keyword-only or external search service.

### What can fail?

Embedding outage, empty matches, stale vectors or wrong scope.

### How is it tested?

retrieval.health.test.ts; stage-e.integration.test.ts.

### How would it scale?

Query plans, indexes and measured candidate bounds first.

### What would I improve next?

Broader relevance evaluation before changing ranking.

## Evidence policy

### What problem does it solve?

Prevent fluent answers from substituting for support.

### How is it implemented?

ai/evidence-policy.ts determines support, insufficiency, conflicts and degraded retrieval before generation.

### Why this approach?

Deterministic rules are inspectable and regression-testable.

### What alternatives existed?

Trusting model self-confidence or always generating.

### What can fail?

Conservative abstention and imperfect semantic conflict detection.

### How is it tested?

evidence.policy.test.ts; ai.gating.test.ts.

### How would it scale?

Small bounded source sets make decisions inexpensive.

### What would I improve next?

Review thresholds on broader labeled fixtures.

## Copilot

### What problem does it solve?

Assist an agent while retaining exact context and human control.

### How is it implemented?

ai.service.ts, ai.core.ts, ai.provenance.ts capture input/evidence/configuration and call bounded providers.

### Why this approach?

Separate retrieval/gating from provider generation and sending.

### What alternatives existed?

A single opaque prompt or autonomous ticket agent.

### What can fail?

Provider failure, prompt injection and context changes before send.

### How is it tested?

ai.provider.test.ts, ai.provenance.test.ts; stage-d/e integration.

### How would it scale?

Provider quotas, bounded contexts and explicit capacity limits.

### What would I improve next?

Broaden provider-specific regression evidence.

## Feedback

### What problem does it solve?

Record what a human actually did to a suggestion.

### How is it implemented?

ai.decision.ts atomically persists terminal decision and public message; classifies unchanged vs edited text.

### Why this approach?

A saved decision without its message would misrepresent product outcomes.

### What alternatives existed?

UI telemetry only or independent message/feedback requests.

### What can fail?

Duplicate clicks, conflicting decisions and misleading accepted labels.

### How is it tested?

stage-d.integration.test.ts; browser edited-send workflow.

### How would it scale?

Unique constraints and targeted transactional locks.

### What would I improve next?

Improve labeling guidance before treating feedback as truth.

## Knowledge Issues

### What problem does it solve?

Make recurring knowledge failures actionable.

### How is it implemented?

knowledge-issues/issue.service.ts derives qualifying signals, grouping and attributed sources.

### Why this approach?

Not every rejection is a source defect.

### What alternatives existed?

Loose topic counters or manual issue entry only.

### What can fail?

Duplicate signals, inappropriate attribution and changing cohorts.

### How is it tested?

knowledge-issues.test.ts; stage-g.integration.test.ts.

### How would it scale?

Indexed persistent signals and paged aggregate queries.

### What would I improve next?

Audit classifier precision on real reviewed cases.

## Source Health

### What problem does it solve?

Explain source exposure and attributed failures.

### How is it implemented?

knowledge-issues/quality.service.ts aggregates relational source attribution with explicit denominators.

### Why this approach?

Counts should distinguish exposure from causal evidence.

### What alternatives existed?

Counting every retrieved document as faulty on rejection.

### What can fail?

Sparse feedback, expensive JSON/history scans and misleading rates.

### How is it tested?

stage-g.integration.test.ts; tooling/benchmarks/performance.mjs.

### How would it scale?

Measure SQL plans and aggregate before adding caching.

### What would I improve next?

Expand benchmark distributions and monitor actual query load.

## Reliability Lab

### What problem does it solve?

Check candidate knowledge against historical cases.

### How is it implemented?

reliability/replay.service.ts snapshots/pins; replay.execution.ts runs bounded cases; replay.comparison.ts classifies.

### Why this approach?

Baseline replay and guardrails make correction claims inspectable.

### What alternatives existed?

Live experiments on customer tickets or aggregate thumbs-up rates.

### What can fail?

Incomplete provenance, changed cohort, interrupted runs and provider nondeterminism.

### How is it tested?

reliability.test.ts; stage-h.integration.test.ts; browser verification flow.

### How would it scale?

Bounded cases and one active experiment per organization; durable execution needs further design at larger scale.

### What would I improve next?

Broaden evaluation coverage before broad quality claims.

## Outbox/worker

### What problem does it solve?

Close the database-to-queue failure gap.

### How is it implemented?

kb.outbox.ts uses durable rows and SKIP LOCKED claims; worker.ts consumes generation-specific jobs; kb.reconcile.ts repairs interruptions.

### Why this approach?

At-least-once delivery with idempotence is achievable without distributed transactions.

### What alternatives existed?

Queue publish inside request only or a second orchestration platform.

### What can fail?

Duplicate enqueue, expired claim, stale lease and Redis outage.

### How is it tested?

stage-i.integration.test.ts; stage-i-services.integration.test.ts.

### How would it scale?

Multiple claimers and workers with bounded concurrency; measure DB pressure.

### What would I improve next?

Operational backlog alerts from observed service needs.

## Storage

### What problem does it solve?

Retain source bytes across API/worker restarts.

### How is it implemented?

common/storage.ts abstracts filesystem and S3-compatible storage; keys are server-generated.

### Why this approach?

Private object storage lets separate processes access durable sources.

### What alternatives existed?

API-local uploads only or storing every source blob in relational rows.

### What can fail?

Wrong credentials, missing objects, public bucket policy and orphaned uploads.

### How is it tested?

ingestion.unit.test.ts; stage-i-services.integration.test.ts.

### How would it scale?

Object storage capacity/lifecycle; scoped credentials and shared namespace.

### What would I improve next?

Validate backup/retention policies in the actual deployment.

## Observability

### What problem does it solve?

Make failures diagnosable without exposing customer data.

### How is it implemented?

common/operations.ts emits allowlisted structured events/request IDs; health routes and shutdown helpers bound failures.

### Why this approach?

Known fields are safer than serializing arbitrary errors or prompts.

### What alternatives existed?

Raw console dumps or a large telemetry platform first.

### What can fail?

Missing correlations, noisy logs or masking a real dependency outage.

### How is it tested?

ingestion.unit.test.ts; stage-i services tests.

### How would it scale?

Collect structured logs centrally; aggregate metrics outside process memory.

### What would I improve next?

Choose alerts after observing the deployed workload.
