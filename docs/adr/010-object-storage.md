# ADR 010 — Private S3-compatible object storage abstraction

Status: accepted; records the implemented decision.

## Context

API-local disk cannot safely serve independently deployed workers or survive ephemeral deployment changes.

## Decision

Use private server-generated object keys through a small put/get/delete/exists/list interface; filesystem is local-only.

## Alternatives

Public bucket URLs, client-chosen paths, database blobs, shared API-local disk.

## Consequences

Provider-neutral operations and test adapter; object/DB consistency needs compensation and orphan audits.

Implementation: apps/api/src/common/storage.ts; apps/api/src/modules/knowledge-base/kb.source-import.ts.
