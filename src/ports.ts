import type { z } from 'zod'

export class ConfigError extends Error {
  constructor(what: string) {
    super(`${what} is not configured`)
    this.name = 'ConfigError'
  }
}

export interface ExtractRequest<T> {
  prompt: string
  schema: z.ZodType<T>
  instructions: string
}

export interface WriteRequest {
  prompt: string
  instructions: string
}

export interface ModelProvider {
  readonly label: string
  extract<T>(req: ExtractRequest<T>): Promise<T>
  write(req: WriteRequest): Promise<string>
  embed(texts: string[]): Promise<number[][]>
}

export interface VectorItem {
  id: string
  values: number[]
  metadata: Record<string, string | number>
}

export interface VectorMatch {
  id: string
  score: number
}

export interface VectorIndex {
  upsert(items: VectorItem[]): Promise<void>
  query(vector: number[], opts: { topK: number }): Promise<VectorMatch[]>
}
