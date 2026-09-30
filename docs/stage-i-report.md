# Stage I implementation and validation report

Status: **Stage I implementation and local acceptance validation complete.** No push, deployment or Stage J implementation.

1. **Checkpoint:** 61bf9fee43542898ff28530cb9bef6dec4085ea3 committed the reviewed completed C–H work before Stage I. Branch remains codex/supportiq-hardening, based on reconciled upstream 6f5b5e237bf18e5dece0a7d1294dfb1778d4793d.
2. **Files:** ingestion/storage/operations utilities, API and worker entry points, knowledge services, upload and PDF parsing, version-history UI, tests, CI/Compose, schema/migration, compiler pins and documentation. Complete path inventory follows below.
3. **Schema:** four additive tables: KnowledgeSourceObject, KnowledgeIngestion, KnowledgeIngestionAttempt, KnowledgeOutbox. Final migration: 20260930010000_ingestion_operations. No old version/chunk/history rewrite.
4. **Storage:** narrow private S3/filesystem interface; AWS SDK isolated from domain services; server-owned knowledge/UUID keys.
5. **Validation:** byte limit, agreeing extension/MIME, PDF magic/parser success, strict UTF-8/control checks, bounded nonempty extracted text. PDF parsing uses a child process, ten-second deadline and 128 MiB V8 heap setting.
6. **Compensation:** store before DB commit; delete only after verifying no source mapping. Ambiguous failure retains an auditable orphan. No automatic source GC.
7. **Outbox:** version, source mapping, processing state and intent commit together. Redis availability is outside upload success semantics.
8. **Dispatch:** SKIP LOCKED claims, 30-second token lease, UTC timestamps, bounded dispatch/backoff and fenced acknowledgement. Duplicate/crash/concurrent-claim tests passed against PostgreSQL with injected transport.
9. **Jobs:** deterministic version+generation IDs, no timestamps/colons. Three default attempts and exponential two-second backoff; bounded Redis job retention.
10. **Worker idempotency:** current-generation check, database lease/token fencing, unique version/chunk index, reuse of matching staged chunks, prepared/published no-op behavior. Provider/network operations stay outside DB transactions.
11. **Retry:** safe categories distinguish transient dependency failure from invalid/missing/changed sources. Dispatch exhaustion is surfaced; OWNER/ADMIN manual retry creates new intent for the same immutable version. Demo guards remain.
12. **Recovery:** bounded cursor scans detect stale processing, missing handoffs, stranded dispatched work and missing sources. Attempts/generations cap automatic recovery. Audits report ambiguous/index/object inconsistencies without destructive repair.
13. **Readiness:** READY is committed with required activity and operational readiness, after chunk/index verification. Old publication remains live during candidate work.
14. **Embeddings:** batches of four by default, 1,536 dimensions, compatible version/model reuse and actual stored vector count check. Unknown/mismatched models are excluded from semantic search. No-key mode is explicitly lexical-only unless semantic readiness is required.
15. **Processes:** independent start and start:worker scripts; API never starts ingestion workers. Reliability Lab stays bounded synchronous.
16. **Shutdown:** API and worker startup/SIGTERM smoke tests exited zero; worker test used intentionally unavailable Redis. Unit test covers forced timeout. Close deadline is 30 seconds.
17. **Health:** liveness separated from DB/Redis/storage readiness; no provider credentials or raw dependency errors returned. AI provider outage does not affect readiness.
18. **Logging:** safe structured context, centralized redaction, no raw Stage I exception/request/document/prompt dumps. Parser output is suppressed; dotenv startup chatter disabled.
19. **Correlation:** validated/generated response request ID propagates through version ingestion, outbox, job and durable attempts.
20. **Metrics/UI:** HTTP status/duration logs, storage/worker counters, queue-count logs, tenant-scoped ingestion aggregates and safe version-stage/error/retry/readiness UI. Existing AI metrics retained.
21. **Failure injection:** PostgreSQL-backed cases passed for queue refusal, failed enqueue acknowledgement, concurrent dispatch, stale token takeover, missing/tampered source, failed put, DB rollback, deferred compensation, exhausted dispatch/manual retry and inconsistent READY. Real pgvector partial-embedding failure/retry also passed: readiness is blocked on failure and retry retains chunk identities.
22. **PostgreSQL:** fresh 13-migration chain and H→I upgrade applied. Final migration snapshot comparison preserved counts and row-content hashes for all 24 pre-existing tables. Final all-services regression: **144 tests passed across 13 suites, zero skips** (175.4 seconds). Unit suite: **222 tests passed across 16 suites**.
23. **Redis/BullMQ:** real Redis test passed: unavailable transport preserves intent; later dispatch succeeds; deterministic duplicate job IDs collapse; the real worker reaches READY with one durable attempt; resource closure and dependency readiness pass.
24. **Storage tests:** filesystem round trips and byte/PDF validation passed. Real private S3 put/read/head/list/delete/missing-key tests passed against the built MinIO fixture; anonymous object reads return 403. Source import remains an offline operator command to exercise against the actual retained legacy directory before cutover.
25. **pgvector:** real E/F vector ranking, tenant/publication filtering, partial-embedding recovery and the 399-chunk mocked-provider benchmark passed. A shared Jest setup eagerly loaded the worker before provider mocks; deferring that import until teardown fixed the test isolation issue. No paid provider calls were needed.
26. **Client:** 27 tests passed across six suites, including version-specific retry, nonretryable-source and staff-control tests.
27. **CI:** PostgreSQL/pgvector, pinned Redis, a private S3 fixture built from a pinned upstream MinIO security release, migration/build/unit/integration/client checks. YAML and Compose config validated; MinIO source image built and ran successfully. The localhost S3 port is configurable (default 55442) because Windows reserves some high ports. No GitHub-hosted CI execution is claimed.
28. **Builds:** API/worker TypeScript and client production build passed; client retains the existing >500 kB bundle warning. Worktree dependency restoration required a compiler pin and explicit Vite Zod resolution. Only intended SDK dependencies were retained in the lockfile.
29. **Performance:** Docker pgvector run, 399 chunks with mocked provider and real vector writes: upload 75 ms, injected dispatch 781 ms, processing 17.31 s, reconciliation 296 ms; maximum embedding concurrency four. Lexical comparison: upload 88 ms, injected dispatch 51 ms, processing 595 ms, reconciliation 154 ms. These single local runs include Windows/Docker I/O and make no live-provider throughput/SLA claim.
30. **Git:** 52 Stage I files remain uncommitted (29 modified tracked, 23 new files) on the checkpoint branch; no push or history rewrite. Source/docs/config/tests only; no environment files, generated build files or test database files are intended for Git.
31. **Limits:** no paid live-provider run or production deployment; production S3 credentials/policy and actual retained legacy imports require environment-specific cutover checks. Cross-process metrics need a collector; native PDF allocations exceed V8 heap accounting; no malware scanning or automatic source GC. Identical-byte model-only reindexing is not exposed; use a deliberately reviewed future reindex workflow before changing model identity. Shared Socket.IO scaling still requires an adapter. Existing client bundle-size and ts-jest/compiler-support warnings remain documented.
32. **Quality bar:** **met for Stage I implementation and local validation**. Real Redis/S3/pgvector, image build, partial-embedding recovery, benchmark, migration preservation, builds and regression checks passed. Environment-specific production cutover checks remain in the runbook; no production-readiness/deployment execution is claimed.
33. **Stage J:** only after Stage I sign-off: feature freeze; final regression/accessibility/demo QA; bundle/performance review; final deployment/runbook/ADR consolidation; rehearse Redis outage, retry, stale-worker recovery and immutable-publication explanation. Add no major architecture.

## Reproduction and evidence

Use the existing authoritative worktree. Start `docker compose -p supportiq-stage-i -f docker-compose.test.yml up -d --build`, configure the isolated database/Redis/S3 endpoints documented in ingestion-operations.md and enable SUPPORTIQ_TEST_PGVECTOR=1, SUPPORTIQ_TEST_REDIS=1 and SUPPORTIQ_TEST_S3=1. Apply migrations, build and run API unit/integration and client checks. Test logs and migration preservation evidence are retained in the sibling supportiq-stage-i-test directory, outside Git.

## Changed files (52)

- `.github/workflows/ci.yml`
- `.gitignore`
- `apps/api/package.json`
- `apps/api/prisma/migrations/20260930010000_ingestion_operations/migration.sql`
- `apps/api/prisma/schema.prisma`
- `apps/api/src/__tests__/ingestion.unit.test.ts`
- `apps/api/src/__tests__/stage-e.integration.test.ts`
- `apps/api/src/__tests__/stage-f.integration.test.ts`
- `apps/api/src/__tests__/stage-i-services.integration.test.ts`
- `apps/api/src/__tests__/stage-i.integration.test.ts`
- `apps/api/src/app.ts`
- `apps/api/src/common/errors/errorHandler.ts`
- `apps/api/src/common/operations.ts`
- `apps/api/src/common/shutdown.ts`
- `apps/api/src/common/storage.ts`
- `apps/api/src/config/env.ts`
- `apps/api/src/config/ingestion.ts`
- `apps/api/src/config/redis.ts`
- `apps/api/src/knowledge-ops.ts`
- `apps/api/src/modules/health/health.routes.ts`
- `apps/api/src/modules/health/readiness.ts`
- `apps/api/src/modules/knowledge-base/kb.controller.ts`
- `apps/api/src/modules/knowledge-base/kb.operations.ts`
- `apps/api/src/modules/knowledge-base/kb.outbox.ts`
- `apps/api/src/modules/knowledge-base/kb.processing.ts`
- `apps/api/src/modules/knowledge-base/kb.queue.ts`
- `apps/api/src/modules/knowledge-base/kb.reconcile.ts`
- `apps/api/src/modules/knowledge-base/kb.routes.ts`
- `apps/api/src/modules/knowledge-base/kb.service.ts`
- `apps/api/src/modules/knowledge-base/kb.source-import.ts`
- `apps/api/src/modules/knowledge-base/kb.text.ts`
- `apps/api/src/modules/knowledge-base/kb.upload.ts`
- `apps/api/src/modules/knowledge-base/kb.validation.ts`
- `apps/api/src/modules/knowledge-base/kb.vector.ts`
- `apps/api/src/modules/knowledge-base/kb.version.service.ts`
- `apps/api/src/server.ts`
- `apps/api/src/worker.ts`
- `apps/api/tests/jest.setup.ts`
- `apps/client/src/features/knowledge-base/DocumentList.test.tsx`
- `apps/client/src/features/knowledge-base/DocumentList.tsx`
- `apps/client/src/features/knowledge-base/IngestionStatus.test.tsx`
- `apps/client/src/features/knowledge-base/kbApi.ts`
- `apps/client/vite.config.ts`
- `docker-compose.test.yml`
- `docs/adr/005-ingestion-reliability.md`
- `docs/ingestion-operations.md`
- `docs/repository-reconciliation.md`
- `docs/stage-i-report.md`
- `packages/shared/package.json`
- `pnpm-lock.yaml`
- `tooling/minio-test.Dockerfile`
- `tooling/minio-test.Dockerfile.dockerignore`
