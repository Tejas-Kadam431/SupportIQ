# ADR 004 — Deterministic evidence gating and abstention

Status: accepted; records the implemented decision.

## Context

A fluent model response is not evidence that policy knowledge supports an answer.

## Decision

Apply explicit coverage/agreement/conflict/customer-information rules before generation.

## Alternatives

Prompt-only confidence or always generating an answer.

## Consequences

Reproducible abstention decisions; conservative rules can abstain on useful evidence and miss subtle contradictions.

Implementation: apps/api/src/modules/ai/evidence-policy.ts; ai.core.ts.
