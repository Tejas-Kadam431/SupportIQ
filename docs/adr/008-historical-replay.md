# ADR 008 — Historical replay before knowledge rollout

Status: accepted; records the implemented decision.

## Context

Publishing a proposed fix does not establish that the original failures improved.

## Decision

Snapshot cases and candidate scope, replay through the shared evaluation core, compare failures and successful guardrails.

## Alternatives

Manual spot-checks or production A/B traffic alone.

## Consequences

Inspectable bounded evidence; historical/synthetic cohorts limit generalization and live providers can vary.

Implementation: apps/api/src/modules/reliability/replay.case.ts; replay.execution.ts.
