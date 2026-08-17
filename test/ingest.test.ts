import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { pendingIndex, recent } from '../src/db/entries'
import { ingest, sweepUnindexed } from '../src/ingest'
import type { ModelProvider } from '../src/ports'
import { scripted } from '../src/providers/scripted'
import { memoryVectors } from '../src/vectors'

const entry = (id: string, body = 'ran five kilometres before work') => ({
  id,
  kind: 'entry' as const,
  body,
  local_date: '2026-08-13',
  captured_at: 1_755_000_000_000,
  created_at: 1_755_000_000_000,
})

function brokenEmbed(): ModelProvider {
  const base = scripted()
  return { ...base, embed: async () => Promise.reject(new Error('workers ai down')) }
}

describe('ingest', () => {
  it('stores and indexes a new entry', async () => {
    const vectors = memoryVectors()
    const result = await ingest(entry('a1'), { db: env.DB, vectors, model: scripted() })

    expect(result).toEqual({ status: 'stored', indexed: true })
    expect(vectors.size).toBe(1)
    expect(await pendingIndex(env.DB, 10)).toHaveLength(0)
  })

  it('is idempotent when the watch retries the same entry id', async () => {
    const deps = { db: env.DB, vectors: memoryVectors(), model: scripted() }

    await ingest(entry('a1'), deps)
    const retry = await ingest(entry('a1', 'a different transcription'), deps)

    expect(retry).toEqual({ status: 'duplicate' })
    const rows = await recent(env.DB, 10)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.body).toBe('ran five kilometres before work')
  })

  it('keeps the entry when indexing fails, and reports it honestly', async () => {
    const result = await ingest(entry('a1'), {
      db: env.DB,
      vectors: memoryVectors(),
      model: brokenEmbed(),
    })

    expect(result).toEqual({ status: 'stored', indexed: false })
    expect(await recent(env.DB, 10)).toHaveLength(1)
    expect(await pendingIndex(env.DB, 10)).toHaveLength(1)
  })

  it('repairs unindexed entries on the next sweep', async () => {
    const vectors = memoryVectors()
    await ingest(entry('a1'), { db: env.DB, vectors, model: brokenEmbed() })
    expect(vectors.size).toBe(0)

    const repaired = await sweepUnindexed({ db: env.DB, vectors, model: scripted() })

    expect(repaired).toBe(1)
    expect(vectors.size).toBe(1)
    expect(await pendingIndex(env.DB, 10)).toHaveLength(0)
  })
})
