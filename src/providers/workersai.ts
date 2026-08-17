import { generateObject, generateText } from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import type { ExtractRequest, ModelProvider, WriteRequest } from '../ports'

export const DEFAULT_ROUTER_MODEL = '@cf/meta/llama-3.1-8b-instruct'
export const DEFAULT_EMBED_MODEL = '@cf/baai/bge-base-en-v1.5'

export interface WorkersAIOptions {
  routerModel?: string
  embedModel?: string
}

export function workersAI(ai: Ai, opts: WorkersAIOptions = {}): ModelProvider {
  const routerModel = opts.routerModel ?? DEFAULT_ROUTER_MODEL
  const embedModel = opts.embedModel ?? DEFAULT_EMBED_MODEL
  const provider = createWorkersAI({ binding: ai })

  return {
    label: `workers-ai:${routerModel}`,

    async extract<T>(req: ExtractRequest<T>): Promise<T> {
      const { object } = await generateObject({
        model: provider(routerModel as Parameters<typeof provider>[0]),
        schema: req.schema,
        system: req.instructions,
        prompt: req.prompt,
      })
      return object
    },

    async write(req: WriteRequest): Promise<string> {
      const { text } = await generateText({
        model: provider(routerModel as Parameters<typeof provider>[0]),
        system: req.instructions,
        prompt: req.prompt,
      })
      return text
    },

    async embed(texts: string[]): Promise<number[][]> {
      const res = (await ai.run(embedModel as Parameters<Ai['run']>[0], { text: texts })) as {
        data: number[][]
      }
      return res.data
    },
  }
}
