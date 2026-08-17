export interface Entry {
  id: string
  kind: 'entry' | 'reflection'
  body: string
  local_date: string
  captured_at: number
  created_at: number
  indexed_at: number | null
}

export type NewEntry = Omit<Entry, 'indexed_at'>

const COLUMNS = 'id, kind, body, local_date, captured_at, created_at, indexed_at'

export async function insertEntry(db: D1Database, e: NewEntry): Promise<boolean> {
  const res = await db
    .prepare(
      `INSERT INTO entries (id, kind, body, local_date, captured_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
    )
    .bind(e.id, e.kind, e.body, e.local_date, e.captured_at, e.created_at)
    .run()
  return res.meta.changes > 0
}

export async function markIndexed(db: D1Database, id: string, at: number): Promise<void> {
  await db.prepare('UPDATE entries SET indexed_at = ? WHERE id = ?').bind(at, id).run()
}

export async function pendingIndex(db: D1Database, limit: number): Promise<Entry[]> {
  const res = await db
    .prepare(`SELECT ${COLUMNS} FROM entries WHERE indexed_at IS NULL ORDER BY captured_at LIMIT ?`)
    .bind(limit)
    .all<Entry>()
  return res.results
}

export async function recent(db: D1Database, limit: number): Promise<Entry[]> {
  const res = await db
    .prepare(
      `SELECT ${COLUMNS} FROM entries WHERE kind = 'entry' ORDER BY captured_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<Entry>()
  return res.results
}

export async function hydrate(db: D1Database, ids: string[]): Promise<Entry[]> {
  if (ids.length === 0) return []

  const res = await db
    .prepare(`SELECT ${COLUMNS} FROM entries WHERE id IN (${ids.map(() => '?').join(',')})`)
    .bind(...ids)
    .all<Entry>()

  const byId = new Map(res.results.map((r) => [r.id, r]))
  return ids.flatMap((id) => {
    const row = byId.get(id)
    return row ? [row] : []
  })
}

export async function entriesOn(db: D1Database, date: string): Promise<Entry[]> {
  const res = await db
    .prepare(
      `SELECT ${COLUMNS} FROM entries WHERE kind = 'entry' AND local_date = ? ORDER BY captured_at`,
    )
    .bind(date)
    .all<Entry>()
  return res.results
}

export async function datesNeedingReflection(db: D1Database): Promise<string[]> {
  const res = await db
    .prepare(
      `SELECT DISTINCT local_date FROM entries
       WHERE kind = 'entry'
         AND local_date < (SELECT MAX(local_date) FROM entries WHERE kind = 'entry')
         AND local_date NOT IN (SELECT local_date FROM entries WHERE kind = 'reflection')
       ORDER BY local_date`,
    )
    .all<{ local_date: string }>()
  return res.results.map((r) => r.local_date)
}

export async function reflectionFor(db: D1Database, date: string): Promise<Entry | null> {
  return db
    .prepare(`SELECT ${COLUMNS} FROM entries WHERE kind = 'reflection' AND local_date = ?`)
    .bind(date)
    .first<Entry>()
}

export async function upsertReflection(db: D1Database, e: NewEntry): Promise<void> {
  await db
    .prepare(
      `INSERT INTO entries (id, kind, body, local_date, captured_at, created_at)
       VALUES (?, 'reflection', ?, ?, ?, ?)
       ON CONFLICT (local_date) WHERE kind = 'reflection'
       DO UPDATE SET body = excluded.body, indexed_at = NULL`,
    )
    .bind(e.id, e.body, e.local_date, e.captured_at, e.created_at)
    .run()
}
