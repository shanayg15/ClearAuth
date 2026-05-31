# ClearAuth

**Autonomous prior-authorization agent for clinicians.**

A doctor pastes a clinical note. An agent pipeline reads it, looks up the payer's
coverage criteria, fills out the payer's PA form, submits it through a browser agent,
and tracks the approval live — no human keystrokes in between.

Built in one day for the **Applied Intelligence / "Agents That Act"** hackathon by
Shanay, Sahiel, and Pranav.

---

## Why

Prior authorization is the paperwork tax on American medicine: a physician spends ~13
hours a week getting insurers to approve care they've already decided is necessary.
Every payer has a different form, a different portal, and a different set of medical-policy
criteria. ClearAuth turns that whole loop into a single agent that acts on the doctor's behalf.

## The golden path

```
Clinical note  ──▶  Extraction  ──▶  Criteria  ──▶  Form-fill  ──▶  Compliance  ──▶  Submission  ──▶  Approved
   (free text)      ICD-10 / CPT     payer policy    PA packet      audit trail      payer portal     live status
```

One patient, one note, one payer, one approval — streamed to the dashboard in real time
as each agent finishes its step.

## Architecture

```
apps/dashboard   (Next.js · :3003)   CRM — paste a note, watch the agent timeline + compliance panel live
   │  fetch + Server-Sent Events
   ▼
apps/api         (Next.js · :3001)   the brain — runs the agent pipeline, persists state, streams updates
   ├─ /api/auth-requests        CRUD + list
   ├─ /api/agents/process       run the full pipeline
   ├─ /api/agents/submit        trigger the Rtrvr submission
   ├─ /api/payer/webhook        payer status callback
   ├─ /api/compliance           Opsera audit
   └─ /api/stream               SSE realtime feed
apps/payer-portal (Next.js · :3009)  the mock insurer form the browser agent submits to
packages/types                       shared TypeScript contract — import from "@clearauth/types"
```

## The agent pipeline

`runPipeline(authRequest)` runs five agents in sequence, writing status + an audit entry
to the store after **every** step (each write pushes a live SSE update to the dashboard):

| # | Agent | Does | Integration |
|---|-------|------|-------------|
| 1 | **Extraction** | clinical note → patient, diagnosis, ICD-10, CPT | LLM (or rule-based fallback) |
| 2 | **Criteria** | look up the payer's coverage policy, check each requirement | Apify |
| 3 | **Form-fill** | generate the filled PA packet, store it | Tigris |
| 4 | **Compliance** | audit the packet against compliance checks | Opsera |
| 5 | **Submission** | submit the packet to the payer portal | Rtrvr.ai |

Status flow: `intake → extracting → checking_criteria → filling_form → compliance_review
→ ready_to_submit → submitting → submitted → under_review → approved | denied`.

**Every integration fails soft.** With no API keys set, each external call falls back to a
deterministic mock and the full pipeline still runs end-to-end. The demo never breaks.

## Quickstart

```bash
git clone https://github.com/shanayg15/Hack-AppliedIntel.git
cd Hack-AppliedIntel
npm install
cp .env.example .env        # leave everything blank → all integrations mock
npm run dev                 # api :3001 + dashboard :3003
```

Open **http://localhost:3003**, click **Create with Sample Note**, then **Run Agent
Pipeline** and watch it walk to `submitted`.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | run every app (turbo) |
| `npm run dev:api` | API only, :3001 |
| `npm run dev:dashboard` | dashboard only, :3003 |
| `npm run type-check` | `tsc --noEmit` across the monorepo |
| `npm run lint` | eslint across the monorepo |
| `npm run build` | production build of every app |

## Sponsor integrations

Each lives behind a try/catch with a timeout and a deterministic fallback, so a missing
key or a flaky call never blocks the pipeline.

| Sponsor | Where | What it powers |
|---|---|---|
| **Tigris** | `apps/api/src/lib/tigris.ts` | object storage for notes + generated PA packets |
| **Rtrvr.ai** | `apps/api/src/lib/rtrvr.ts` | browser agent that submits the form to the payer portal |
| **Opsera** | `apps/api/src/lib/opsera.ts` | compliance audit via MCP |
| **Apify** | `apps/api/src/agents/chains/apify-coverage.ts` | scrapes payer coverage criteria |
| **Render** | `render.yaml` | deploy |

## Tech stack

Turborepo · npm workspaces · Next.js 15 (App Router) · React 19 · TypeScript (strict) ·
LangChain · Tailwind · Supabase (optional; in-memory store by default) · Server-Sent Events.

LLM access goes only through `createChatModel()` (Anthropic + Gemini); with no key it
returns `null` and every chain uses its rule-based fallback.

## Team

| Who | Owns |
|---|---|
| **Shanay** | backend lead — pipeline, store, Tigris, extraction + form-fill, auth-requests / process / stream APIs, schema |
| **Sahiel** | criteria + submission chains, Apify, Rtrvr, submit / payer-webhook APIs, the payer-portal app |
| **Pranav** | dashboard, Opsera + compliance chain, compliance API, deploy |

See [`CLAUDE.md`](CLAUDE.md) for the full file-ownership map and contributor conventions.
