# Architecture decisions

- [001 — Modular monolith over microservices](001-modular-monolith.md)
- [002 — PostgreSQL FTS + pgvector hybrid retrieval](002-hybrid-retrieval.md)
- [003 — Reciprocal Rank Fusion](003-rank-fusion.md)
- [004 — Deterministic evidence gating and abstention](004-evidence-policy.md)
- [005 — Opaque rotating refresh tokens and session-family reuse detection](005-refresh-sessions.md)
- [006 — Immutable knowledge versions](006-knowledge-versions.md)
- [007 — Human feedback as a product-quality signal](007-human-feedback.md)
- [008 — Historical replay before knowledge rollout](008-historical-replay.md)
- [009 — Transactional outbox and idempotent BullMQ worker](009-outbox-worker.md)
- [010 — Private S3-compatible object storage abstraction](010-object-storage.md)

The earlier 005-ingestion-reliability.md is retained as the original Stage I record so historical links remain valid. The final numbered outbox/storage decisions are ADR 009 and ADR 010.
