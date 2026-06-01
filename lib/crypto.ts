// AES-256-GCM at-rest encryption for secrets stored in the per-user
// `settings` table (SMTP password, AI API key). Values are formatted
//   enc:v1:<iv-b64>:<ct+tag-b64>
// so a partially-migrated DB can mix plaintext and encrypted rows — the
// decryptor inspects the prefix and passes plaintext through unchanged.
//
// Key source priority:
//   1. ENCRYPTION_KEY env (recommended: 32 bytes, base64-encoded)
//   2. AUTH_SECRET env (always present, used as a fallback so the app
//      doesn't refuse to boot when ENCRYPTION_KEY isn't set yet)
// In production set ENCRYPTION_KEY explicitly. The fallback exists so
// the migration onto encrypted-at-rest doesn't require a coordinated
// env change at the same time.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const PREFIX = 'enc:v1:'

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY?.trim() || process.env.AUTH_SECRET?.trim()
  if (!raw) throw new Error('ENCRYPTION_KEY or AUTH_SECRET must be set for at-rest encryption')
  // Allow either a 32-byte base64 string OR an arbitrary passphrase that
  // we derive a key from. SHA-256 lands either input at exactly 32 bytes.
  return createHash('sha256').update(raw).digest()
}

export function encryptString(plain: string): string {
  if (!plain) return ''
  // Don't double-encrypt — handy when callers don't track whether the
  // value already cycled through this function.
  if (plain.startsWith(PREFIX)) return plain
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64')}:${Buffer.concat([ct, tag]).toString('base64')}`
}

export function decryptString(value: string): string {
  if (!value || !value.startsWith(PREFIX)) return value
  // Format: enc:v1:<iv-b64>:<ct+tag-b64>
  const parts = value.slice(PREFIX.length).split(':')
  if (parts.length !== 2) return ''
  try {
    const iv = Buffer.from(parts[0]!, 'base64')
    const ctAndTag = Buffer.from(parts[1]!, 'base64')
    // The GCM authentication tag is the last 16 bytes.
    const ct = ctAndTag.subarray(0, ctAndTag.length - 16)
    const tag = ctAndTag.subarray(ctAndTag.length - 16)
    const decipher = createDecipheriv('aes-256-gcm', key(), iv)
    decipher.setAuthTag(tag)
    const pt = Buffer.concat([decipher.update(ct), decipher.final()])
    return pt.toString('utf8')
  } catch {
    // Corrupted / tampered ciphertext, or key rotated without re-encrypt.
    // Return empty so callers treat it the same as "no value set" rather
    // than crashing the request.
    return ''
  }
}

export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX)
}
