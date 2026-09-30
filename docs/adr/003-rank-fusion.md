# ADR 003 — Reciprocal Rank Fusion

Status: accepted; records the implemented decision.

## Context

Text rank and cosine similarity are not directly comparable.

## Decision

Fuse ranked candidate lists with RRF and retain per-source diagnostics.

## Alternatives

Weighted raw score sums or a learned reranker.

## Consequences

Deterministic rank combination, but parameters and candidate selection require fixtures and do not prove relevance.

Implementation: apps/api/src/modules/knowledge-base/kb.hybrid.ts; kb.retrieval.ts.
