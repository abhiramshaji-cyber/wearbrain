import { type Entry, insertEntry, markIndexed, type NewEntry, pendingIndex } from './db/entries'
import type { ModelProvider, VectorIndex } from './ports'

export const SWEEP_BATCH = 50

export interface IndexDeps {
  db: D1Database
  vectors: VectorIndex
  model: ModelProvider
}

export async function indexEntry(entry: Entry | NewEntry, deps: IndexDeps): Promise<boolean> {
  try {
    const [values] = await deps.model.embed([entry.body])
    if (!values) return false

    await deps.vectors.upsert([
      {
        id: entry.id,
        values,
        metadata: { kind: entry.kind, local_date: entry.local_date, captured_at: entry.captured_at },
      },
    ])
    await markIndexed(deps.db, entry.id, Date.now())
    return true
  } catch {
    return false
  }
}

export type IngestResult = { status: 'stored'; indexed: boolean } | { status: 'duplicate' }

export async function ingest(entry: NewEntry, deps: IndexDeps): Promise<IngestResult> {
  const stored = await insertEntry(deps.db, entry)
  if (!stored) return { status: 'duplicate' }

  return { status: 'stored', indexed: await indexEntry(entry, deps) }
}

export async function sweepUnindexed(deps: IndexDeps): Promise<number> {
  const pending = await pendingIndex(deps.db, SWEEP_BATCH)
  let repaired = 0
  for (const entry of pending) {
    if (await indexEntry(entry, deps)) repaired++
  }
  return repaired
}
