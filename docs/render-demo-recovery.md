# Render demo recovery

## Verified recovery, November 23, 2026

The expired Render PostgreSQL service is absent. Supabase storage was unavailable while the original supportiq-storage project was paused; the owner restored that project, restoring private storage connectivity. The owner reset the Supabase PostgreSQL password and entered it directly into Render. No new paid service was created.

The API now uses PostgreSQL in the existing Supabase project through its session pooler on port 5432, TLS required, connection_limit=3, and a dedicated supportiq schema. Keeping application tables outside public avoids exposing them through the default public Data API schema. No Data API schema exposure or permissions were broadened. Existing storage-managed schemas were retained.

Controlled recovery deployment dep-dc2369e8bjmc73b6kmg0 uses the same application commit as the previous live API, b04ac855f11c4cbd5a66ee323b3d242ee533b356. GitHub main has since advanced to 79bb000 with documentation/README changes only; those were not overwritten. All thirteen existing migrations applied successfully, then the guarded empty-application-database seed completed. The opt-in used the exact database name postgres; application-model counts gate provisioning and no reset/delete ran. Twenty-one synthetic demo tickets were restored. This is fresh demo data, not recovery of the deleted Render database's previous records.

The temporary seed command was removed and the normal migration-only build command below was verified saved. API automatic deploys remain Off. Future builds must not repeat first-time seeding.

Live checks: liveness/readiness 200; database, Redis and storage ready; demo login/me/organizations/dashboard/tickets/knowledge documents 200; knowledge search 200 with two lexical results; demo ticket writes denied 403. Refresh rotation returned 200 and consumed-cookie replay 401; logout returned 200 and subsequent refresh 401. The live frontend Try Demo Account button reached the seeded dashboard successfully. One synthetic verification account registered with 201 and logged in/out with 200; random credentials were not printed or committed.

Knowledge search reports DEGRADED with semanticStatus=NOT_CONFIGURED and lexicalStatus=OK. Semantic embeddings are not configured. The earlier custom-schema pgvector limitation in the Stage J record remains relevant: this recovery establishes migrations, auth, dashboard and lexical retrieval in supportiq, not a validated semantic/vector upload pipeline. No ingestion worker was added, and uploads/background processing remain outside this recovery. Supabase inactivity pausing and Render cold starts still apply. The previously recorded S3 key replacement remains outstanding; resetting the database password does not rotate the S3 key.

## Verified recovery, October 2, 2026

The original login HTTP 500 was a database/deployment outage: Prisma P1001 reported an unreachable retired PostgreSQL host. No previous database data has been recovered.

With owner approval, a replacement free PostgreSQL 16 database, `supportiq-db`, was created in Singapore. It expires **November 1, 2026**. An initial recovery deployment still encountered the old hostname because the masked environment editor had retained the previous value. DATABASE_URL was corrected and its saved hostname verified before retrying.

Commit `b04ac85` successfully deployed to the API. Existing migrations were applied to the new empty database and synthetic demo data was provisioned once using `SUPPORTIQ_PROVISION_EMPTY_DEMO=supportiq_3qlr`. This guarded mode counts every Prisma application model, refuses a nonempty database, and never resets/deletes data. The one-time provisioning command was removed immediately after success. The original destructive seed guard remains restricted to disposable local development/test databases.

## Private storage without R2 billing

Cloudflare R2 was not activated because the owner declined payment details. The owner created a Supabase Free project, `supportiq-storage`, and an S3 access key. Its private bucket `supportiq-knowledge` has public access disabled. Render uses:

| Variable | Value |
| --- | --- |
| KNOWLEDGE_STORAGE | s3 |
| S3_BUCKET | supportiq-knowledge |
| S3_REGION | ap-northeast-2 |
| S3_ENDPOINT | https://swsxnloizgcojdkxmair.storage.supabase.co/storage/v1/s3 |
| S3_FORCE_PATH_STYLE | true |
| AWS_ACCESS_KEY_ID | Secret stored only in Render |
| AWS_SECRET_ACCESS_KEY | Secret stored only in Render |

The one-time Supabase key screen appeared in browser-tool output. Treat that key as exposed within this chat: the owner must replace it and update Render, then revoke the old key. No credentials are committed here. The project is dedicated to SupportIQ because this S3 key has broad bucket access.

No ingestion worker exists in the Render workspace. New uploads cannot finish processing until a worker runs with the same database, Redis and storage configuration (`node dist/src/worker.js` from apps/api). Seeded knowledge remains inspectable. Readiness verifies storage connectivity, not the complete upload/processing path; immutable PutObject compatibility and end-to-end uploads remain unverified. Production storage/auth guards were not weakened.

## Saved release configuration

API build command:

```sh
corepack enable && pnpm install --frozen-lockfile && pnpm --dir apps/api db:generate && pnpm --dir apps/api build && pnpm --dir apps/api exec prisma migrate deploy
```

Start command: `pnpm --dir apps/api start`. No `prisma db push`, unconditional seed, or reset remains. Migration deploy runs as a controlled build step for the current single API service. API automatic deploys remain Off pending credential replacement; releases can be manually triggered. Do not add first-time seed provisioning to repeated builds/startup. If initial provisioning partially fails, inspect/recover the database without relaxing its empty check.

## Live verification

- `/health/live`: 200.
- `/health/ready`: 200; database, Redis and storage ready.
- Public demo login and authenticated `/me`: 200.
- Cookie refresh: 200; replay of consumed cookie: 401.
- Logout: 200; subsequent refresh: 401.
- One synthetic registration verification account: 201; its subsequent login/logout: 200. No organization was created for it. Random credentials were not printed or committed.
- Live frontend **Try Demo Account** reached the dashboard with 21 seeded tickets and Copilot analytics.

Free Render cold starts can still delay requests. The replacement database is temporary and requires migration/replacement before expiry. Storage key replacement and a worker remain outstanding; do not describe all deployment features as complete.

## Naming cleanup and code validation

The active branch is `supportiq-hardening`, PR #2 has a neutral title, and current tracked files contain no Codex naming. Historical merge messages and old snapshots remain in Git history. Ordinary commits do not erase them; removing them requires a separately reviewed history rewrite.

API TypeScript build and both seed safety tests passed. Client TypeScript, lint and production build passed; 31 client tests passed, followed by five focused authentication tests including outage recovery/retry. The retry test isolates form resolution for the direct demo action; schema normalization has separate coverage. Refreshed auth UI is recorded in `docs/screenshots/auth-refresh.png`.
