# ADR 002 — PostgreSQL FTS + pgvector hybrid retrieval

Status: accepted; records the implemented decision.

## Context

Support queries include exact identifiers and paraphrases; tenant scope must apply to every candidate.

## Decision

Use PostgreSQL lexical and vector candidates with current-publication or explicit replay-version scope.

## Alternatives

Vector-only retrieval, FTS-only retrieval, external search service.

## Consequences

One operational database; vector availability/model compatibility affects coverage and is reported.

Implementation: apps/api/src/modules/knowledge-base/kb.lexical.ts; kb.vector.ts; kb.scope.ts.
