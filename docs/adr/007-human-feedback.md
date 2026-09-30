# ADR 007 — Human feedback as a product-quality signal

Status: accepted; records the implemented decision.

## Context

Teams need to know whether suggestions helped and which failures recur.

## Decision

Persist accepted/edited/rejected decisions with atomic send provenance and conservative signal classification.

## Alternatives

Thumbs-up telemetry detached from the message or automatically treating all edits as factual failures.

## Consequences

Actionable history with denominators; selection bias and subjective feedback remain.

Implementation: apps/api/src/modules/ai/ai.decision.ts; apps/api/src/modules/knowledge-issues/issue.classification.ts.
