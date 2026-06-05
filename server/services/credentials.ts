// Resolves the SMTP and AI credentials a user should use, with a strict
// precedence:
//   1. Per-user settings rows (saved from /settings UI)
//   2. Process env (from .env / Vercel env vars)
//   3. undefined
//
// Keeping this in one place means mailer + ai both read consistently and
// the "is this configured?" UI status checks the same logic the worker
// uses at send time.
import { getMany } from './settings'
import { decryptString } from '@/lib/crypto'

export interface SmtpCreds {
  host: string
  port: number
  user: string
  pass: string
  from: string
  source: 'user' | 'env' | 'identity' | 'none'
}

export interface AiCreds {
  apiKey: string
  model: string
  source: 'user' | 'env' | 'none'
}

const KEYS = [
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM',
  'GROQ_API_KEY', 'GROQ_MODEL',
] as const

export async function getSmtpFor(userId: string): Promise<SmtpCreds> {
  const u = await getMany(userId, KEYS as unknown as string[])
  const user = (u.SMTP_USER ?? '').trim()
  // SMTP_PASS may be stored encrypted (enc:v1:...) or plaintext (legacy
  // rows from before encryption-at-rest). decryptString passes plaintext
  // through unchanged — graceful migration without a schema change.
  const pass = decryptString((u.SMTP_PASS ?? '').trim())
  if (user && pass) {
    return {
      host: u.SMTP_HOST?.trim() || 'smtp.gmail.com',
      port: Number.parseInt(u.SMTP_PORT ?? '587', 10) || 587,
      user, pass,
      from: u.EMAIL_FROM?.trim() || user,
      source: 'user',
    }
  }
  const envUser = process.env.SMTP_USER ?? ''
  const envPass = process.env.SMTP_PASS ?? ''
  if (envUser && envPass) {
    return {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number.parseInt(process.env.SMTP_PORT ?? '587', 10) || 587,
      user: envUser, pass: envPass,
      from: process.env.EMAIL_FROM || envUser,
      source: 'env',
    }
  }
  return { host: '', port: 0, user: '', pass: '', from: '', source: 'none' }
}

export async function getAiFor(userId: string): Promise<AiCreds> {
  const u = await getMany(userId, KEYS as unknown as string[])
  // Same plaintext-fallback pattern as SMTP_PASS — decrypt if encrypted,
  // otherwise treat the stored value as plaintext.
  const userApiKey = decryptString((u.GROQ_API_KEY ?? '').trim())
  if (userApiKey) {
    return { apiKey: userApiKey, model: u.GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile', source: 'user' }
  }
  if (process.env.GROQ_API_KEY?.trim()) {
    return { apiKey: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', source: 'env' }
  }
  return { apiKey: '', model: '', source: 'none' }
}
