import { describe, it, expect, beforeAll } from 'vitest'
import { encryptString, decryptString, isEncrypted } from '@/lib/crypto'

beforeAll(() => {
  // test/setup.ts sets AUTH_SECRET — that's the fallback. Set
  // ENCRYPTION_KEY explicitly here so the test exercises the preferred
  // key path too.
  process.env.ENCRYPTION_KEY = 'test-encryption-key-32-bytes-or-derived-via-sha256'
})

describe('lib/crypto', () => {
  it('roundtrips plaintext', () => {
    const ct = encryptString('hello world')
    expect(ct).not.toBe('hello world')
    expect(ct.startsWith('enc:v1:')).toBe(true)
    expect(decryptString(ct)).toBe('hello world')
  })

  it('empty input → empty output', () => {
    expect(encryptString('')).toBe('')
    expect(decryptString('')).toBe('')
  })

  it('decryptString passes plaintext through unchanged (graceful migration)', () => {
    // A legacy row still has the raw password — decrypt should no-op.
    expect(decryptString('legacy-plaintext-pass')).toBe('legacy-plaintext-pass')
  })

  it('isEncrypted reports format correctly', () => {
    expect(isEncrypted('plain')).toBe(false)
    expect(isEncrypted(encryptString('secret'))).toBe(true)
  })

  it('encryptString is a no-op on already-encrypted input', () => {
    const once = encryptString('secret')
    const twice = encryptString(once)
    expect(twice).toBe(once)
  })

  it('tampered ciphertext decrypts to empty (auth tag rejected)', () => {
    const ct = encryptString('secret')
    // Flip a character in the ciphertext body.
    const idx = ct.length - 5
    const tampered = ct.slice(0, idx) + (ct[idx] === 'a' ? 'b' : 'a') + ct.slice(idx + 1)
    expect(decryptString(tampered)).toBe('')
  })

  it('each encryption uses a fresh IV (ciphertexts differ)', () => {
    const a = encryptString('same secret')
    const b = encryptString('same secret')
    expect(a).not.toBe(b)
    expect(decryptString(a)).toBe(decryptString(b))
  })
})
