import { z } from 'zod'
import { ask } from './agent'
import { authorize } from './auth'
import { dueReminders } from './db/reminders'
import { ingest, type IndexDeps, sweepUnindexed } from './ingest'
import { ConfigError, type ModelProvider } from './ports'
import { google } from './providers/google'
import { workersAI } from './providers/workersai'
import { runReflections } from './reflect'
import { defaultRegistry } from './tools'
import { vectorize } from './vectors'

export interface Env {
  DB: D1Database
  VECTORS: VectorizeIndex
  AI: Ai
  DEVICE_TOKEN?: string
  GOOGLE_API_KEY?: string
  ROUTER_MODEL?: string
  EMBED_MODEL?: string
  ESCALATION_MODEL?: string
}

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/

const entryPayload = z.object({
  id: z.string().min(1).max(128),
  body: z.string().min(1).max(8000),
  localDate: z.string().regex(LOCAL_DATE),
  capturedAt: z.number().int().positive(),
})

const askPayload = z.object({
  question: z.string().min(1).max(2000),
  localDate: z.string().regex(LOCAL_DATE),
  nowLocalISO: z.string().min(1),
})

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

function indexDeps(env: Env): IndexDeps {
  if (!env.AI) throw new ConfigError('Workers AI binding')
  return {
    db: env.DB,
    vectors: vectorize(env.VECTORS),
    model: workersAI(env.AI, {
      ...(env.ROUTER_MODEL ? { routerModel: env.ROUTER_MODEL } : {}),
      ...(env.EMBED_MODEL ? { embedModel: env.EMBED_MODEL } : {}),
    }),
  }
}

function escalationProvider(env: Env): ModelProvider | undefined {
  if (!env.GOOGLE_API_KEY) return undefined
  return google(env.GOOGLE_API_KEY, env.ESCALATION_MODEL)
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)

  if (url.pathname === '/health') return json({ ok: true })

  if (!authorize(request, env.DEVICE_TOKEN)) return json({ error: 'unauthorized' }, 401)

  if (request.method === 'POST' && url.pathname === '/entries') {
    const parsed = entryPayload.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return json({ error: 'invalid entry', issues: parsed.error.issues }, 400)

    const now = Date.now()
    const result = await ingest(
      {
        id: parsed.data.id,
        kind: 'entry',
        body: parsed.data.body,
        local_date: parsed.data.localDate,
        captured_at: parsed.data.capturedAt,
        created_at: now,
      },
      indexDeps(env),
    )

    return json(result, result.status === 'stored' ? 201 : 200)
  }

  if (request.method === 'POST' && url.pathname === '/ask') {
    const parsed = askPayload.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return json({ error: 'invalid question', issues: parsed.error.issues }, 400)

    const deps = indexDeps(env)
    const answer = await ask(
      {
        question: parsed.data.question,
        now: Date.now(),
        nowLocalISO: parsed.data.nowLocalISO,
        localDate: parsed.data.localDate,
      },
      {
        registry: defaultRegistry(),
        primary: deps.model,
        escalation: escalationProvider(env),
        db: deps.db,
        vectors: deps.vectors,
      },
    )

    return json(answer)
  }

  if (request.method === 'GET' && url.pathname === '/reminders/due') {
    return json({ reminders: await dueReminders(env.DB, Date.now()) })
  }

  return json({ error: 'not found' }, 404)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, env)
    } catch (err) {
      if (err instanceof ConfigError) return json({ error: err.message }, 503)
      console.error('unhandled', err)
      return json({ error: 'internal error' }, 500)
    }
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const deps = indexDeps(env)
    const repaired = await sweepUnindexed(deps)
    const written = await runReflections(deps, Date.now())
    console.log(JSON.stringify({ repaired, reflections: written }))
  },
} satisfies ExportedHandler<Env>
