export interface Reminder {
  id: string
  body: string
  due_at: number
  created_at: number
  fired_at: number | null
}

export async function insertReminder(
  db: D1Database,
  r: Omit<Reminder, 'fired_at'>,
): Promise<void> {
  await db
    .prepare('INSERT INTO reminders (id, body, due_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(r.id, r.body, r.due_at, r.created_at)
    .run()
}

export async function dueReminders(db: D1Database, at: number): Promise<Reminder[]> {
  const res = await db
    .prepare('SELECT * FROM reminders WHERE fired_at IS NULL AND due_at <= ? ORDER BY due_at')
    .bind(at)
    .all<Reminder>()
  return res.results
}

export async function markFired(db: D1Database, ids: string[], at: number): Promise<void> {
  if (ids.length === 0) return
  await db
    .prepare(`UPDATE reminders SET fired_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`)
    .bind(at, ...ids)
    .run()
}
