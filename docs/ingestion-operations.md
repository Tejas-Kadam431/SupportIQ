# Knowledge ingestion operations

Stage I implementation. Do not treat configuration validation as proof of a successful production deployment. See repository-reconciliation.md for measured validation and open gates.

## Runtime architecture

The modular monolith has two commands, sharing PostgreSQL, Redis and the configured private object store:

- API: pnpm --dir apps/api start (HTTP and Socket.IO; no ingestion worker).
- Worker: pnpm --dir apps/api start:worker (BullMQ concurrency 2, outbox dispatcher and reconciler).
- Build both: pnpm --dir apps/api build. Migrate once before either runtime.
- Development: dev and dev:worker from apps/api. Use the same storage configuration in both processes.
- Reliability Lab retains its existing bounded synchronous execution; Stage I does not move experiments to a queue.

Production requires S3 storage. Filesystem storage is for local development and tests. Multiple API instances require a Socket.IO Redis adapter or equivalent shared adapter, independently of BullMQ. Permission logic remains unchanged.

## Ingestion sequence and guarantees

Authorized OWNER/ADMIN upload → bounded file validation → private object put → PostgreSQL version + source mapping + ingestion state + outbox commit → dispatcher → deterministic BullMQ job → fenced worker → fetch/hash verification → extraction → chunks → bounded embeddings → atomic READY → explicit admin publication.

Original names are metadata only. Object keys are knowledge/UUID, validated by both adapters. The HTTP route never accepts an object key, filesystem path or bucket. Tenant authorization is repeated in the version transaction after validation/storage. Archive retains source objects and all version provenance.

No distributed transaction exists between object storage, PostgreSQL and Redis. If put succeeds and the database fails, compensation first verifies that the key is unreferenced. If that lookup or deletion fails, the object is retained for an operator audit. An uncertain commit acknowledgement never justifies deleting a possibly referenced object. No automatic object garbage collection is implemented.

The outbox is committed with the version. A Redis outage does not fail the successful upload or erase processing intent. Claims use one UPDATE with FOR UPDATE SKIP LOCKED, a random claim token and a 30-second lease. All lease/backoff comparisons use UTC explicitly. Queue operations run outside database transactions. A successful enqueue followed by a failed dispatch acknowledgement reuses the same job ID. Claims are fenced when acknowledged.

Job IDs are knowledge-version-VERSION_ID-gGENERATION, without colons or timestamps. BullMQ custom ID restrictions were checked in the installed implementation and [BullMQ documentation](https://docs.bullmq.io/guide/jobs/job-ids). Queue history is bounded (completed: 24 hours/1,000 jobs; failed: seven days/1,000 jobs). Durable attempt history remains in PostgreSQL.

## Attempts, leases and indexing

Versions and operational metadata are separate records, preserving Stage F/H immutable history. Each actual claim creates an attempt with correlation ID, job ID, attempt number, stage and timestamps. An active database lease causes duplicate delivery to do no work. READY/PUBLISHED/SUPERSEDED versions are no-ops. Old generations cannot claim a newer request, and old tokens cannot write chunks, embeddings, READY or failure state.

Default lease is 120 seconds, renewed every 40 seconds and between stages/batches. Reconciliation runs every 15 worker ticks (nominally 30 seconds), scanning 50 versions per cursor page. A dispatched request idle for ten minutes can be reissued. Automatic recovery is capped by attempt/generation budget; an authorized operator can explicitly request another generation. Old published knowledge remains current throughout candidate processing.

Chunk creation is atomic and unique by version/index. Retries retain matching chunks and reuse vectors within the same version/model. Parsing and provider requests run outside transactions. Embeddings use batches of four, at most eight by configuration; dimensions remain 1,536. READY commits only after chunk count and actual non-null vector count match the required coverage. Configured provider failure leaves FAILED, never partial semantic READY. With no embedding key, default policy permits explicit lexical-only READY; INGESTION_REQUIRE_SEMANTIC can forbid this. Retrieval excludes vectors with unknown/different model identity and reports incomplete semantic coverage. A model change requires a new version/rebuild, not mutation of published history.

## Validation/security

Default upload maximum is 10 MiB, configurable between 1 KiB and 25 MiB. Extension and MIME must agree: PDF/application-pdf; TXT/text-plain; Markdown/text-markdown or text-plain. Octet-stream is rejected. PDF requires %PDF- magic plus successful parsing. Text requires valid UTF-8, no binary controls and nonempty bounded content. Extracted text is limited to two million characters. PDF parsing runs in a child process with a 128 MiB V8 heap setting and a ten-second deadline; the heap limit does not bound all native allocations. Parser diagnostics are suppressed. No malware scanning is claimed; that remains future enterprise hardening.

S3 uses the official AWS SDK behind put/get/delete/exists/list. No public ACL, permanent URL, or browser storage credentials are generated. Configure bucket public-access blocking, encryption/retention and scoped credentials outside the app. Limit access to the configured bucket's knowledge prefix: GetObject, PutObject, DeleteObject and ListBucket. Production custom endpoints must use HTTPS; normal AWS SDK endpoints use HTTPS. SDK credentials use its standard credential chain; workload roles are preferable to static keys. ContentType is advisory metadata; validation uses actual bytes.

## Recovery table

| Failure | Detection and behavior | Operator action |
| --- | --- | --- |
| Object put fails | No version/outbox committed; safe storage error | Restore storage, retry upload |
| DB fails after put | Verified compensation, or retained unreferenced object | Inspect old orphan candidates; verify DB before any manual deletion |
| Redis unavailable | Outbox pending with exponential backoff (2-second base, five-minute cap) | Restore Redis; after 20 failed dispatches use explicit retry |
| Enqueue succeeds, acknowledgement fails | Claim retried with identical job ID | Usually none; monitor dispatch metadata |
| Provider/storage/DB transient failure | Up to three BullMQ attempts, exponential 2-second backoff | Restore dependency; OWNER/ADMIN may request another generation |
| Missing source/hash mismatch/invalid parse | Safe nonretryable failure | Restore verified legacy mapping where appropriate, otherwise upload corrected new version |
| Worker dies | Expired lease, recorded stale attempt and bounded reissue | Check worker capacity; manual retry after budget exhaustion |
| READY index inconsistency | Reported; publication checks block invalid candidates | Investigate, rebuild as new version; no destructive automatic repair |
| Ambiguous orphan/historical source | Read-only audit report | Verify retention/reference state before maintenance |

Offline commands, from apps/api after build:

- node dist/src/knowledge-ops.js reconcile [CURSOR]: one bounded page, repairs only unambiguous handoff/stale state.
- node dist/src/knowledge-ops.js inspect-orphans [CURSOR]: reports objects unreferenced for over 24 hours; never deletes.
- node dist/src/knowledge-ops.js audit-sources [CURSOR]: hashes at most ten sources; detects tampering, missing/mismatched backends; no mutation.
- node dist/src/knowledge-ops.js import-source VERSION_ID LEGACY_ROOT: imports an existing local source after realpath containment and SHA-256 verification, adding a mapping without changing version identity. Preserve the old directory/backup until audit finishes. Published sources without verified original bytes cannot be reconstructed from metadata.

Dispatched outbox retention is 30 days, deleting at most 100 eligible terminal-state events per cleanup call. Pending/failed undispatched events and durable attempts are retained. No destructive source GC, global vector cache or distributed event bus is introduced.

## Health, logs and administration

/health and /health/live are liveness. /health/ready reports safe database, Redis and storage states, returning 503 if any is unavailable. AI providers are not readiness dependencies. Redis unavailability can make readiness fail even while individual durable HTTP operations remain functional; configure load-balancer policy deliberately.

Requests accept 8–80 character alphanumeric/underscore/hyphen x-request-id values or generate UUIDs, returning the header. The ID flows through ingestion, outbox, job and attempts. HTTP logs contain status/duration/ID without URLs, headers or request bodies. Operation logs permit only safe scalar context fields and redact other values, including nested objects. Raw exceptions, passwords, tokens, cookies, prompts, conversations and document contents are not emitted by Stage I paths. Existing AI/retrieval latency, usage and provider diagnostics remain available in quality analytics.

OWNER/ADMIN GET /api/v1/organizations/ORG/kb/operations returns tenant-scoped stages, pending outbox, attempts, retry/stale/failure/success counts and mean attempt duration. Version history shows stage, attempts, last attempt, safe failure category, lexical/semantic coverage and retry controls. Worker logs periodically report aggregate queue counts and process counters. HTTP duration/status logs and storage failure counters require a log collector for cross-process retention; no paid observability service is required.

SIGINT/SIGTERM stops HTTP intake or worker maintenance, closes Socket.IO/BullMQ/Redis resources and Prisma. Completion is bounded to 30 seconds; timeout exits nonzero so the expired database lease can be recovered. A killed process cannot guarantee its final log reaches a collector.

## Environment names

| Name | Purpose/default |
| --- | --- |
| KNOWLEDGE_STORAGE | filesystem locally; s3 required in production |
| KNOWLEDGE_STORAGE_ROOT | Local private directory; ./data/knowledge |
| KNOWLEDGE_MAX_BYTES | 10 MiB default |
| S3_BUCKET / S3_REGION / S3_ENDPOINT | Private bucket, region and optional compatible endpoint |
| S3_FORCE_PATH_STYLE | false; true for many local compatible services |
| AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN | Standard SDK credential chain; never commit values |
| INGESTION_LEASE_MS | 120000; accepted 30000–3600000 |
| INGESTION_MAX_ATTEMPTS | 3; accepted 1–5 |
| INGESTION_EMBEDDING_BATCH | 4; accepted 1–8 |
| INGESTION_REQUIRE_SEMANTIC | false; true forbids lexical-only completion |
| DATABASE_URL / REDIS_URL | Existing shared services; rediss supports TLS and DB number |
| OPENAI_API_KEY / OPENAI_EMBEDDING_MODEL | Existing embedding provider configuration |

## Local/CI checks

Default filesystem mode needs no MinIO. docker compose -f docker-compose.test.yml up -d --build provides loopback-only pgvector/PostgreSQL, Redis and private test S3. The MinIO image is built from [the pinned upstream security release](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z), following upstream source-build distribution; it is a test fixture, not a production recommendation. Its first build requires network access and substantial Go compilation.

Local endpoints are PostgreSQL 127.0.0.1:55441, Redis 127.0.0.1:55440 and S3 http://127.0.0.1:55442. Set SUPPORTIQ_TEST_S3_PORT before Compose startup to override the S3 host port if Windows reserves it; set S3_TEST_ENDPOINT to the same port for tests.

CI enables SUPPORTIQ_TEST_PGVECTOR, SUPPORTIQ_TEST_REDIS and SUPPORTIQ_TEST_S3 explicitly and supplies S3_TEST_ENDPOINT. It runs migrations, builds, unit, PostgreSQL/BullMQ/S3/vector integration and client tests. Normal CI uses mocked paid providers. Local service tests intentionally skip unless those flags and services are present. A skipped test is not a pass.

Before production sign-off: execute the entire mandatory service suite, the 100+ chunk mocked-embedding benchmark, actual S3 provider smoke test with scoped credentials, worker crash/restart drill and deployment shutdown/readiness checks. No deployment or push was performed during this stage.
