import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { clampCount, defineTool, MAX_TOOLS, Registry, routeSchema } from '../src/tools/registry'
import { defaultRegistry } from '../src/tools'

const stub = (name: string) =>
  defineTool({
    name,
    description: `does ${name}`,
    input: z.object({ value: z.string() }),
    async execute(input) {
      return { data: input, facts: input.value }
    },
  })

describe('registry', () => {
  it('refuses to grow past the tool cap the design depends on', () => {
    const tools = Array.from({ length: MAX_TOOLS + 1 }, (_, i) => stub(`t${i}`))
    expect(() => new Registry(tools)).toThrow(/cap is 4/)
  })

  it('rejects duplicate tool names', () => {
    expect(() => new Registry([stub('same'), stub('same')])).toThrow(/duplicate/)
  })

  it('derives the router schema from whatever tools are registered', () => {
    const parsed = routeSchema(new Registry([stub('alpha'), stub('beta')])).safeParse({
      aboutJournal: true,
      confident: true,
      call: { tool: 'beta', args: { value: 'hi' } },
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects arguments that do not match the chosen tool', () => {
    const parsed = routeSchema(new Registry([stub('alpha'), stub('beta')])).safeParse({
      aboutJournal: true,
      confident: true,
      call: { tool: 'beta', args: { wrong: 1 } },
    })
    expect(parsed.success).toBe(false)
  })

  it('accepts a new tool with no change to the router', () => {
    const registry = new Registry([stub('alpha'), stub('beta'), stub('gamma')])
    const parsed = routeSchema(registry).safeParse({
      aboutJournal: true,
      confident: true,
      call: { tool: 'gamma', args: { value: 'hi' } },
    })
    expect(parsed.success).toBe(true)
  })

  it('ships the four tools the plan specifies', () => {
    expect(defaultRegistry().tools.map((t) => t.name)).toEqual([
      'searchEntries',
      'listRecent',
      'createReminder',
      'getReflection',
    ])
  })
})

describe('clampCount', () => {
  it('keeps a model-chosen count inside a safe range without inventing one', () => {
    expect(clampCount(1)).toBe(1)
    expect(clampCount(3)).toBe(3)
    expect(clampCount(0)).toBe(1)
    expect(clampCount(9999)).toBe(10)
    expect(clampCount(Number.NaN)).toBe(5)
  })
})
