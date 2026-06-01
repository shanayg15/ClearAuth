# ClearAuth — Claude Code Context (CLAUDE.md)

> This file is auto-loaded by Claude Code in every session. It is the shared contract
> for all four team members. **Do not change the shared types or file-ownership map
> without telling the team — other people's code depends on them.**

## What we're building

**ClearAuth** — an autonomous prior-authorization agent for clinicians.
A doctor uploads a clinical note → an agent pipeline reads it, determines the payer's
auth criteria, fills out the payer's web form, submits it via a browser agent, and tracks
approval status live. Built in one day for the "Agents That Act" hackathon.

This repo is adapted from our earlier **HealthFlow** monorepo. We reuse its Turborepo
structure, LangChain chain pattern, SSE realtime, Supabase store, and the `apps/doctor`
CRM UI. We strip HealthFlow's paramedic/nurse/dispatcher apps and voice capture.

## Prize targets (why each integration exists)

| Sponsor | Prize | Where it lives | Owner |
|---|---|---|---|
| Tigris | $1,500 | `apps/api/src/lib/tigris.ts` — stores notes + generated packets | Shanay |
| Rtrvr.ai | $1,000 | `apps/api/src/lib/rtrvr.ts` — submits the form to the payer portal | Sahiel |
| Opsera | $1,000 + track | `apps/api/src/lib/opsera.ts` — compliance audit | Pranav |
| Apify | credits | `apps/api/src/agents/chains/apify-coverage.ts` — scrape payer criteria | Sahiel |
| Render | credits | `render.yaml` — deploy (optional, localhost is fine) | Pranav |

**Every integration must fail soft.** If a key is missing or a call errors/times out,
fall back to a deterministic mock so the demo never breaks. This is the #1 rule.

## Architecture

```
apps/dashboard  (Next.js, :3003)  ── single CRM, adapted from HealthFlow apps/doctor
   │  upload clinical note, watch live status, see agent timeline + compliance panel
   ▼  (fetch + SSE)
apps/api        (Next.js, :3001)  ── the brain
   ├─ src/app/api/auth-requests/...     CRUD + list                    [Shanay]
   ├─ src/app/api/agents/process/...    runs the pipeline              [Shanay]
   ├─ src/app/api/agents/submit/...     triggers Rtrvr submission      [Sahiel]
   ├─ src/app/api/payer/webhook/...     payer status callback          [Sahiel]
   ├─ src/app/api/compliance/...        Opsera audit endpoint          [Pranav]
   ├─ src/app/api/stream/...            SSE realtime feed              [Shanay]
   ├─ src/agents/pipeline.ts            orchestrator                   [Shanay]
   └─ src/agents/chains/*               the agents (see ownership)
apps/payer-portal (Next.js, :3009) ── the MOCK insurer form Rtrvr submits to [Sahiel]
packages/types   ── ALL shared interfaces. Import from "@clearauth/types". [scaffold]
packages/supabase ── supabase client helpers                                [scaffold]
```

## The agent pipeline (the "agent that acts")

`runPipeline(authRequest)` in `apps/api/src/agents/pipeline.ts` runs these in sequence,
writing status + audit to the store after EACH step (which pushes a live SSE update):

1. **Extraction** `runExtractionChain(rawNote)` → `ExtractionResult`     [Shanay]
2. **Criteria** `runCriteriaChain(extraction)` → `CriteriaResult`        [Sahiel] (+Apify)
3. **Form-fill** `runFormFillChain(extraction, criteria)` → `FormFillResult` [Shanay]
4. **Compliance** `runComplianceChain(authRequest)` → `ComplianceResult` [Pranav] (+Opsera)
5. **Submission** `runSubmissionChain(formFill, patient)` → `SubmissionResult` [Sahiel] (+Rtrvr)

Status flow: `intake → extracting → checking_criteria → filling_form →
compliance_review → ready_to_submit → submitting → submitted → under_review →
approved | denied`.

## Shared types (the contract — defined in packages/types/index.ts)

Every agent function returns `AgentResult<T>`. Every chain has a deterministic
rule-based fallback when no LLM key is set (copy the HealthFlow pattern:
`createChatModel()` returns null → use fallback). Key interfaces:
`PatientContext, ExtractionResult, CriteriaResult, FormFillResult, ComplianceResult,
SubmissionResult, AuditEntry, AuthRequest, AgentResult<T>, AuthStatus`.
See `packages/types/index.ts` for the authoritative definitions.

## File ownership map (DO NOT edit files you don't own)

**Shanay (backend lead):** `apps/api/src/lib/{supabase,store,tigris}.ts`,
`apps/api/src/agents/pipeline.ts`, `apps/api/src/agents/chains/extraction-chain.ts`,
`apps/api/src/agents/chains/formfill-chain.ts`,
`apps/api/src/app/api/{auth-requests,agents/process,stream}/**`,
`apps/api/supabase/schema.sql`.

**Sahiel (backend):** `apps/api/src/lib/rtrvr.ts`,
`apps/api/src/agents/chains/{criteria-chain,apify-coverage,submission-chain}.ts`,
`apps/api/src/app/api/{agents/submit,payer/webhook}/**`, `apps/payer-portal/**`.

**Pranav (frontend + deploy + debug):** `apps/dashboard/**`,
`apps/api/src/lib/opsera.ts`, `apps/api/src/agents/chains/compliance-chain.ts`,
`apps/api/src/app/api/compliance/**`, `render.yaml`.

**Shared / scaffold-owned (coordinate before editing):** `packages/types/index.ts`,
`packages/supabase/**`, root config, `apps/api/src/lib/{audit,cors,chat-model-factory}.ts`.

## Conventions

- TypeScript strict. Import shared types from `@clearauth/types`.
- LLM access ONLY via `createChatModel()` in `lib/chat-model-factory.ts`
  (supports Anthropic + Gemini; returns null with no key → use rule-based fallback).
- Every external call (Tigris, Rtrvr, Opsera, Apify) wrapped in try/catch with a timeout
  and a deterministic fallback. Log `[tigris] ...`, `[rtrvr] ...` etc.
- Never block the pipeline on an integration. A failed submission → status `error`, never a crash.
- After every pipeline step, call `upsertAuthRequest(req)` so the SSE feed updates live.
- Run `npm run type-check` before committing. Keep PRs to your own files.
- Commit small and often; pull before you start to get the scaffold.

## Demo safety (the golden path)

ONE patient, ONE note, ONE payer, ONE successful approval. No login, no appeals flow,
no multi-payer. The payer portal is OUR mock app — we control when it flips to approved.
Record a Rtrvr "Trick" in the morning as a deterministic fallback for the live submission.

Finished
