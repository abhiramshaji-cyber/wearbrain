import type { VectorIndex, VectorItem, VectorMatch } from './ports'

export function vectorize(index: VectorizeIndex): VectorIndex {
  return {
    async upsert(items: VectorItem[]): Promise<void> {
      if (items.length === 0) return
      await index.upsert(items.map((i) => ({ id: i.id, values: i.values, metadata: i.metadata })))
    },

    async query(vector: number[], opts: { topK: number }): Promise<VectorMatch[]> {
      const res = await index.query(vector, { topK: opts.topK })
      return res.matches.map((m) => ({ id: m.id, score: m.score }))
    },
  }
}

export interface MemoryIndex extends VectorIndex {
  readonly size: number
}

export function memoryVectors(): MemoryIndex {
  const items = new Map<string, VectorItem>()

  return {
    get size() {
      return items.size
    },

    async upsert(next: VectorItem[]): Promise<void> {
      for (const item of next) items.set(item.id, item)
    },

    async query(vector: number[], opts: { topK: number }): Promise<VectorMatch[]> {
      return [...items.values()]
        .map((item) => ({ id: item.id, score: dot(item.values, vector) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, opts.topK)
    },
  }
}

function dot(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) sum += (a[i] ?? 0) * (b[i] ?? 0)
  return sum
}
