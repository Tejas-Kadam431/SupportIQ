# ADR 005 — Opaque rotating refresh tokens and session-family reuse detection

Status: accepted; records the implemented decision.

## Context

A copied refresh credential can otherwise be reused across rotations.

## Decision

Hash opaque tokens, rotate once under a family row lock and revoke the family on detected reuse.

## Alternatives

Long-lived refresh JWTs or overwriting the token without retained consumption history.

## Consequences

Replay protection with committed revocation; existing access JWT expires normally and concurrent legitimate refresh must be coordinated client-side.

Implementation: apps/api/src/modules/auth/auth.service.ts; apps/client/src/app/api.ts.
