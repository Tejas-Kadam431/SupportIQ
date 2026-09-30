# ADR 001 — Modular monolith over microservices

Status: accepted; records the implemented decision.

## Context

Ticket, identity, knowledge and feedback changes require shared transactions.

## Decision

Keep Express modules and one database; run ingestion as a separate process from the same repository.

## Alternatives

Separate services or a single process doing every job.

## Consequences

Simple local transactions and deployment; organization locks and shared schema couple modules.

Implementation: apps/api/src/app.ts; apps/api/src/worker.ts.
