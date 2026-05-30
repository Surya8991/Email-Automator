import type { Config } from 'drizzle-kit'

// SQLite dialect — generated SQL is the same for better-sqlite3 (local) and
// libSQL/Turso (Vercel). The runtime driver is picked in server/db/client.ts
// based on the DATABASE_URL shape.
const url = process.env.DATABASE_URL ?? './data/tracker.db'
const isLibsql = /^(libsql:|https?:|file:)/i.test(url)

export default {
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dialect: isLibsql ? 'turso' : 'sqlite',
  dbCredentials: isLibsql
    ? { url, authToken: process.env.TURSO_AUTH_TOKEN }
    : { url },
  strict: true,
  verbose: true,
} satisfies Config
