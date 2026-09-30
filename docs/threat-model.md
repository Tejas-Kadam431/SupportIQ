# Threat model

Assets: tenant conversations, internal notes, source files, credentials, immutable knowledge and AI history. Trust boundaries: browser→API, API→database/storage, worker→queue/provider, provider output→human approval. Administrators are trusted within their tenant but cannot bypass other tenants' authorization.

| Threat | Implemented mitigation | Residual risk |
| --- | --- | --- |
| Cross-tenant IDOR | Current membership/ownership checks and organization-scoped queries on ticket, KB, quality and replay routes | New routes must preserve checks; point-in-time reads can race revocation |
| Stolen refresh token/replay | Opaque hashed tokens, session-family locking/rotation, reuse revokes family, cookie-only transport | Stolen access JWT works until expiry; device compromise remains possible |
| Stale socket permission | Join and per-socket delivery authorization; token expiry disconnect; fail closed | Multi-instance delivery needs shared adapter plus the same permission logic |
| Malicious upload/path traversal | Server UUID keys, size/MIME/extension/UTF-8/PDF checks, source hashes, isolated parser deadline | No malware scanner; native parser allocation is not fully bounded by V8 heap |
| Object exposure | Private S3 adapter, no public URLs or client-selected keys; scoped authenticated KB routes | Bucket/IAM policy must be verified for the actual deployment |
| Prompt injection | Deterministic evidence gating, source snapshots, no model tool/action execution, human send approval | Retrieved/customer text can influence a model; gating is not an injection-proof sandbox |
| Hallucination/weak evidence | Evidence Policy v2, abstention, explicit provenance, human review and replay | Semantic relevance and human feedback are imperfect; generated text is not proof |
| Admin misuse | Tenant RBAC, demo write guards, immutable historical identities and publication actions | Authorized admins can publish poor content; no dual-control approval system |
| Replay sends/mutates conversations | Evaluation core separated from messaging; integration tests assert unchanged production messages | Future edits must preserve the side-effect boundary |
| Secret leakage | Safe auth/realtime/operation error categories; no refresh JSON; environment files ignored | Provider credentials and platform logs require operator discipline |
| Queue duplication/stale workers | Durable outbox, deterministic IDs, DB generation/token fencing, renewable leases | External work may be repeated; storage/DB compensation can retain orphan objects |
| Destructive demo reset | Explicit opt-in, nonproduction mode, local host and disposable DB name | An operator with database access can still deliberately erase data |
| Resource exhaustion | Upload/text limits, bounded worker batches, replay caps, history pages and request limiting | No enterprise-volume load test or distributed per-user quota system |

HTTPS, private storage, database backups and trustworthy proxy topology are deployment requirements. No compliance certification, SSO, malware elimination or zero-risk claim is made.
