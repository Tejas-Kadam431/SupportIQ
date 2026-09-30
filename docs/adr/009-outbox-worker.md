# ADR 009 — Transactional outbox and idempotent BullMQ worker

Status: accepted; records the implemented decision.

## Context

Database commit and Redis enqueue cannot be one local transaction.

## Decision

Commit processing intent with the version; lease dispatch records and use deterministic version/generation jobs plus database-fenced worker writes.

## Alternatives

Enqueue inside the upload transaction, best-effort enqueue only, Kafka.

## Consequences

At-least-once dispatch and recovery complexity; duplicate external work is possible, but stale completion cannot publish.

Implementation: apps/api/src/modules/knowledge-base/kb.outbox.ts; kb.processing.ts; kb.reconcile.ts.
