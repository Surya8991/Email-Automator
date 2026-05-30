import { z } from 'zod'

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
  ANTHROPIC_API_KEY: z.string().optional(),
  ADMIN_EMAILS: z.string().default(''),
  APP_URL: z.string().default('http://localhost:3000'),
  DAILY_SEND_LIMIT: z.coerce.number().default(50),
  TIMEZONE: z.string().default('Asia/Kolkata'),
})

export const env = envSchema.parse(process.env)
export const adminEmails = env.ADMIN_EMAILS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
