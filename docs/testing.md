# Test matrix

| Layer | Behavior | Command |
| --- | --- | --- |
| API unit | JWT/policies, evidence/retrieval logic, bounded parsing, redaction, shutdown and seed guard | pnpm --dir apps/api test:unit |
| PostgreSQL integration | Tenant/RBAC, refresh races, first response, immutable provenance/publication, issues/replay and ingestion | pnpm --dir apps/api test:integration |
| Real services | Redis/BullMQ, private S3, pgvector | Same integration command with explicit flags below |
| Client | Feedback terminal state, quality/replay and version/retry UI | pnpm --dir apps/client exec vitest run --pool=threads --maxWorkers=1 |
| Browser E2E | Login, lifecycle/edit/send, abstention, KB prepare/publish, issue/replay and customer boundary | pnpm exec playwright test |

Start docker-compose.test.yml with project supportiq-stage-i (or another nonconflicting name). Configure DATABASE_URL for supportiq_test on port 55441, REDIS_URL on 55440, JWT_ACCESS_SECRET with a test-only value, and NODE_ENV=test. Enable SUPPORTIQ_TEST_PGVECTOR=1, SUPPORTIQ_TEST_REDIS=1, SUPPORTIQ_TEST_S3=1 and S3_TEST_ENDPOINT=http://127.0.0.1:55442. Leave paid provider keys unset. Run Prisma validate/generate and migrate deploy before integration tests. Flags off intentionally skip external services; final acceptance must enable all flags.

Playwright installs Chromium with `pnpm exec playwright install chromium` (CI uses --with-deps). Build the API first. Its config starts API/worker/client, creates and guarded-resets supportiq_e2e on localhost, and uses Redis database 1. It must never target a real database. It does not retry failing tests automatically. Browser screenshots/traces and test state are ignored artifacts, not application code. E2E_DATABASE_URL and E2E_REDIS_URL support isolated CI service addresses; the seed safety guard still applies.

Fresh migration and supported-upgrade checks are separate from behavioral tests. Final execution counts, environment, failures and limitations are recorded in the Stage J report, not inferred from test discovery. GitHub-hosted CI cannot be claimed green until a pushed commit actually runs; this phase does not authorize a push.

## Supported migration target

Use the PostgreSQL public schema as in the provided DATABASE_URL templates. A custom Prisma schema search_path that excludes the schema containing pgvector is not supported by the existing historical migration chain; an isolated-schema probe failed to resolve vector. Do not rewrite an applied migration to conceal this. The baseline-to-current check instead creates a fresh disposable database with public, applies the original five migrations, inserts retained users/organization/ticket/Copilot run/evaluation, then deploys all thirteen and compares every original column. Original values are preserved and the old run remains provenanceVersion=0 / LEGACY.

Reproduce from apps/api with a local supportiq_test DATABASE_URL and SUPPORTIQ_MIGRATION_CHECK=LOCAL_SYNTHETIC: `node ../../tooling/benchmarks/upgrade.mjs`. The database role needs CREATEDB. The script creates and drops only its generated disposable database; its migration source copies live in an OS temporary directory. Do not use important data for validation.
