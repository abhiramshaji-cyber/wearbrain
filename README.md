# wearbrain

A personal AI brain and journal. You dictate entries from a WearOS watch, they land in a hosted agent that stores, embeds, and reasons over them, and you can ask it questions about your own history.

Runs on small language models, so inference stays effectively free.

## Status

The Worker is built and tested — ingest, agent, four tools, and the daily reflection cron. The watch app is not started.

Nothing has run against real Cloudflare services yet: there is no account wired up, so Workers AI and Vectorize are exercised through test doubles. Everything else, including the SQL, runs for real against local D1.

See [docs/plan.md](docs/plan.md) for the design and [docs/worker.md](docs/worker.md) for what the Worker does and how to extend it.

## Stack

| Layer | Choice |
| --- | --- |
| Watch client | Kotlin, WearOS, Room plus WorkManager offline queue |
| Agent | Vercel AI SDK (TypeScript) |
| Host | Cloudflare Workers |
| Storage | Cloudflare D1 |
| Vector search | Cloudflare Vectorize |
| Inference | Workers AI, with Groq as an escape hatch |
| Escalation | Gemini 2.5 Flash-Lite for low confidence queries |
| Scheduling | Cloudflare Cron Triggers |

## Why this stack

**Vercel AI SDK** over Google ADK or the Claude Agent SDK. It is provider agnostic, so pointing it at a small model today and a larger one later is a one line change. Google ADK's value is tied to Vertex AI Agent Engine, which is not free, and the Claude Agent SDK only speaks Claude, which rules it out the moment small models are the plan. The AI SDK also has the deepest documentation and the best local tooling support.

**Cloudflare** over Vercel or Supabase for hosting. Inference, storage, vector search, and cron all sit in one runtime on one free account with no cross network hop. Vercel Hobby caps cron at once per day, which does not fit the daily reflection job.

**Small models** keep cost near zero, but the tradeoff is tool calling reliability, not quality of prose. The design compensates for this deliberately. See the plan.

## Repo layout

```
docs/plan.md     the design
docs/worker.md   what the Worker does, and how to add a tool
src/             the Worker
migrations/      D1 schema
test/            runs in workerd against local D1
```

## Running it

```sh
bun install
bun test          # no account or API key needed
bun run typecheck
```

Tests run inside workerd against a real local D1. Workers AI and Vectorize have no local emulator, so they are covered by test doubles — see the testing section of [docs/worker.md](docs/worker.md) for what that leaves unproven.

## Deploying

Three provisioning steps, none of them done yet. All need a Cloudflare account.

```sh
wrangler d1 create wearbrain                      # paste database_id into wrangler.jsonc
wrangler vectorize create wearbrain-entries --dimensions 768 --metric cosine
bun run db:migrate

wrangler secret put DEVICE_TOKEN                  # any long random string; the watch sends it
wrangler secret put GOOGLE_API_KEY                # optional, enables escalation
wrangler deploy
```

`DEVICE_TOKEN` is the whole auth model — a single user, a single device, a bearer token. Without it set, every route except `/health` returns 401, which is the intended failure mode rather than an open worker.

`GOOGLE_API_KEY` is optional. Without it, a low-confidence route degrades to asking the user to rephrase instead of escalating.

## API

| Route | Purpose |
| --- | --- |
| `POST /entries` | `{ id, body, localDate, capturedAt }` — idempotent on `id`, so a retried sync cannot duplicate |
| `POST /ask` | `{ question, localDate, nowLocalISO }` — returns a one-sentence answer |
| `GET /reminders/due` | reminders past due and not yet fired |
| `GET /health` | unauthenticated |

The watch supplies `localDate` and `nowLocalISO` because the server never guesses a timezone — see the durability section of [docs/worker.md](docs/worker.md).

## Contributing

Issues and pull requests are welcome. The Worker is testable locally with no Cloudflare account, and the watch app is not started yet, so that is the most open area. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

MIT. See [LICENSE](LICENSE).
