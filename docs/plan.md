# wearbrain design

Date: 2026-08-10
Status: agreed. The Worker half is built — see [worker.md](worker.md) for what shipped and what it decided along the way. The watch app is not started.

## Goal

A single user AI brain fed by voice from a WearOS watch. It captures journal entries, stores them with embeddings, answers questions about your own history, and can take a small number of actions through tools. It should be cheap enough to run forever and reliable enough that you actually keep using it.

## Decisions

### Watch surface: native WearOS app in Kotlin

Rejected alternatives: a PWA in the watch browser (WearOS browser support is genuinely poor), voice notes into an existing app with server side ingestion (capture works, but querying the brain from the wrist does not), and phone first with the watch deferred.

Native gives voice capture, a tile, and a complication, which is the whole point of wrist access.

### Agent framework: Vercel AI SDK

TypeScript, free, open source, provider agnostic. Strong `generateObject` support, which matters more than usual here (see the small model section).

Rejected: Google ADK, whose multi agent primitives are good but whose deployment story assumes Vertex AI Agent Engine, and which is Python or Java. Rejected: Claude Agent SDK, which has the best built in agentic loop and native MCP tools but only speaks Claude.

### Hosting: Cloudflare

* Agent API on Workers. Free tier of 100k requests a day, scales to zero, no meaningful cold start.
* Entries in D1.
* Embeddings in Vectorize.
* Daily reflection on a Cron Trigger. Cloudflare allows real schedules; Vercel Hobby caps cron at once a day.
* Inference on Workers AI, colocated with the agent code. Groq free tier as a fallback for faster tokens.

Alternative kept on the shelf: Google Cloud Run always free plus Cloud Scheduler, if the agent ever needs to be a container.

### Inference: small language models

Cost is not the constraint. Tool calling reliability is. Models below roughly 8B parameters degrade sharply on multi step tool use: they invent tool names, drop required arguments, and loop.

The design compensates in four ways:

1. **Three or four tools maximum.** Selection accuracy at this model size falls measurably with every tool added.
2. **Structured output over freeform tool calls.** Use `generateObject` against a strict schema wherever possible. Far more reliable than open ended function calling on a small model.
3. **Router plus deterministic workers.** The model classifies intent and extracts arguments. Plain TypeScript executes. You get agent behavior without trusting a 3B model to plan a sequence.
4. **Escalation path.** When router confidence is low, that single call goes to Gemini 2.5 Flash-Lite. A handful of paid calls a day costs almost nothing and prevents the brain from feeling stupid.

   Flash-Lite rather than Flash: as of August 2026 Flash is $1.50/$7.50 per million tokens, which is no longer the rounding error this design assumed. Flash-Lite is $0.10/$0.40 and the escalated call is a short classification over a one-line question, so the cheaper tier loses nothing. Both retain a free tier in AI Studio, so escalation costs nothing until it outgrows the rate limit.

   Confidence is a boolean the router emits about its own routing, not a float compared against a tuned threshold. A threshold would be a magic number needing maintenance; asking the model whether the mapping clearly follows from the question is the same judgment without the knob.

## Architecture

```
WearOS app (Kotlin)
  voice capture  ->  Room queue  ->  WorkManager sync
                                          |
                                     HTTPS + bearer token
                                          |
                              Cloudflare Worker (Vercel AI SDK)
                                /        |         \
                          D1 entries  Vectorize  router model
                                                     |
                                          low confidence escalation
                                                     |
                                              Gemini Flash

Cron Trigger  ->  daily reflection job  ->  D1
```

### Components

**Watch app.** Captures speech, queues locally, syncs opportunistically, renders short answers. Owns no intelligence.

**Ingest endpoint.** Accepts an entry, writes it to D1, computes an embedding, upserts to Vectorize. Idempotent on a client supplied entry id so a retried sync cannot duplicate.

**Agent endpoint.** Accepts a question. Router extracts intent and arguments as a structured object, deterministic code dispatches to a tool, tool result is rendered into a short answer.

**Reflection job.** Cron triggered. Pulls the day's entries, produces a summary and any noticed patterns, writes it back to D1 as a special entry type.

### Tools for v1

Hard cap at four:

1. `searchEntries` semantic search over Vectorize
2. `listRecent` last N entries from D1
3. `createReminder` a scheduled nudge
4. `getReflection` fetch a past daily reflection

## The hard part

The watch client, not the AI. In effort order:

1. **Offline queue.** WearOS loses connectivity constantly. A Room table plus WorkManager sync is mandatory, not an optimization. Without it you lose entries, and losing entries kills trust in a journal permanently.
2. **Speech to text.** Use `RecognizerIntent` for on device transcription where the watch supports it. Fall back to recording audio and transcribing server side.
3. **Auth.** Single user, so skip OAuth. Generate a device token, store it in `EncryptedSharedPreferences`, verify it as a bearer header. Do not build Google Sign In for an audience of one.
4. **Recall UI.** A paragraph of model output is unreadable on a watch. Design for one sentence answers plus an open on phone affordance.

## v1 scope

* Watch app: voice capture with an offline queue, and a single answer view.
* Worker: ingest endpoint, agent endpoint, four tools.
* One daily reflection cron.
* Small model inference with the Gemini Flash escalation path wired from day one.

Explicitly out of scope for v1: multi user support, calendar integration, a phone companion UI, any web dashboard, and sharing.

## Open questions

* Which specific Workers AI model for the router. `@cf/meta/llama-3.1-8b-instruct` is the placeholder default, chosen to sit at the 8B line above. Still needs a bake off against real intent examples; `ROUTER_MODEL` overrides it without a code change.
* Whether the daily reflection should be delivered as a watch notification or pulled on demand. Until this is settled, due reminders accumulate in D1 and the watch polls `GET /reminders/due`. Nothing pushes yet.
* Retention policy. Entries are indefinite for now, which is fine at personal scale.

## Next step

The Worker is built and tested against local D1. Next is the watch app, which now has a real API to talk to. Before deploying the Worker, the three provisioning steps in the README have to run against a real Cloudflare account.
