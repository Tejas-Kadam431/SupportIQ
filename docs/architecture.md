# Architecture

SupportIQ is a modular monolith with a separately started ingestion worker. PostgreSQL owns durable permissions, ticket state, provenance and ingestion correctness. Redis transports work; it is not the authority for completion.

```mermaid
flowchart LR
  Browser[React client] --> API[Express API + Socket.IO]
  API --> DB[(PostgreSQL + pgvector)]
  API --> Objects[Private object storage]
  Worker[Ingestion worker + dispatcher] --> DB
  Worker --> Redis[(Redis / BullMQ)]
  Worker --> Objects
  Worker --> Embeddings[Embedding provider]
  API --> Models[Generation providers]
```

## Reliability loop

```mermaid
flowchart LR
  Ticket --> Retrieval[FTS + optional vector search]
  Retrieval --> Policy[Deterministic evidence policy]
  Policy --> Reply[Suggestion or abstention]
  Reply --> Human[Human decision]
  Human --> Signal[Qualifying failure signal]
  Signal --> Issue[Knowledge Issue]
  Issue --> Version[Immutable candidate version]
  Version --> Replay[Historical replay + guardrails]
  Replay --> Verification[Explicit verification]
```

Generation never sends a message. Copilot send atomically records one decision and the human-approved public message. Replay calls the evaluation core without message side effects. A published version remains available while a replacement is prepared.

## Ingestion sequence

```mermaid
sequenceDiagram
  participant A as API
  participant S as Private storage
  participant D as PostgreSQL
  participant Q as BullMQ
  participant W as Worker
  A->>S: Validate and store source bytes
  A->>D: Commit version + mapping + ingestion + outbox
  A-->>A: Return durable upload success
  W->>D: Claim outbox with token/lease
  W->>Q: Enqueue deterministic version/generation ID
  W->>D: Record dispatch acknowledgement
  Q->>W: At-least-once delivery
  W->>D: Claim processing lease
  W->>S: Fetch and verify source hash
  W->>W: Parse, chunk, batch embeddings
  W->>D: Fenced writes and atomic READY
  A->>D: Admin explicitly publishes READY version
```

A crash between queue acceptance and acknowledgement can repeat delivery. Database generation/token checks, unique chunk identities and terminal-state no-ops protect correctness. Multiple API instances require a Socket.IO Redis adapter or equivalent shared adapter; adding it does not replace delivery-time authorization.
