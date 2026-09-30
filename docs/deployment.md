# Deployment readiness and operator checklist

Deployment is not performed by this phase. Local acceptance and build success do not verify your cloud credentials, network policy or running release.

## Runtime boundaries

- Static React client: install locked dependencies and build apps/client. Supply VITE_API_BASE_URL and VITE_SOCKET_URL at build time. Configure SPA fallback to index.html.
- API: build TypeScript, generate Prisma and start `node dist/src/server.js` from apps/api. It owns HTTP and Socket.IO, never the ingestion worker.
- Worker: same artifact/environment, start `node dist/src/worker.js` from apps/api. It owns dispatcher, reconciliation and BullMQ consumption.
- PostgreSQL must support pgvector. Redis and private S3-compatible storage are shared dependencies. Use TLS and scoped credentials from the platform secret store.
- Liveness is /health/live. Readiness is /health/ready and checks database, Redis and storage; paid AI provider health is intentionally excluded.

## Configuration

CLIENT_URL is the exact comma-separated frontend origin allowlist for both HTTP and Socket.IO. Do not use wildcard credentialed CORS. Production refresh cookies are Secure and SameSite=None; serve both applications over HTTPS. Current Express trust proxy is one hop: expose the API only through one trusted reverse proxy that overwrites forwarding headers, or adjust this setting for your real topology before exposure. Access secrets must be random and consistent for intended API instances. Keep refresh cookies out of JSON and browser storage.

Set KNOWLEDGE_STORAGE=s3, S3_BUCKET, S3_REGION and optional HTTPS S3_ENDPOINT. Use the SDK credential chain with only required bucket/object permissions. Block public access and anonymous reads. API and worker must use the same bucket/key namespace and embedding model. Import retained legacy source files with the guarded offline import command before expecting them to reprocess; do not rewrite historical versions.

## Ordered checklist

1. Take and verify a restorable database backup; retain source objects.
2. Provision PostgreSQL and pgvector; check extension permissions and connection limits.
3. Provision private Redis; verify TLS/auth/connectivity and retention requirements.
4. Provision private object storage; verify scoped credentials and denied anonymous reads.
5. Set secrets and exact client origins; verify reverse-proxy trust and HTTPS cookies.
6. Run `prisma migrate deploy` once as a release step. Do not run migrations concurrently from every replica.
7. Start the worker and inspect sanitized startup/queue logs.
8. Start the API and verify liveness/readiness.
9. Build/deploy the client with the intended URLs and SPA fallback.
10. Smoke-test login, cookie rotation, logout and an unauthorized tenant/customer path.
11. Smoke-test ticket lifecycle and a human-sent public message; confirm internal notes are private.
12. Upload a controlled KB fixture; verify READY, then explicit publication; inspect retry/history.
13. Run a controlled Copilot case; inspect evidence and human decision. Do not enable paid live tests in normal CI.
14. Inspect correlation/error logs and outbox backlog; exercise an outage/recovery drill in staging.
15. Verify shutdown deadlines, backups, rollback artifact and old-client compatibility. Do not undo immutable migrations with destructive down scripts.

Multiple API instances require a Socket.IO Redis adapter or equivalent shared adapter. That work is deferred until deployment actually needs it. See ingestion-operations.md for recovery categories, orphan audits and graceful shutdown details.

## Container artifacts

Build from the repository root with `docker build -f tooling/api.Dockerfile -t supportiq-api:local .`. Run the same image with `node dist/src/worker.js` for the worker. The image runs application processes as the unprivileged node user, includes the Prisma CLI for an explicit release migration, and deliberately does not migrate or seed on startup. Runtime secrets are injected by the platform, not copied into the image. The build currently retains development dependencies; image minimization is deferred rather than risking Prisma/native parser packaging changes.

Build the static client with tooling/client.Dockerfile and explicit VITE_API_BASE_URL / VITE_SOCKET_URL build arguments. nginx.conf supplies SPA fallback; terminate HTTPS at the trusted deployment proxy. The client image is a static server, not a proxy for the API. Use managed PostgreSQL/pgvector, Redis and private S3 as described above; docker-compose.test.yml is disposable local infrastructure and must not be exposed as a production deployment.

Use schema=public for the supported migration path. Custom schema deployments need a separately reviewed pgvector extension/search_path plan; the existing migration history must not be edited after application.
