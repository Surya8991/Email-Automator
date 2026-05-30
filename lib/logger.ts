// One pino instance for the whole app. Pretty-printed in dev, JSON in prod
// (where log aggregators want structured fields — Vercel, Datadog, Logtail…).
//
//   import { logger } from '@/lib/logger'
//   logger.info({ userId, kind: 'sent' }, 'email sent')
//   logger.error({ err }, 'send failed')
//
// Child loggers carry the binding through the call stack:
//   const log = logger.child({ component: 'worker' })
import { pino } from 'pino'

const isDev = process.env.NODE_ENV !== 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  // In dev, pino-pretty makes lines human-readable. In prod, default JSON
  // output is what log shippers expect.
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } }
    : undefined,
  // Redact secrets from any logged object so they never end up in logs.
  redact: {
    paths: [
      '*.password', '*.SMTP_PASS', '*.GROQ_API_KEY', '*.TURSO_AUTH_TOKEN',
      '*.AUTH_SECRET', '*.access_token', '*.refresh_token', '*.apiKey', '*.api_key',
      'req.headers.cookie', 'req.headers.authorization',
    ],
    censor: '[REDACTED]',
  },
})
