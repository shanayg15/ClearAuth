<div align="center">

# ClearAuth

### Write the note. Review the packet. File it.

**Turn a clinical note into a filed, reviewed prior authorization in one pass.** An autonomous agent pipeline reads the note, checks the payer's coverage criteria, assembles the prior-authorization packet, audits it for compliance, and once a physician signs off, files it on the payer portal through a browser agent and tracks the decision live. The whole workflow runs end to end with zero API keys.

<br/>

![License](https://img.shields.io/badge/license-MIT-eab308?style=flat-square)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Turborepo](https://img.shields.io/badge/Turborepo-monorepo-ef4444?style=flat-square&logo=turborepo&logoColor=white)

![LangChain](https://img.shields.io/badge/LangChain-Claude%20or%20Gemini-1c3c3c?style=flat-square)
![Realtime](https://img.shields.io/badge/realtime-Server--Sent%20Events-6f42c1?style=flat-square)
![Human in the loop](https://img.shields.io/badge/human%20in%20the%20loop-approval%20gate-0ea5e9?style=flat-square)
![Zero keys](https://img.shields.io/badge/runs%20with-zero%20API%20keys-1f6feb?style=flat-square)

<br/>

[Quickstart](#quickstart) &nbsp;&middot;&nbsp; [The problem](#the-problem) &nbsp;&middot;&nbsp; [How it works](#how-it-works) &nbsp;&middot;&nbsp; [The pipeline](#the-pipeline) &nbsp;&middot;&nbsp; [Architecture](#architecture) &nbsp;&middot;&nbsp; [API](#api-reference)

</div>

---

> Prior authorization is the paperwork tax on American medicine. Every payer has a different form, a different portal, and a different set of coverage rules, and a physician burns hours each week getting insurers to approve care they have already decided is necessary. ClearAuth turns that loop into a single agent that acts on the doctor's behalf, then stops and hands control back so a human signs off before anything is filed. **The model proposes; the clinician approves; the agents do the work in between.**

## The problem

A physician spends roughly thirteen hours a week on prior authorization. The work is repetitive and rule-bound, but it is also high stakes, so it cannot be fully automated away. The bottleneck is not the decision, it is the busywork around it:

- **Every payer is different.** A separate form, a separate portal, and a separate coverage policy for the same procedure.
- **The criteria are buried.** Whether a request qualifies depends on policy language that is hard to find and easy to misread.
- **The packet is manual.** Codes, justification, and supporting documentation are assembled by hand, then keyed into a web form.
- **The status is opaque.** Once it is submitted, tracking the decision means logging back into the portal and checking.

ClearAuth keeps the physician in the one place they are needed, the sign-off, and automates everything on either side of it.

## What it does

- **Reads the note.** An extraction agent turns free-text clinical notes into a structured request: patient, diagnosis, ICD-10 code, requested treatment, CPT code, and clinical justification.
- **Checks coverage.** A criteria agent looks up the payer's coverage policy for the requested treatment and checks each requirement against the note, reporting which criteria are met.
- **Assembles the packet.** A form-fill agent builds the completed prior-authorization packet and stores it as a versioned object.
- **Audits for compliance.** A compliance agent reviews the packet for required fields, valid codes, and present justification, and returns a pass, warn, or fail verdict.
- **Stops for a human, then files.** The pipeline halts at `ready_to_submit`. Nothing reaches the payer until the physician reviews the packet and clicks approve. On approval, a submission agent drives a browser agent to file the packet on the payer portal and captures a confirmation ID.
- **Streams everything live.** Every transition is persisted and broadcast over Server-Sent Events, so the CRM dashboard animates the agent timeline as it runs and tracks the decision once the payer responds.
- **Runs with zero keys.** Every external call is wrapped in a timeout with a deterministic fallback, so the full pipeline runs end to end on mocks with no `.env` file. Drop in a real key and that integration activates with no code change.

## How it works

1. **Paste.** A doctor pastes a clinical note into the CRM, the way they would dictate it to a colleague.
2. **Watch.** ClearAuth runs the autonomous agents and animates each step live: extraction, criteria, packet, compliance.
3. **Approve.** The doctor reviews the completed packet, clicks approve, and watches the browser agent file it and the payer decision land.

## The pipeline

`runPipeline(authRequest)` runs four autonomous agents in sequence, persisting status and an audit entry after every step, which pushes a live update to every connected dashboard. It then stops at the human approval gate. The fifth agent runs only after the doctor approves.

```
note  ->  1. extract      (note -> patient, diagnosis, ICD-10, CPT, justification)
      ->  2. criteria     (look up payer policy, check each requirement)
      ->  3. form-fill     (assemble and store the PA packet)
      ->  4. compliance    (audit fields, codes, justification -> pass / warn / fail)
      ->  ready_to_submit  (HUMAN GATE: doctor reviews and approves in the CRM)
      ->  5. submit        (browser agent files it on the payer portal)
      ->  decision         (payer webhook flips it to approved or denied, live)
```

| Agent | What it does | Integration | Fallback |
| --- | --- | --- | --- |
| 1. Extraction | Clinical note to patient, diagnosis, ICD-10, CPT, justification | Claude or Gemini via LangChain | Rule-based regex parse |
| 2. Criteria | Look up the payer coverage policy and check each requirement | Apify | Built-in policy data |
| 3. Form-fill | Assemble and store the completed PA packet | Tigris | In-memory store |
| 4. Compliance | Audit the packet for fields, codes, and justification | Opsera (MCP) | Rule-based checks |
| Human gate | Doctor reviews the packet in the CRM and approves | none | none |
| 5. Submission | Drive a browser agent to file the packet on the payer portal | Rtrvr.ai | Direct portal POST |

**Status lifecycle.** Any failure flips the request to `error` and stops cleanly. `runPipeline` never throws.

```
intake -> extracting -> checking_criteria -> filling_form -> compliance_review
       -> ready_to_submit -> [human approval] -> submitting -> submitted
       -> under_review -> approved | denied
```

## Runs with zero configuration

```bash
npm install && npm run dev
```

That boots all three apps and runs the entire pipeline on deterministic mocks with no `.env` file. Every integration follows one rule, fail soft:

```ts
// Real call behind a key and a timeout, deterministic fallback otherwise. Never block the pipeline.
export async function storeObject(key: string, body: string) {
  if (tigrisConfigured()) {
    try { /* REAL: PUT the object to Tigris, return its URL */ }
    catch (err) { console.warn("[tigris] falling back:", err); }
  }
  return mockStore(key, body); // in-memory, the demo never breaks
}
```

Drop a real key into `.env` and that integration activates automatically with no code change. A bad or expired key never crashes anything, since the call is wrapped in a timeout and falls back to the mock. The same applies to the model: with no `ANTHROPIC_API_KEY` or `GEMINI_API_KEY`, every agent uses a rule-based fallback and still returns a complete result.

## Quickstart

Requires Node 20 or newer and npm.

```bash
git clone https://github.com/shanayg15/ClearAuth.git
cd ClearAuth
npm install
cp .env.example .env     # leave everything blank, every integration mocks
npm run dev              # boots all three apps via Turborepo
```

Open the dashboard at http://localhost:3003, click Sample Note, then Run Pipeline, and watch it walk to `ready_to_submit`. Review the packet, click Approve and Submit, and watch it reach `submitted` and then the payer decision.

| App | URL | Who uses it |
| --- | --- | --- |
| API | http://localhost:3001 | Internal: the agent pipeline and every route |
| Dashboard | http://localhost:3003 | The clinician CRM: paste a note, watch the pipeline, approve and submit |
| Payer portal | http://localhost:3009 | The mock insurer form the browser agent submits to |

| Command | What it does |
| --- | --- |
| `npm run dev` | Run every app (Turborepo) |
| `npm run dev:api` / `npm run dev:dashboard` | Run a single app |
| `npm run type-check` | `tsc --noEmit` across the monorepo |
| `npm run lint` | ESLint across the monorepo |
| `npm run build` | Production build of every app |
| `npm run test` | Jest suite for the API |

## Architecture

A Turborepo and npm-workspaces monorepo. Three Next.js apps: the autonomous agents run through the compliance check, then hand control back to a human before anything is submitted to the payer.

```
apps/
  api/            :3001  the agent pipeline and every route
    src/agents/         pipeline.ts and the five chains (extraction, criteria, form-fill, compliance, submission)
    src/app/api/        auth-requests, agents/process, agents/submit, stream, payer/webhook, compliance, opsera/report
    src/lib/            tigris, rtrvr, opsera, apify-*, store, audit, chat-model-factory
  dashboard/      :3003  the clinician CRM (live agent timeline, compliance panel, payer intelligence)
    src/components/     CRM cards and UI (AgentTimeline, StatusHero, StatusBadge)
  payer-portal/   :3009  the mock insurer portal the browser agent submits to
packages/
  types/                the shared TypeScript contract, imported as @clearauth/types
  supabase/             Supabase client helpers
render.yaml             Render blueprint, three web services
.env.example            every integration key, all optional
```

**Ideas worth a second look:**

- **One model seam.** All model access goes through a single `createChatModel()` factory that supports Anthropic and Gemini. With no key it returns `null` and every agent uses its rule-based fallback.
- **Live everything.** Each pipeline transition is persisted and broadcast over Server-Sent Events, so connected dashboards animate the agent timeline as it runs.
- **Tamper-evident audit.** Every step appends an `AuditEntry` carrying a SHA-256 checksum over its own contents, which `verifyAuditEntry()` re-derives and checks after the fact.
- **A human always signs off.** The autonomous agents stop at `ready_to_submit`. Nothing is filed with the payer until a physician explicitly approves.

## Integrations

Every integration is fail-soft: with no credentials, or on any error or timeout, it falls back to a deterministic mock so the full pipeline always completes.

| Integration | What it does | Fallback when no key |
| --- | --- | --- |
| Claude or Gemini (LangChain) | Extraction and reasoning across the agents, via one `createChatModel()` factory | Rule-based parsing in every chain |
| Apify | Scrapes payer coverage criteria, regulatory turnaround rules, code validation, and payer intelligence | Built-in policy and SLA data |
| Tigris | S3-compatible object storage for raw notes and generated PA packets, with presigned reads | In-memory object store |
| Opsera (MCP) | Compliance, security, and SQL audits that drive the live compliance panel, plus on-demand report artifacts | Rule-based compliance checks |
| Rtrvr.ai | Browser agent that reads, fills, and submits the real payer portal form | Direct POST to the portal intake route |
| Supabase | Optional persistence for requests and audit trails | In-memory store |
| Render | Blueprint that deploys all three apps from one monorepo | Localhost is the supported path |

## API reference

Auth is a demo no-op: every request resolves to a single demo doctor, so a token is optional (`Authorization: Bearer demo_doctor`).

### `POST /api/auth-requests`

Create a request from a clinical note.

```bash
curl -X POST http://localhost:3001/api/auth-requests \
  -H "Content-Type: application/json" \
  -d '{ "rawNote": "Jane Doe, 54F, Aetna, chronic lower back pain, failed 8 weeks PT, requesting MRI lumbar spine without contrast" }'
```

Returns a new `AuthRequest` with `status: "intake"` and an `id`.

### `POST /api/agents/process`

Run the autonomous pipeline (agents 1 through 4). The pipeline stops at the human approval gate.

```bash
curl -X POST http://localhost:3001/api/agents/process \
  -H "Content-Type: application/json" \
  -d '{ "id": "<authRequestId>" }'
```

```jsonc
{
  "request": {
    "id": "...",
    "status": "ready_to_submit",
    "extraction": { "diagnosis": "Chronic lower back pain", "icd10": "M54.5", "cptCode": "72148", "payer": "Aetna" },
    "criteria":   { "allMet": true, "requiredCriteria": [ { "label": "Conservative therapy documented", "met": true } ] },
    "formFill":   { "packetKey": "packets/<id>.md", "formFields": { } },
    "compliance": { "overall": "pass", "checks": [ ], "source": "fallback" },
    "auditTrail": [ { "agentRole": "extraction-agent", "action": "extract_clinical_data", "checksum": "..." } ]
  }
}
```

### `POST /api/agents/submit`

File the packet (agent 5), after the doctor approves. Drives the browser agent and returns the request at `status: "submitted"` with a `submission.confirmationId`.

```bash
curl -X POST http://localhost:3001/api/agents/submit \
  -H "Content-Type: application/json" \
  -d '{ "id": "<authRequestId>" }'
```

### Other routes

| Route | Purpose |
| --- | --- |
| `GET /api/auth-requests` and `GET /api/auth-requests/:id` | List all requests or fetch one |
| `GET /api/stream` | Server-Sent Events feed: a snapshot on connect, then an upsert on every change |
| `POST /api/payer/webhook` | Payer status callback (`under_review` to `approved` or `denied`) |
| `GET /api/compliance` | Opsera-backed compliance audit |
| `GET /api/opsera/report` | On-demand Opsera report artifact |

## Trust layer

ClearAuth handles a high-stakes clinical workflow, so its design leans on guarantees rather than luck.

- **A human always signs off.** The autonomous agents stop at `ready_to_submit`. Nothing is filed with the payer until a physician explicitly approves.
- **The demo never breaks.** Every integration fails soft to a deterministic mock, so with zero keys the full pipeline still runs end to end. A failed step flips status to `error` and stops; `runPipeline` never throws.
- **Every action is auditable.** Each step appends an `AuditEntry` with a SHA-256 checksum over its contents, so the compliance trail is tamper-evident and verifiable after the fact.
- **Strict types, enforced.** TypeScript strict across the monorepo. `npm run type-check`, `npm run lint`, and `npm run build` are the quality gates.

## Tech stack

Next.js 15 (App Router) and React 19, TypeScript 5 strict across the monorepo, Turborepo with npm workspaces, LangChain with Claude or Gemini behind a single `createChatModel()` factory, Server-Sent Events for the live agent timeline, Apify for coverage and regulatory scraping, Tigris for object storage, Opsera over MCP for compliance audits, Rtrvr.ai for browser submission, Supabase as an optional store, per-entry SHA-256 audit checksums, and a Render blueprint for deployment.

## Deployment

A [`render.yaml`](render.yaml) blueprint deploys all three apps as Render web services from the one monorepo. Each builds from the repo root so the `@clearauth/*` workspace packages link, and binds to Render's injected `$PORT`. Every integration key is declared `sync: false`, so the apps deploy and run on mocks out of the box. After the first deploy, fill in the cross-service URLs: the API URL into each frontend's `NEXT_PUBLIC_API_URL`, and the payer-portal URL into the API's `RTRVR_PORTAL_URL`.

## Team

Built in one pass for the Agents That Act hackathon by Shanay Gaitonde, Sahiel Bose, and Pranav Achar. Multi-agent systems, TypeScript, and LangChain.

## License

[MIT](./LICENSE), Copyright (c) 2026 Shanay Gaitonde, Sahiel Bose, Pranav Achar.
