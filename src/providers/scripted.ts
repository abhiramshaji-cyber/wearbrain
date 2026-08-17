import type { ExtractRequest, ModelProvider, WriteRequest } from '../ports'

export const SCRIPTED_DIM = 32

export function fakeEmbedding(text: string): number[] {
  const v = new Array<number>(SCRIPTED_DIM).fill(0)
  for (const word of text.toLowerCase().split(/\W+/)) {
    if (!word) continue
    let h = 0
    for (let i = 0; i < word.length; i++) h = (h * 31 + word.charCodeAt(i)) >>> 0
    const slot = h % SCRIPTED_DIM
    v[slot] = (v[slot] ?? 0) + 1
  }
  const norm = Math.hypot(...v)
  return norm === 0 ? v : v.map((x) => x / norm)
}

export interface Script {
  label?: string
  extract?: (req: ExtractRequest<unknown>) => unknown
  write?: (req: WriteRequest) => string
}

export interface ScriptedProvider extends ModelProvider {
  readonly calls: { extract: ExtractRequest<unknown>[]; write: WriteRequest[] }
}

export function scripted(script: Script = {}): ScriptedProvider {
  const calls = { extract: [] as ExtractRequest<unknown>[], write: [] as WriteRequest[] }

  return {
    label: script.label ?? 'scripted',
    calls,

    async extract<T>(req: ExtractRequest<T>): Promise<T> {
      calls.extract.push(req as ExtractRequest<unknown>)
      if (!script.extract) throw new Error('scripted provider: no extract in script')
      return req.schema.parse(script.extract(req as ExtractRequest<unknown>))
    },

    async write(req: WriteRequest): Promise<string> {
      calls.write.push(req)
      return script.write ? script.write(req) : req.prompt
    },

    async embed(texts: string[]): Promise<number[][]> {
      return texts.map(fakeEmbedding)
    },
  }
}
