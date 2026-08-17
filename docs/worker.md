# The Worker

What is built, and the rules it holds itself to. The design it implements is [plan.md](plan.md).

## Shape

```
src/
  index.ts          routes, auth gate, cron handler
  agent.ts          route -> escalate -> dispatch -> render
  ingest.ts         store, embed, index, and repair
  reflect.ts        the daily reflection job
  auth.ts           bearer token check
  ports.ts          ModelProvider and VectorIndex interfaces
  vectors.ts        Vectorize adapter, plus an in-memory one for tests
  providers/
    workersai.ts    the small model and the embedder
    google.ts       the escalation model
    scripted.ts     a test double, so everything above is testable with no API key
  db/               D1 queries, one module per table
  tools/            one file per tool, plus the registry
```

## Adding a tool

One file, one line. Nothing in the router changes.

```ts
// src/tools/findPeople.ts
export const findPeople = defineTool({
  name: 'findPeople',
  description: 'Find who the user has mentioned recently, and what they said about them.',
  input: z.object({
    name: z.string().describe("The person to look for, as the user refers to them."),
    count: countField,
  }),
  async execute({ name, count }, ctx) {
    const rows = await mentionsOf(ctx.db, name, clampCount(count))
    return { data: rows, facts: rows.map(r => `[${r.local_date}] ${r.body}`).join('\n') }
  },
})
```

Then add it to `defaultRegistry()`. The router's output schema is *derived* from the registry — `routeSchema()` builds a discriminated union over the registered tools, so the new tool's name and argument schema become routable the moment it is registered. There is no second list to keep in sync, and no prompt to edit: the `description` and each field's `.describe()` are what the model reads.

The `execute` signature is the only contract. `ctx` carries `db`, `vectors`, `model` and `now`, so a tool can run its own semantic search or its own extraction without reaching for a global.

### The cap is enforced, not suggested

`Registry` throws above four tools. This is `plan.md`'s "hard cap at four", made real — selection accuracy at this model size falls measurably with every tool added, and a cap that lives only in a document gets ignored. Going past four should be a deliberate act: raise `MAX_TOOLS`, and re-run the router bake-off to see what it cost.

## Rules the code holds to

**No hand-written decision logic.** Every judgment that depends on what the input *means* is made by the model, through one `extract` call against a schema. There are no keyword lists, no synonym maps, no regex intent matching, and no hand-tuned score weights anywhere in `src/`. When a small model needs guidance, it goes in a schema `.describe()` where the model can read it, never in a lookup table the model cannot see.

What stays deterministic is what is mechanically true: idempotency keys, timestamp arithmetic, SQL, the `[1,10]` clamp on a model-chosen count, and rendering rows to text.

**Retrieval decides relevance; nothing re-ranks it.** `searchEntries` returns Vectorize's order as-is. There is no similarity threshold to declare "no results" either — a threshold is a magic number that needs tuning, so instead the router decides up front whether the question is even about the journal (`aboutJournal`), and the answer renderer is told to say so plainly when the excerpts do not answer the question. Nearest-neighbour search always returns *something*; that is handled by judgment, not by a cutoff.

**Model-chosen counts, not fixed slices.** "the last one" is 1, "a few" is 3. The count is a schema field the model fills from the phrasing, clamped to `[1,10]` only so a hallucinated 5000 cannot blow the context.

## Durability

The journal's value collapses the first time it loses an entry, so ingest is built around that rather than around throughput.

**Retries cannot duplicate.** The watch supplies the entry id, and the insert is `ON CONFLICT DO NOTHING`. A retried sync after a dropped response is a no-op that reports `duplicate`.

**A failed embedding cannot silently lose an entry.** Storing to D1 and indexing to Vectorize are two writes, and the second can fail on its own. Rather than fail the request — which would make the watch retry a row that is already safe — the entry is stored with `indexed_at` left null, and the response says `indexed: false` honestly. The cron sweep re-indexes anything still null, so an entry that missed its embedding becomes searchable later instead of being invisible forever.

**Reflections have a stable id.** `reflection:YYYY-MM-DD`, so re-running the job updates the same row and the same vector instead of orphaning one.

**Days are the watch's, not UTC's.** Cron runs on UTC, but "what did I do today" means the user's local day. The watch sends `local_date` with every entry and that is the only source of truth for which day an entry belongs to; the server never infers a timezone. The reflection job reflects on any day that has entries, has no reflection, and is strictly older than the newest day seen — so it never reflects on a day still in progress, and it backfills days a missed cron run skipped.

## Providers

`ModelProvider` and `VectorIndex` in `ports.ts` are narrow on purpose. Two reasons, both concrete rather than speculative: Vectorize has no local emulator, and there is no AI API key yet — so without the seam, nothing here could be run or tested at all.

- `workersAI()` — the small model and the embedder. `ROUTER_MODEL` and `EMBED_MODEL` override the defaults, so the open bake-off in `plan.md` is a config change.
- `google()` — escalation. Absent unless `GOOGLE_API_KEY` is set; when absent, a low-confidence route degrades to "I'm not sure what you're asking about" rather than failing.
- `scripted()` — the test double. Returns scripted route objects and deterministic embeddings, which is what lets the whole agent path be tested today.

`extract` is the pure-semantic primitive: text in, schema-shaped object out. `write` is for prose. Escalation fires on low confidence *and* on the primary throwing — small models fail structured output often enough that the second case is not theoretical.

## Testing

`bun test` runs inside workerd against a real local D1, so the SQL is genuinely exercised rather than mocked. 27 tests cover retry idempotency, index-failure recovery, the sweep, escalation on both paths, invented tool names, past-dated reminders, reflection backfill and idempotency, the tool cap, and the auth gate.

Vectorize and Workers AI have no local emulator, so those two adapters are the seam the tests stop at — `memoryVectors()` and `scripted()` stand in. **Neither adapter has run against the real service.** Routing quality in particular is unproven: the tests prove the agent does the right thing with a given route, not that an 8B model produces good routes. That is what the bake-off is for, and it needs an account.
