# SupportIQ

**SupportIQ** is an AI-powered customer support SaaS platform for managing support tickets, organization workspaces, customer conversations, internal notes, knowledge-base documents, and source-grounded AI reply drafts.

It is built as a full-stack, production-style SaaS project with authentication, multi-tenant organizations, RBAC, tickets, real-time messaging, background jobs, knowledge-base search, AI draft generation, read-only recruiter demo protection, CI, and deployment.

## Live Demo

- **Live App:** https://supportiq-client.onrender.com
- **API Health:** https://supportiq-ns1i.onrender.com/health
- **GitHub Repository:** https://github.com/Tejas-Kadam431/SupportIQ

### Demo Account

Use the recruiter demo account for a clean read-only walkthrough:

```txt
Email: demo.owner@supportiq.app
Password: password123
```

The demo workspace is intentionally read-only. You can view tickets, search the knowledge base, and generate AI drafts, but create/update/delete actions are blocked to keep the public demo clean.

To test full editing workflows, create your own account from the app.

---

## Screenshots

### Login

![SupportIQ Login](docs/screenshots/login.png)

### Dashboard

![SupportIQ Dashboard](docs/screenshots/dashboard.png)

### Tickets

![SupportIQ Tickets](docs/screenshots/tickets.png)

### AI Draft with Knowledge Grounding

![SupportIQ AI Draft](docs/screenshots/ticket-details-ai.png)

### Knowledge Base Search

![SupportIQ Knowledge Base](docs/screenshots/knowledge-base.png)

### Read-only Demo Protection

![SupportIQ Read-only Demo](docs/screenshots/demo-readonly.png)

---

## Key Features

### Authentication and Organizations

- JWT-based authentication with access and refresh tokens
- Secure cookie-based refresh flow
- Multi-tenant organization workspaces
- Role-based access control for owners, admins, agents, and customers
- Protected organization member management

### Ticket Management

- Create, view, filter, and manage support tickets
- Ticket status and priority tracking
- Ticket assignment and unassignment
- Customer and assignee metadata
- Public ticket messages
- Private internal notes for support staff
- Ticket activity timeline and audit trail

### AI Reply Drafts

- AI-powered support reply generation
- Gemini-powered draft generation in the deployed demo
- Safe fallback draft generator when external AI is unavailable
- Tone selection: professional, friendly, and concise
- Confidence indicators and review warnings
- Knowledge-base grounded sources shown to support agents
- Source cards with excerpts and full chunk visibility

### Knowledge Base

- Upload support documents such as TXT, Markdown, and PDF
- Background document processing with Redis and BullMQ
- Text extraction and chunking
- Knowledge-base search for support policies and product information
- pgvector-ready semantic search architecture
- Keyword fallback search when embeddings are unavailable

### Real-time Support Experience

- Socket.IO powered real-time ticket message updates
- Multi-tab message synchronization
- Live ticket conversation refresh

### Dashboard and Analytics

- Support workspace overview
- Ticket counts and status distribution
- Priority distribution
- Recent ticket activity
- Knowledge-base and AI assistant summary cards

### Demo Safety

- Public recruiter demo account is protected as read-only
- Backend-level write protection prevents demo data pollution
- Create/update/delete/send/upload actions are blocked for demo users
- Read-only mode still allows browsing, searching, and AI draft generation

---

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- React Router
- Redux Toolkit
- RTK Query
- React Hook Form
- Zod
- CSS modules/global feature styles

### Backend

- Node.js
- Express
- TypeScript
- Prisma ORM
- PostgreSQL
- JWT authentication
- Zod validation
- Socket.IO
- Redis
- BullMQ
- Multer uploads
- Helmet and rate limiting

### AI and Search

- Gemini API for AI draft generation
- OpenAI-compatible architecture support
- Knowledge-base chunk retrieval
- pgvector-ready semantic search design
- Keyword fallback search

### Testing, CI, and Deployment

- Jest
- Supertest
- GitHub Actions CI
- Render backend deployment
- Render static frontend deployment
- Render PostgreSQL
- Render Redis / Key Value

---

## Architecture Overview

```txt
supportiq/
  apps/
    api/
      src/
        common/
          middleware/
          errors/
        config/
        modules/
          ai/
          auth/
          dashboard/
          knowledge-base/
          organizations/
          tickets/
        realtime/
        server.ts
        app.ts
      prisma/
        schema.prisma
        seed.ts

    client/
      src/
        app/
        features/
          auth/
          dashboard/
          knowledge-base/
          organizations/
          tickets/
        layouts/
        routes/
        utils/

  packages/
    shared/

  docs/
    screenshots/

  docker-compose.yml
  pnpm-workspace.yaml
```

---

## AI Grounding Flow

SupportIQ generates agent-facing AI reply drafts using ticket context and knowledge-base retrieval.

```txt
Ticket title + description
        ↓
Knowledge-base search
        ↓
Relevant chunks selected
        ↓
AI prompt built with ticket + sources
        ↓
Gemini generates customer-facing draft
        ↓
Support agent reviews draft, confidence, warnings, and sources
        ↓
Agent can copy or send the draft
```

The AI draft panel shows:

- AI provider
- Selected tone
- Confidence level
- Search query used for grounding
- Source count
- Source cards with document name, chunk number, score, excerpt, and full chunk

This makes the AI behavior reviewable instead of being a black box.

---

## Read-only Demo Protection

The deployed demo account is protected at the backend level.

Read-only demo users can:

```txt
View dashboard
View tickets
Open ticket details
View messages and internal notes
Search the knowledge base
Generate AI drafts
Copy AI drafts
```

Read-only demo users cannot:

```txt
Create organizations
Create tickets
Change ticket status
Assign tickets
Send messages
Add internal notes
Upload knowledge-base documents
Delete knowledge-base documents
Reprocess documents
Add, remove, or update members
```

Blocked actions return a clear error message:

```txt
Demo account is read-only. Please create your own account to modify data.
```

---

## Local Development

### Prerequisites

- Node.js 22+
- pnpm
- Docker Desktop
- PostgreSQL and Redis through Docker Compose

### Clone the Repository

```bash
git clone https://github.com/Tejas-Kadam431/SupportIQ.git
cd SupportIQ
```

### Install Dependencies

```bash
pnpm install
```

### Start PostgreSQL and Redis

```bash
docker compose up -d
```

### Backend Environment Variables

Create:

```txt
apps/api/.env
```

Example:

```env
NODE_ENV=development
PORT=4000

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/supportiq
REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

CLIENT_URL=http://localhost:5173

GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

DEMO_READONLY_EMAILS=demo.owner@supportiq.app
UPLOAD_ROOT_DIR=uploads
```

### Frontend Environment Variables

Create:

```txt
apps/client/.env
```

Example:

```env
VITE_API_BASE_URL=http://localhost:4000/api/v1
VITE_SOCKET_URL=http://localhost:4000
```

### Prisma Setup

```bash
cd apps/api
pnpm db:generate
pnpm exec prisma db push
```

### Start Backend

```bash
cd apps/api
pnpm dev
```

### Start Frontend

```bash
cd apps/client
pnpm dev
```

Frontend runs on:

```txt
http://localhost:5173
```

Backend health check:

```txt
http://localhost:4000/health
```

---

## Build Commands

### Backend

```bash
cd apps/api
pnpm build
```

### Frontend

```bash
cd apps/client
pnpm build
```

### Tests

```bash
cd apps/api
pnpm test
```

---

## Deployment

SupportIQ is deployed on Render.

### Backend

The backend Render service uses:

```txt
apps/api
```

Build command:

```bash
corepack enable && pnpm install --frozen-lockfile && pnpm --dir apps/api db:generate && pnpm --dir apps/api exec prisma db push && pnpm --dir apps/api build
```

Start command:

```bash
pnpm --dir apps/api start
```

### Frontend

The frontend Render static site uses:

```txt
apps/client/dist
```

Build command:

```bash
corepack enable && pnpm install --frozen-lockfile && pnpm --dir apps/client build
```

SPA rewrite:

```txt
Source: /*
Destination: /index.html
Action: Rewrite
```

---

## Demo Walkthrough

A recommended recruiter demo flow:

```txt
1. Open the live app
2. Click Try Demo Account
3. Show dashboard metrics and support activity
4. Open the tickets page
5. Open a billing or password reset ticket
6. Generate an AI draft
7. Show provider, confidence, grounding query, and source cards
8. Open the Knowledge Base page
9. Search for a support policy
10. Try creating a ticket to show read-only demo protection
```

This flow demonstrates the main product capabilities without modifying demo data.

---

## Project Highlights

SupportIQ demonstrates practical full-stack engineering skills:

- Production-style monorepo structure
- Multi-tenant SaaS architecture
- Secure authentication and refresh token flow
- Role-based access control
- Backend integration tests for access control
- Real-time updates with Socket.IO
- Background job processing with Redis and BullMQ
- AI integration with reviewable source grounding
- Knowledge-base document processing
- Public read-only demo protection
- CI pipeline with GitHub Actions
- Full deployment on Render

---

## Future Improvements

Potential improvements:

- Add customer portal view
- Add email notification integration
- Add ticket SLA tracking
- Add advanced dashboard analytics
- Add full semantic search with Gemini/OpenAI embeddings
- Add attachment support for ticket messages
- Add organization-level billing/subscription plans
- Add admin-configurable AI prompt settings
- Add audit log export

---

## Author

**Tejas Kadam**

- GitHub: https://github.com/Tejas-Kadam431
- Project: https://github.com/Tejas-Kadam431/SupportIQ
