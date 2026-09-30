# ADR 005 — Durable knowledge ingestion

Status: implemented and validated locally against PostgreSQL/pgvector, Redis and private S3-compatible storage.

1. Use a focused PostgreSQL transactional outbox. Upload success depends on durable intent, not Redis availability. SKIP LOCKED claims and stable generation IDs handle duplicate dispatch without a generic event bus.
2. Store private source objects through a narrow S3/filesystem interface. Original filenames never become keys. Compensate only after verifying absence of references; ambiguous failures remain auditable. Published sources are retained.
3. Treat BullMQ as at-least-once transport. PostgreSQL token leases, immutable versions, generation fencing, durable attempts and atomic readiness own correctness. Embedding batches and same-version/model reuse reduce retry cost.
4. Separate API and worker entry points within one modular monolith. Infrastructure remains PostgreSQL, Redis and object storage; no Kafka, Kubernetes or additional database.
5. Use bounded structured logs, safe context and request correlation. Persist important operational history in the database; aggregate process/HTTP metrics from logs. No observability vendor is required.
6. Isolate PDF parsing in a short-lived child process. A Windows native parser crash demonstrated that a worker thread was insufficient isolation. Enforce a deadline and V8 heap bound, while acknowledging native allocation limits.

Tradeoffs: a dispatcher adds eventual delivery latency and operational state; S3/DB coordination remains compensating, not atomic. Automatic retries and reconciliation are bounded, leaving an explicit operator path. Distributed Socket.IO deployment still needs a shared adapter. See ingestion-operations.md for procedures and limits.
