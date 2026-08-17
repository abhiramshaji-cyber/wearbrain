import { z } from 'zod'
import { defineTool } from './registry'
import { reflectionFor } from '../db/entries'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const getReflection = defineTool({
  name: 'getReflection',
  description:
    'Fetch the daily reflection the journal wrote for a particular day — its summary of that day and any patterns it noticed. Use when the user asks about a day as a whole, or what the journal made of it.',
  input: z.object({
    date: z
      .string()
      .describe(
        'The day to fetch, as YYYY-MM-DD. Resolve relative wording such as "yesterday" or "last Friday" against the current local date given in the instructions.',
      ),
  }),
  async execute({ date }, ctx) {
    if (!ISO_DATE.test(date)) {
      return { data: null, facts: `"${date}" is not a date I can look up.` }
    }

    const row = await reflectionFor(ctx.db, date)
    return {
      data: row ?? null,
      facts: row ? `Reflection for ${date}: ${row.body}` : `No reflection was written for ${date}.`,
    }
  },
})
