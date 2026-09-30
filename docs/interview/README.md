# Interview preparation

These notes are an ownership syllabus, not a claim that memorizing answers equals understanding. Trace the code and run the adversarial tests before using the bullets in an interview.

- [Ownership map](ownership-map.md): sixteen subsystems and eight questions per subsystem.
- [Question bank](question-bank.md): implementation-based prompts and talking points.
- [Code reading map](code-reading-map.md): ordered concepts, code and tests.

## Three resume bullets

- Built a multi-tenant support platform with PostgreSQL/pgvector hybrid retrieval, deterministic evidence gating and human-controlled AI replies; linked historical failures to immutable knowledge versions and replay-based verification.
- Implemented rotating refresh sessions with reuse detection, current-membership authorization for critical writes and Socket.IO delivery, and transactional ticket/feedback workflows with adversarial concurrency tests.
- Built durable asynchronous knowledge ingestion using private object storage, a PostgreSQL outbox and BullMQ workers with processing leases, stale-worker fencing and recovery; added five browser workflows covering support, abstention, publication, replay and customer isolation.

## 30 seconds

SupportIQ helps support teams understand and correct AI failures. It retrieves tenant-specific knowledge, abstains when evidence is weak, and leaves every customer message under human control. Agent decisions feed Knowledge Issues; teams prepare versioned fixes and replay historical cases before marking a fix verified. The core differentiator is the traceable correction loop, not merely calling an LLM.

## Two minutes

SupportIQ is a React and Express modular monolith with separate API and ingestion-worker processes. PostgreSQL stores tenants, tickets, knowledge versions, AI provenance and experiments; FTS and pgvector feed Reciprocal Rank Fusion. Redis/BullMQ coordinates asynchronous processing, and private object storage retains source files.

The important boundary is evidence before generation. Deterministic policy can abstain or report degraded retrieval rather than treating model confidence as proof. A human accepts, edits or rejects a suggestion; the send transaction records that decision with the public message. Qualifying knowledge failures become persistent issues. Admins prepare an immutable replacement, compare historical inputs with the candidate in Reliability Lab, publish explicitly, and verify against failures plus successful guardrails.

Security and concurrency are part of this loop: tenant checks, current membership, single-use refresh rotation, delivery-time socket checks, publication locks and stale-worker fences. Tests include real database/queue/storage integration and five browser flows. The demo's success numbers are synthetic fixtures. The project has no enterprise-scale load-test or universal AI-accuracy claim, and horizontal realtime needs a shared adapter.

## Five minutes

Start with the problem: an apparently fluent support answer may be grounded in weak or stale policy. A thumbs-down counter cannot explain which source caused a failure or whether replacing it helped.

Walk through a ticket. The API authorizes the current user, captures a bounded conversation, retrieves only organization-scoped published knowledge and combines lexical/vector rankings. An evidence policy decides whether the input is sufficiently supported. Provenance records the exact context, versions, evidence and configuration. Provider fallback does not bypass that gate. The user sees evidence and can edit or reject; nothing sends automatically.

Explain the correction loop. Accepted/edited/rejected decisions have different meanings; a tone edit is not a knowledge defect. Qualifying failures become persistent Knowledge Issues with source attribution. Knowledge versions are immutable after preparation, and a replacement remains separate from the published pointer. Reliability Lab snapshots historical inputs and baseline outcomes, pins candidate versions, runs bounded comparisons and preserves successful guardrails. VERIFIED means those historical cases passed, not that all future questions will.

Describe the architecture. A modular monolith avoids distributed coordination across business modules. PostgreSQL holds relational state and vector/lexical search. API and worker run separately. Upload stores a server-generated private object, commits version/ingestion/outbox state, then a dispatcher submits BullMQ work. Delivery can duplicate. Generation-specific job identities, leases and database fences stop stale results from overwriting current state. Reconciliation repairs recoverable interruptions; there is no exactly-once claim.

Discuss difficult races. Refresh rotation locks a session, consumes it once and commits family revocation on reuse. Critical writes lock organization state before rechecking membership. Ticket transitions, assignment and first response use transactional checks. Copilot send atomically records the decision and message; realtime occurs after commit. Publication locks the document and checks the expected current version. These are READ COMMITTED transactions with explicit locks, not universal serializability.

Finish with evidence and limits. Unit tests cover policy; real service tests exercise migrations, tenant isolation, races, leases, Redis and S3; browser tests exercise the complete product loop without paid providers. Local synthetic benchmarks describe their dataset rather than promise an SLA. Remaining limitations include imperfect labels, finite fixtures, no malware scanner and a shared adapter requirement for multiple realtime API instances. Explain what you personally inspected and changed; do not claim operational experience you have not had.
