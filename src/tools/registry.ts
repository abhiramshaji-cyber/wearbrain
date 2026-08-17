import { z } from 'zod'
import type { ModelProvider, VectorIndex } from '../ports'

export const MAX_TOOLS = 4
export const MAX_RESULTS = 10

export const countField = z
  .number()
  .int()
  .describe(
    'How many entries the user asked for. Read it from their phrasing: "the last one" is 1, "a couple" is 2, "a few" is 3, an unspecified plural is 5. Never invent a large number.',
  )

export function clampCount(n: number): number {
  if (!Number.isFinite(n)) return 5
  return Math.min(MAX_RESULTS, Math.max(1, Math.trunc(n)))
}

export interface ToolContext {
  db: D1Database
  vectors: VectorIndex
  model: ModelProvider
  now: number
}

export interface ToolResult {
  data: unknown
  facts: string
}

export interface Tool<I> {
  name: string
  description: string
  input: z.ZodType<I>
  execute(input: I, ctx: ToolContext): Promise<ToolResult>
}

export interface AnyTool {
  name: string
  description: string
  input: z.ZodType<unknown>
  execute(raw: unknown, ctx: ToolContext): Promise<ToolResult>
}

export function defineTool<I>(tool: Tool<I>): AnyTool {
  return {
    name: tool.name,
    description: tool.description,
    input: tool.input as z.ZodType<unknown>,
    execute: (raw, ctx) => tool.execute(tool.input.parse(raw), ctx),
  }
}

export class Registry {
  private readonly byName: Map<string, AnyTool>

  constructor(readonly tools: AnyTool[]) {
    if (tools.length < 2) throw new Error('registry needs at least two tools to route between')
    if (tools.length > MAX_TOOLS) {
      throw new Error(
        `registry has ${tools.length} tools, cap is ${MAX_TOOLS}; small-model selection accuracy degrades past this (docs/plan.md)`,
      )
    }
    this.byName = new Map(tools.map((t) => [t.name, t]))
    if (this.byName.size !== tools.length) throw new Error('duplicate tool name in registry')
  }

  get(name: string): AnyTool | undefined {
    return this.byName.get(name)
  }
}

export interface Route {
  aboutJournal: boolean
  confident: boolean
  call: { tool: string; args: unknown } | null
}

export function routeSchema(registry: Registry): z.ZodType<Route> {
  const variants = registry.tools.map((t) =>
    z.object({ tool: z.literal(t.name), args: t.input }).describe(t.description),
  ) as unknown as [z.ZodObject<never>, z.ZodObject<never>, ...z.ZodObject<never>[]]

  return z.object({
    aboutJournal: z
      .boolean()
      .describe(
        'True if the question concerns the user\'s own journal, life, memories, habits, plans or reminders. False for general knowledge, trivia, or anything a personal journal could not answer, such as "what is the capital of Peru".',
      ),
    confident: z
      .boolean()
      .describe(
        'True only if the chosen tool and its arguments clearly follow from the question. False when the question is vague, could reasonably map to more than one tool, or you had to guess an argument.',
      ),
    call: z
      .discriminatedUnion('tool', variants)
      .nullable()
      .describe('The tool to run. Null when aboutJournal is false.'),
  }) as unknown as z.ZodType<Route>
}

export function toolCatalogue(registry: Registry): string {
  return registry.tools.map((t) => `- ${t.name}: ${t.description}`).join('\n')
}
