import { z } from 'zod'
import { clampCount, countField, defineTool } from './registry'
import { hydrate } from '../db/entries'

export const searchEntries = defineTool({
  name: 'searchEntries',
  description:
    'Search the whole journal by meaning for entries about a topic, person, feeling or event. Use for any question about what the user said, did, felt or thought, at any point in the past.',
  input: z.object({
    query: z
      .string()
      .describe(
        'The subject to search for, as a natural phrase in the user\'s own words. Strip question framing: "did I ever mention feeling burnt out at work" becomes "feeling burnt out at work".',
      ),
    count: countField,
  }),
  async execute({ query, count }, ctx) {
    const [vector] = await ctx.model.embed([query])
    if (!vector) throw new Error('embedding returned no vector')

    const matches = await ctx.vectors.query(vector, { topK: clampCount(count) })
    const rows = await hydrate(
      ctx.db,
      matches.map((m) => m.id),
    )

    return {
      data: rows,
      facts: rows.length
        ? rows.map((r) => `[${r.local_date}] ${r.body}`).join('\n')
        : 'No entries in the journal touch on this.',
    }
  },
})
