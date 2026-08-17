import { z } from 'zod'
import { clampCount, countField, defineTool } from './registry'
import { recent } from '../db/entries'

export const listRecent = defineTool({
  name: 'listRecent',
  description:
    'Read back the most recent journal entries in order, newest first. Use when the user asks what they logged lately, what the last thing they said was, or to catch up — with no particular topic.',
  input: z.object({ count: countField }),
  async execute({ count }, ctx) {
    const rows = await recent(ctx.db, clampCount(count))
    return {
      data: rows,
      facts: rows.length
        ? rows.map((r) => `[${r.local_date}] ${r.body}`).join('\n')
        : 'The journal is empty.',
    }
  },
})
