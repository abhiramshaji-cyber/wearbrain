import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { ask, OFF_TOPIC_ANSWER, UNSURE_ANSWER } from '../src/agent'
import { ingest } from '../src/ingest'
import type { ModelProvider } from '../src/ports'
import { scripted } from '../src/providers/scripted'
import { defaultRegistry } from '../src/tools'
import { memoryVectors } from '../src/vectors'

const REQUEST = {
  question: 'what did I say about running?',
  now: 1_755_100_000_000,
  nowLocalISO: '2026-08-14T09:00:00+04:00',
  localDate: '2026-08-14',
}

function route(call: unknown, flags: { aboutJournal?: boolean; confident?: boolean } = {}) {
  return { aboutJournal: flags.aboutJournal ?? true, confident: flags.confident ?? true, call }
}

async function seed(vectors: ReturnType<typeof memoryVectors>) {
  const deps = { db: env.DB, vectors, model: scripted() }
  await ingest(
    { id: 'e1', kind: 'entry', body: 'ran five kilometres before work', local_date: '2026-08-12', captured_at: 1, created_at: 1 },
    deps,
  )
  await ingest(
    { id: 'e2', kind: 'entry', body: 'dentist appointment was rescheduled', local_date: '2026-08-13', captured_at: 2, created_at: 2 },
    deps,
  )
}

function deps(primary: ModelProvider, vectors = memoryVectors(), escalation?: ModelProvider) {
  return { registry: defaultRegistry(), primary, escalation, db: env.DB, vectors }
}

describe('ask', () => {
  it('refuses questions the journal cannot answer without running a tool', async () => {
    const model = scripted({ extract: () => route(null, { aboutJournal: false }) })
    const res = await ask({ ...REQUEST, question: 'what is the capital of Peru?' }, deps(model))

    expect(res.answer).toBe(OFF_TOPIC_ANSWER)
    expect(res.tool).toBeNull()
    expect(model.calls.write).toHaveLength(0)
  })

  it('retrieves by meaning and answers from the entry it found', async () => {
    const vectors = memoryVectors()
    await seed(vectors)

    const model = scripted({
      extract: () => route({ tool: 'searchEntries', args: { query: 'running', count: 1 } }),
      write: (req) => (req.prompt.includes('five kilometres') ? 'You ran 5k before work.' : 'nothing'),
    })

    const res = await ask(REQUEST, deps(model, vectors))

    expect(res.tool).toBe('searchEntries')
    expect(res.answer).toBe('You ran 5k before work.')
  })

  it('honours the count the model read from the question', async () => {
    const vectors = memoryVectors()
    await seed(vectors)

    const model = scripted({ extract: () => route({ tool: 'listRecent', args: { count: 1 } }) })
    await ask({ ...REQUEST, question: 'what was the last thing I said?' }, deps(model, vectors))

    const excerpts = model.calls.write[0]?.prompt ?? ''
    expect(excerpts).toContain('dentist')
    expect(excerpts).not.toContain('five kilometres')
  })

  it('escalates when the small model is not confident', async () => {
    const primary = scripted({ label: 'small', extract: () => route(null, { confident: false }) })
    const escalation = scripted({
      label: 'big',
      extract: () => route({ tool: 'listRecent', args: { count: 3 } }),
      write: () => 'Here is your week.',
    })

    const res = await ask(REQUEST, deps(primary, memoryVectors(), escalation))

    expect(res.escalated).toBe(true)
    expect(res.routedBy).toBe('big')
    expect(res.tool).toBe('listRecent')
  })

  it('escalates when the small model returns an unusable object', async () => {
    const primary = scripted({ extract: () => ({ garbage: true }) })
    const escalation = scripted({
      extract: () => route({ tool: 'listRecent', args: { count: 3 } }),
      write: () => 'Here is your week.',
    })

    const res = await ask(REQUEST, deps(primary, memoryVectors(), escalation))

    expect(res.escalated).toBe(true)
    expect(res.tool).toBe('listRecent')
  })

  it('degrades instead of throwing when no escalation provider is configured', async () => {
    const primary = scripted({ extract: () => ({ garbage: true }) })
    const res = await ask(REQUEST, deps(primary))

    expect(res.answer).toBe(UNSURE_ANSWER)
    expect(res.tool).toBeNull()
  })

  it('rejects a tool name the model invented', async () => {
    const model = scripted({ extract: () => route({ tool: 'deleteEverything', args: {} }) })
    const res = await ask(REQUEST, deps(model))

    expect(res.answer).toBe(UNSURE_ANSWER)
    expect(res.tool).toBeNull()
  })

  it('refuses a reminder in the past rather than silently creating one', async () => {
    const model = scripted({
      extract: () =>
        route({
          tool: 'createReminder',
          args: { body: 'call the dentist', dueAt: '2020-01-01T09:00:00Z' },
        }),
    })

    await ask({ ...REQUEST, question: 'remind me to call the dentist' }, deps(model))

    expect(model.calls.write[0]?.prompt).toContain('already passed')
    const rows = await env.DB.prepare('SELECT * FROM reminders').all()
    expect(rows.results).toHaveLength(0)
  })
})
