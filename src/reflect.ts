import { datesNeedingReflection, entriesOn, upsertReflection } from './db/entries'
import { indexEntry, type IndexDeps } from './ingest'

export const MAX_DAYS_PER_RUN = 7

export async function reflectOn(date: string, deps: IndexDeps, now: number): Promise<boolean> {
  const entries = await entriesOn(deps.db, date)
  if (entries.length === 0) return false

  const body = await deps.model.write({
    instructions: [
      "You write a short daily reflection on the user's own journal entries.",
      'Two or three sentences. Summarise what the day held, then name any pattern worth noticing.',
      'Use only what the entries say. Speak to the user as "you". No preamble, no markdown.',
    ].join('\n'),
    prompt: `Entries for ${date}:\n${entries.map((e) => e.body).join('\n')}`,
  })

  const reflection = {
    id: `reflection:${date}`,
    kind: 'reflection' as const,
    body: body.trim(),
    local_date: date,
    captured_at: now,
    created_at: now,
  }

  await upsertReflection(deps.db, reflection)
  await indexEntry(reflection, deps)
  return true
}

export async function runReflections(deps: IndexDeps, now: number): Promise<string[]> {
  const dates = (await datesNeedingReflection(deps.db)).slice(-MAX_DAYS_PER_RUN)
  const written: string[] = []
  for (const date of dates) {
    if (await reflectOn(date, deps, now)) written.push(date)
  }
  return written
}
