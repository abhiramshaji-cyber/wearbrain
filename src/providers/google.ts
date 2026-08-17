import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateObject, generateText } from 'ai'
import type { ExtractRequest, ModelProvider, WriteRequest } from '../ports'

export const DEFAULT_ESCALATION_MODEL = 'gemini-2.5-flash-lite'

export function google(apiKey: string, model = DEFAULT_ESCALATION_MODEL): ModelProvider {
  const provider = createGoogleGenerativeAI({ apiKey })

  return {
    label: `google:${model}`,

    async extract<T>(req: ExtractRequest<T>): Promise<T> {
      const { object } = await generateObject({
        model: provider(model),
        schema: req.schema,
        system: req.instructions,
        prompt: req.prompt,
      })
      return object
    },

    async write(req: WriteRequest): Promise<string> {
      const { text } = await generateText({
        model: provider(model),
        system: req.instructions,
        prompt: req.prompt,
      })
      return text
    },

    async embed(): Promise<number[][]> {
      throw new Error('escalation provider does not serve embeddings; embeddings stay on Workers AI')
    },
  }
}
