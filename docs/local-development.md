# Local development

Use Node.js 22 and pnpm 10. This repository uses a committed lockfile. Install with `pnpm install --frozen-lockfile`; do not update unrelated dependencies while troubleshooting setup.

1. Clone the repository and install locked dependencies.
2. Copy apps/api/.env.example to apps/api/.env and apps/client/.env.example to apps/client/.env. Replace the access secret. Commands load environment from the application directory.
3. Start isolated local infrastructure: `docker compose -p supportiq-local -f docker-compose.test.yml up -d --build`. Ports: PostgreSQL 55441, Redis 55440, optional S3 55442. Stop another project using these ports first. The first MinIO source build requires network access and a Go compilation.
4. Create the disposable supportiq_demo database using PostgreSQL createdb/psql, then run `pnpm --dir apps/api db:generate` and `pnpm --dir apps/api exec prisma migrate deploy`. Never use db push as a deployment substitute.
5. To seed the disposable local database, set NODE_ENV=development and SUPPORTIQ_DEMO_RESET=ERASE_LOCAL_DEMO for the seed command only, then run `pnpm --dir apps/api db:seed`. The guard rejects remote/production databases and names other than supportiq_demo, supportiq_test or supportiq_e2e. Unset the reset variable afterward. This deliberately erases that local database's application data.
6. In separate terminals run `pnpm --dir apps/api dev`, `pnpm --dir apps/api dev:worker` and `pnpm --dir apps/client dev`.
7. Open http://localhost:5173. The intentionally public demo owner is read-only. Seeded staff/customer accounts use password123 only in this disposable fixture. Do not deploy these interactive staff credentials to a real workspace.

The API and worker must share the same storage configuration; local filesystem mode requires the same directory. Production requires private S3-compatible storage. No provider key is necessary for lexical retrieval, deterministic abstention or the safe template fallback. Configuring a provider changes behavior and may incur cost.

See testing.md for isolated service flags and E2E. The current Windows development environment shares node_modules via worktree junctions; direct Node CLI invocations were used where pnpm's runtime auto-install rejected that layout. A fresh checkout should use its own installed node_modules.
