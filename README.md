# wearbrain

A personal AI brain and journal. You dictate entries from a WearOS watch, they land in a hosted agent that stores, embeds, and reasons over them, and you can ask it questions about your own history.

Runs on small language models, so inference stays effectively free.

## Status

Planning. Nothing is built yet. See [docs/plan.md](docs/plan.md) for the agreed design.

## Stack

| Layer | Choice |
| --- | --- |
| Watch client | Kotlin, WearOS, Room plus WorkManager offline queue |
| Agent | Vercel AI SDK (TypeScript) |
| Host | Cloudflare Workers |
| Storage | Cloudflare D1 |
| Vector search | Cloudflare Vectorize |
| Inference | Workers AI, with Groq as an escape hatch |
| Escalation | Gemini Flash for low confidence queries |
| Scheduling | Cloudflare Cron Triggers |

## Why this stack

**Vercel AI SDK** over Google ADK or the Claude Agent SDK. It is provider agnostic, so pointing it at a small model today and a larger one later is a one line change. Google ADK's value is tied to Vertex AI Agent Engine, which is not free, and the Claude Agent SDK only speaks Claude, which rules it out the moment small models are the plan. The AI SDK also has the deepest documentation and the best local tooling support.

**Cloudflare** over Vercel or Supabase for hosting. Inference, storage, vector search, and cron all sit in one runtime on one free account with no cross network hop. Vercel Hobby caps cron at once per day, which does not fit the daily reflection job.

**Small models** keep cost near zero, but the tradeoff is tool calling reliability, not quality of prose. The design compensates for this deliberately. See the plan.

## Repo layout

```
docs/plan.md     the design
```

Application code lands here once the plan is turned into an implementation plan.
