import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeEach } from 'vitest'

beforeEach(async () => {
  await env.DB.exec('DROP TABLE IF EXISTS entries')
  await env.DB.exec('DROP TABLE IF EXISTS reminders')
  await env.DB.exec('DROP TABLE IF EXISTS d1_migrations')
  await applyD1Migrations(env.DB, env.MIGRATIONS)
})
