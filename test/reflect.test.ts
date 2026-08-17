import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { reflectionFor } from '../src/db/entries'
import { ingest } from '../src/ingest'
import { scripted } from '../src/providers/scripted'
import { runReflections } from '../src/reflect'
import { memoryVectors } from '../src/vectors'

const NOW = 1_755_200_000_000

function deps(write?: () => string) {
  return {
    db: env.DB,
    vectors: memoryVectors(),
    model: scripted(write ? { write } : {}),
  }
}

async function add(id: string, date: string, body: string) {
  await ingest(
    { id, kind: 'entry', body, local_date: date, captured_at: Number(id.slice(1)), created_at: 1 },
    deps(),
  )
}

describe('runReflections', () => {
  it('reflects on completed days only, leaving the day still in progress alone', async () => {
    await add('e1', '2026-08-12', 'ran five kilometres')
    await add('e2', '2026-08-13', 'dentist rescheduled')

    const written = await runReflections(deps(() => 'A steady day.'), NOW)

    expect(written).toEqual(['2026-08-12'])
    expect(await reflectionFor(env.DB, '2026-08-13')).toBeNull()
  })

  it('backfills every missed day, not just yesterday', async () => {
    await add('e1', '2026-08-10', 'started the new job')
    await add('e2', '2026-08-11', 'slept badly')
    await add('e3', '2026-08-12', 'ran five kilometres')
    await add('e4', '2026-08-13', 'dentist rescheduled')

    const written = await runReflections(deps(() => 'A steady day.'), NOW)

    expect(written).toEqual(['2026-08-10', '2026-08-11', '2026-08-12'])
  })

  it('does not rewrite a reflection it already produced', async () => {
    await add('e1', '2026-08-12', 'ran five kilometres')
    await add('e2', '2026-08-13', 'dentist rescheduled')

    await runReflections(deps(() => 'First pass.'), NOW)
    const second = await runReflections(deps(() => 'Second pass.'), NOW)

    expect(second).toEqual([])
    expect((await reflectionFor(env.DB, '2026-08-12'))?.body).toBe('First pass.')
  })

  it('indexes the reflection under a stable id so it stays searchable', async () => {
    await add('e1', '2026-08-12', 'ran five kilometres')
    await add('e2', '2026-08-13', 'dentist rescheduled')

    const d = deps(() => 'A steady day.')
    await runReflections(d, NOW)

    const stored = await reflectionFor(env.DB, '2026-08-12')
    expect(stored?.id).toBe('reflection:2026-08-12')
    expect(stored?.indexed_at).not.toBeNull()
    expect(d.vectors.size).toBe(1)
  })
})
