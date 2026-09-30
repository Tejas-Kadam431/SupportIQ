# ADR 006 — Immutable knowledge versions

Status: accepted; records the implemented decision.

## Context

Mutable chunks make historical suggestions and replay evidence impossible to reproduce.

## Decision

Separate document identity, immutable versions/chunks and an explicit current-publication pointer.

## Alternatives

Overwrite a document in place or snapshot only its filename.

## Consequences

More retained storage and migrations; database guards and linked snapshots preserve evidence identity.

Implementation: apps/api/src/modules/knowledge-base/kb.version.service.ts; prisma/migrations/20260927010000_knowledge_versions.
