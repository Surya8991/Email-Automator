// Multiple email identities per user.
//
// Senders can have separate from-addresses for personal vs work outreach,
// or multiple role-tailored personas. SMTP credentials are encrypted at
// rest via lib/crypto.ts. The legacy single per-user SMTP under
// settings.SMTP_* is still treated as the implicit "default" identity
// when no row exists in email_identities.
import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { emailIdentities } from '@/server/db/schema'
import { encryptString, decryptString } from '@/lib/crypto'

export interface IdentityInput {
  label: string
  fromName: string
  fromEmail: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string  // plaintext; encrypted before insert
  isDefault?: boolean
}

export async function listIdentities(userId: string) {
  return db.select({
    id: emailIdentities.id,
    label: emailIdentities.label,
    fromName: emailIdentities.fromName,
    fromEmail: emailIdentities.fromEmail,
    smtpHost: emailIdentities.smtpHost,
    smtpPort: emailIdentities.smtpPort,
    smtpUser: emailIdentities.smtpUser,
    isDefault: emailIdentities.isDefault,
    createdAt: emailIdentities.createdAt,
  }).from(emailIdentities)
    .where(eq(emailIdentities.userId, userId))
    .orderBy(asc(emailIdentities.label))
}

// Resolve a specific identity for sending. Returns decrypted SMTP creds.
// Falls back to the legacy settings-based identity when id is undefined or
// the row no longer exists.
export async function getIdentityCreds(userId: string, id?: number) {
  if (!id) return null
  const [row] = await db.select().from(emailIdentities)
    .where(and(eq(emailIdentities.userId, userId), eq(emailIdentities.id, id)))
    .limit(1)
  if (!row) return null
  return {
    host: row.smtpHost,
    port: row.smtpPort,
    user: row.smtpUser,
    pass: decryptString(row.smtpPassEnc),
    from: row.fromName ? `${row.fromName} <${row.fromEmail}>` : row.fromEmail,
    source: 'identity' as const,
  }
}

export async function createIdentity(userId: string, input: IdentityInput) {
  const clean = input.label.trim()
  if (!clean) throw new Error('Label required')
  if (!input.fromEmail.trim()) throw new Error('From email required')
  if (input.isDefault) {
    // Only one default per user — clear others first.
    await db.update(emailIdentities).set({ isDefault: false })
      .where(eq(emailIdentities.userId, userId))
  }
  const ins = await db.insert(emailIdentities).values({
    userId,
    label: clean,
    fromName: input.fromName ?? '',
    fromEmail: input.fromEmail.trim(),
    smtpHost: input.smtpHost.trim(),
    smtpPort: input.smtpPort,
    smtpUser: input.smtpUser.trim(),
    smtpPassEnc: encryptString(input.smtpPass ?? ''),
    isDefault: Boolean(input.isDefault),
  }).returning({ id: emailIdentities.id })
  return ins[0]!.id
}

export async function setDefaultIdentity(userId: string, id: number) {
  await db.update(emailIdentities).set({ isDefault: false })
    .where(eq(emailIdentities.userId, userId))
  await db.update(emailIdentities).set({ isDefault: true })
    .where(and(eq(emailIdentities.userId, userId), eq(emailIdentities.id, id)))
}

export async function deleteIdentity(userId: string, id: number) {
  await db.delete(emailIdentities)
    .where(and(eq(emailIdentities.userId, userId), eq(emailIdentities.id, id)))
}
