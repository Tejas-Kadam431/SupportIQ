# A five-minute demonstration

Use synthetic seed data. The intentionally public read-only owner is demo.owner@supportiq.app / password123. Inspect completed state with this account. Interactive sending/uploading belongs only in disposable local fixtures or Playwright; never weaken demo guards.

| Time | Screen and story |
|---|---|
| 0:00–0:40 | Dashboard: usage, evaluation coverage, accepted/edited/rejected. Explain denominators and imperfect human labels. |
| 0:40–1:40 | Ticket: conversation, status, evidence and recorded Copilot Run. Explain the human send boundary. In a disposable staff session, edit/send a supported password-reset reply and observe EDITED. |
| 1:40–2:15 | AI Quality: distinguish abstention from provider failure, rejection from a proven source defect. |
| 2:15–3:00 | DEMO annual-refund Knowledge Issue: historical signals and affected knowledge version. |
| 3:00–3:40 | Knowledge history: publication and retained versions. Preparing a candidate never silently publishes it. |
| 3:40–4:40 | Reliability Lab: seeded candidate comparison and completed verification, six failures improved and ten guardrails preserved. Explicitly identify synthetic results. |
| 4:40–5:00 | VERIFIED means the captured cohort passed under this configuration, not guaranteed future answers. Close on traceable corrections. |

## Safe reset

Follow local-development.md to create/migrate supportiq_demo. Set NODE_ENV=development and SUPPORTIQ_DEMO_RESET=ERASE_LOCAL_DEMO only for `pnpm --dir apps/api db:seed`, then unset the reset variable. The guard checks environment and local database target before deletion. Never expose reset through HTTP or seed mutable public credentials into real customer data.

Playwright independently resets supportiq_e2e and uses a disposable staff account. Provider-free fallback keeps CI repeatable; live-provider outputs may differ.

## Current seeded screenshots

These screenshots were captured by the browser acceptance suite from disposable synthetic data, with no real customer content or credentials visible:

- [Ticket and evidence](screenshots/stage-j-ticket-evidence.png)
- [Version history](screenshots/stage-j-version-history.png)
- [Knowledge Issue and Reliability Lab](screenshots/stage-j-reliability-lab.png)
- [390-pixel ticket layout](screenshots/stage-j-ticket-mobile.png)

Older screenshots are historical assets; the Stage J images show the current validated workflows.
