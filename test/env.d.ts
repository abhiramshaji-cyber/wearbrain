declare module 'cloudflare:test' {
  interface ProvidedEnv {
    DB: D1Database
    DEVICE_TOKEN: string
    MIGRATIONS: D1Migration[]
  }
}
