import { z } from 'zod'
import { defineTool } from './registry'
import { insertReminder } from '../db/reminders'

export const createReminder = defineTool({
  name: 'createReminder',
  description:
    'Schedule a nudge for the user at a future moment. Use when they ask to be reminded, told, or nudged about something later.',
  input: z.object({
    body: z
      .string()
      .describe('What to remind the user about, phrased as the reminder itself: "call the dentist".'),
    dueAt: z
      .string()
      .describe(
        'When the nudge should fire, as an ISO 8601 timestamp with offset. Resolve relative wording such as "tomorrow morning" or "in two hours" against the current time given in the instructions.',
      ),
  }),
  async execute({ body, dueAt }, ctx) {
    const due = Date.parse(dueAt)

    if (Number.isNaN(due)) {
      return { data: { created: false }, facts: `Could not understand "${dueAt}" as a time.` }
    }
    if (due <= ctx.now) {
      return {
        data: { created: false },
        facts: `That time (${dueAt}) has already passed, so no reminder was set.`,
      }
    }

    const id = crypto.randomUUID()
    await insertReminder(ctx.db, { id, body, due_at: due, created_at: ctx.now })

    return {
      data: { created: true, id, dueAt: new Date(due).toISOString() },
      facts: `Reminder set for ${new Date(due).toISOString()}: ${body}`,
    }
  },
})
