import type { ModelProvider, VectorIndex } from './ports'
import { type Registry, type Route, routeSchema, toolCatalogue } from './tools/registry'

export const OFF_TOPIC_ANSWER = "That's outside your journal, so I can't answer it."
export const UNSURE_ANSWER = "I'm not sure what you're asking about — try naming the topic or day."

export interface AskRequest {
  question: string
  now: number
  nowLocalISO: string
  localDate: string
}

export interface AskDeps {
  registry: Registry
  primary: ModelProvider
  escalation?: ModelProvider | undefined
  db: D1Database
  vectors: VectorIndex
}

export interface AskResponse {
  answer: string
  tool: string | null
  escalated: boolean
  routedBy: string
}

function routerInstructions(registry: Registry, req: AskRequest): string {
  return [
    'You route a single question about the user\'s personal voice journal to exactly one tool.',
    `The current local time is ${req.nowLocalISO} and today's local date is ${req.localDate}. Resolve every relative date or time against these.`,
    'Available tools:',
    toolCatalogue(registry),
    'Choose the single best tool and fill its arguments from the question alone. Do not invent facts the user did not say.',
  ].join('\n')
}

export async function ask(req: AskRequest, deps: AskDeps): Promise<AskResponse> {
  const schema = routeSchema(deps.registry)
  const instructions = routerInstructions(deps.registry, req)

  let routedBy = deps.primary.label
  let escalated = false
  let route: Route | null = null

  try {
    route = await deps.primary.extract({ prompt: req.question, schema, instructions })
  } catch {
    route = null
  }

  if ((route === null || !route.confident) && deps.escalation) {
    escalated = true
    routedBy = deps.escalation.label
    route = await deps.escalation.extract({ prompt: req.question, schema, instructions })
  }

  if (route === null) return { answer: UNSURE_ANSWER, tool: null, escalated, routedBy }
  if (!route.aboutJournal) return { answer: OFF_TOPIC_ANSWER, tool: null, escalated, routedBy }
  if (!route.call) return { answer: UNSURE_ANSWER, tool: null, escalated, routedBy }

  const tool = deps.registry.get(route.call.tool)
  if (!tool) return { answer: UNSURE_ANSWER, tool: null, escalated, routedBy }

  const result = await tool.execute(route.call.args, {
    db: deps.db,
    vectors: deps.vectors,
    model: deps.primary,
    now: req.now,
  })

  const answer = await deps.primary.write({
    instructions: [
      'You are the voice of the user\'s own journal, answering on a watch screen.',
      'Reply in one short sentence. No preamble, no bullet points, no markdown.',
      'Use only the journal excerpts given. If they do not answer the question, say so plainly.',
      'Speak to the user as "you".',
    ].join('\n'),
    prompt: `Question: ${req.question}\n\nJournal excerpts:\n${result.facts}`,
  })

  return { answer: answer.trim(), tool: tool.name, escalated, routedBy }
}
