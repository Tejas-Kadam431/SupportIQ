# Render demo recovery

## Verified incident, October 2, 2026

The API returned HTTP 500 for the public demo login. Render's latest build failed with Prisma P1001 because its configured PostgreSQL host was unreachable. The last successful API release was 6f5b5e2, while deployment of cd766a2 failed. The dashboard had no active PostgreSQL instance. This is a database/deployment outage, not a bad demo password.

With owner approval, a replacement free PostgreSQL 16 database, `supportiq-db`, was created in Singapore. Render reports expiry on **November 1, 2026**. Its internal URL was saved to the API's DATABASE_URL using **Save only**. No production deploy or demo reset was performed. Previous database data has not been recovered.

The hardened API requires private S3 storage in production. No storage configuration was present in Render. API automatic deploys are temporarily Off until storage and release operations are ready; restore automatic deployment after successful smoke tests. Do not set NODE_ENV=development or disable that requirement to bypass deployment checks.

## Configure Cloudflare R2

1. Sign in to Cloudflare and open **Storage & databases → R2 → Overview**. Complete account/billing setup yourself if requested. R2 has usage-based billing beyond its free allowance; review the current pricing before activation.
2. Create a **Standard** bucket named `supportiq-knowledge`. Keep public development URLs and custom public domains disabled.
3. In R2 API Tokens, create an API token with **Object Read & Write**, scoped to this bucket only. Save its Access Key ID and Secret Access Key in your password manager. Do not paste them into GitHub or chat.
4. Open Render → SupportIQ → Environment → Edit. Add the following variables, entering the two credentials yourself:

| Variable | Value |
| --- | --- |
| KNOWLEDGE_STORAGE | s3 |
| S3_BUCKET | supportiq-knowledge |
| S3_REGION | auto |
| S3_ENDPOINT | https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com |
| S3_FORCE_PATH_STYLE | true |
| AWS_ACCESS_KEY_ID | Your R2 Access Key ID |
| AWS_SECRET_ACCESS_KEY | Your R2 Secret Access Key |

Use **Save only** until the release configuration is ready. The API uses the AWS SDK credential chain. Set the same database, Redis and storage settings on the ingestion worker; run it with `node dist/src/worker.js` from apps/api. The current Render workspace has no worker service, so uploads cannot complete processing until a worker is deployed. Seeded demo knowledge remains inspectable without new uploads.

Sources: [R2 S3 setup](https://developers.cloudflare.com/r2/get-started/s3/), [scoped tokens](https://developers.cloudflare.com/r2/api/tokens/), [pricing](https://developers.cloudflare.com/r2/pricing/).

## Release and first-time synthetic demo provisioning

For this **new empty database only**, migrate once with `pnpm --dir apps/api exec prisma migrate deploy`. Replace the old Render build command that ran `prisma db push` and unconditional reset/seed. Do not baseline a newly empty database or duplicate migrations.

The Render API build command was updated to the normal build below, removing database push and unconditional seed. No release was triggered. Normal build command:

```sh
corepack enable && pnpm install --frozen-lockfile && pnpm --dir apps/api db:generate && pnpm --dir apps/api build
```

Start command: `pnpm --dir apps/api start`. Run migration as a single controlled release operation before starting the API against the new database. On a free service without a pre-deploy step, temporarily append `&& pnpm --dir apps/api exec prisma migrate deploy` to the build command for this single release.

Before routing application traffic to the new database, provision the synthetic demo once:

```sh
SUPPORTIQ_PROVISION_EMPTY_DEMO=supportiq_3qlr pnpm --dir apps/api db:seed
```

The exact database name is explicit opt-in. Every Prisma application model is counted; any existing row aborts provisioning. This mode never calls reset/delete. It is a first-time maintenance operation, not a repeated startup step. If it partially fails, inspect/recover the new database; do not relax the empty check. Remove the provisioning flag/command after success. The original destructive seed remains restricted to disposable local development/test databases.

Verify `/health/live`, `/health/ready`, demo login, normal registration/login/logout and cookie refresh. Readiness must pass database, Redis and private storage checks. Verify a controlled upload only after the worker is running. Do not declare the demo repaired based only on a frontend build or database creation.

## Naming cleanup

The active branch is `supportiq-hardening`, PR #2 has a neutral title, and current tracked documentation uses neutral checkout descriptions. Historical merge messages and old snapshots remain in Git history. Removing those would require a separately reviewed history rewrite; ordinary commits do not erase historical records.

## Change validation

API TypeScript build passed. Both seed safety tests passed. Client TypeScript, lint and production build passed; all 31 pre-existing/current client tests passed, followed by five focused authentication tests including demo outage recovery and successful retry. The added retry test isolates form resolution because it exercises the direct demo action; schema normalization has separate coverage. Login and registration routes were reviewed in the local browser. The screenshot is `docs/screenshots/auth-refresh.png`. No successful live login or hosted registration has yet been verified.
