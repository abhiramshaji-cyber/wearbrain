const encoder = new TextEncoder()

export function authorize(request: Request, expected: string | undefined): boolean {
  if (!expected) return false

  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return false

  const presented = encoder.encode(header.slice('Bearer '.length))
  const secret = encoder.encode(expected)
  if (presented.byteLength !== secret.byteLength) return false

  return crypto.subtle.timingSafeEqual(presented, secret)
}
