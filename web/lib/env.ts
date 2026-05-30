import { z } from 'zod'
import fs from 'node:fs'
import path from 'node:path'

// Load .env BEFORE zod parses process.env. Next.js loads .env automatically
// for the web server, but standalone scripts (scripts/migrate.ts,
// workers/scheduler.ts) hit this module without that wrapper. No-op if the
// keys are already present (so Next's own loader wins).
function loadDotEnv(file: string) {
  if (!fs.existsSync(file)) return
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const k = line.slice(0, eq).trim()
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(k in process.env)) process.env[k] = v
  }
}
loadDotEnv(path.join(process.cwd(), '.env'))

const envSchema = z.object({
  AUTH_SECRET: z.string().min(16),
  NEXTAUTH_URL: z.string().url().optional(),
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  DATABASE_URL: z.string().default('./data/tracker.db'),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
  ADMIN_EMAILS: z.string().default(''),
  APP_URL: z.string().default('http://localhost:3000'),
  DAILY_SEND_LIMIT: z.coerce.number().default(50),
  TIMEZONE: z.string().default('Asia/Kolkata'),
})

export const env = envSchema.parse(process.env)
export const adminEmails = env.ADMIN_EMAILS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
