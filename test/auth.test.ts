import { describe, expect, it } from 'vitest'
import { authorize } from '../src/auth'

const req = (header?: string) =>
  new Request('https://wearbrain.dev/ask', header ? { headers: { authorization: header } } : {})

describe('authorize', () => {
  it('accepts the configured device token', () => {
    expect(authorize(req('Bearer secret-token'), 'secret-token')).toBe(true)
  })

  it('rejects a wrong token, a prefix of it, and a missing header', () => {
    expect(authorize(req('Bearer wrong-token'), 'secret-token')).toBe(false)
    expect(authorize(req('Bearer secret'), 'secret-token')).toBe(false)
    expect(authorize(req(), 'secret-token')).toBe(false)
  })

  it('rejects a non-bearer scheme', () => {
    expect(authorize(req('Basic secret-token'), 'secret-token')).toBe(false)
  })

  it('locks the worker shut when no token is configured', () => {
    expect(authorize(req('Bearer anything'), undefined)).toBe(false)
    expect(authorize(req('Bearer '), '')).toBe(false)
  })
})
