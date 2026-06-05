import { describe, it, expect } from 'vitest'
import { actionError } from '@/lib/action-error'

// Each LEAK_PATTERNS entry is responsible for catching real-world driver/
// runtime error shapes without false-positive-ing safe operational
// messages we want to surface to the user. These tests anchor both sides.

describe('lib/action-error', () => {
  describe('returns sanitized fallback for leaky messages', () => {
    const LEAKS = [
      // SQLite
      ['SQLITE_BUSY: database is locked', 'SQLite errno'],
      ['LibsqlError: SERVER_ERROR: foo', 'Libsql wrapper'],
      ['SQLite3 Error: near "FROM"', 'better-sqlite3 wrapper'],
      ['no such column: foo', 'schema mismatch'],
      ['no such table: bar', 'missing table'],
      ['UNIQUE constraint failed: contacts.email', 'unique violation'],
      ['FOREIGN KEY constraint failed', 'FK violation'],
      // Postgres / Drizzle
      ['SQLSTATE 23505: duplicate key', 'pg SQLSTATE'],
      ['ER_DUP_ENTRY: duplicate', 'MySQL errno'],
      // Stack frames
      ['at Object.send (/home/runner/work/email-automator/lib/foo.ts:12:5)', 'stack frame'],
      // Container/cloud paths
      ['ENOENT: /proc/1/cmdline not found', 'proc path'],
      ['cannot read /run/secrets/foo', 'run path'],
      ['failed at /app/dist/server.js', 'vercel/app path'],
      // POSIX errno
      ['connect ECONNREFUSED 127.0.0.1:5432', 'ECONNREFUSED'],
      ['ETIMEDOUT after 3s', 'ETIMEDOUT'],
      ['ENOENT: no such file', 'ENOENT'],
      // Windows path
      ['cannot find C:\\Users\\dev\\file.txt', 'Windows path'],
      // Unix home path
      ['failed at /home/runner/build', 'home path'],
    ] as const

    for (const [msg, label] of LEAKS) {
      it(label, () => {
        const r = actionError(new Error(msg), 'Operation failed')
        expect(r.error).toBe('Operation failed')
      })
    }
  })

  describe('passes through safe deliberate messages', () => {
    const SAFE = [
      'No active template',
      'Contact already exists',
      'You must be logged in',
      'Daily send limit reached',
      'Too many admin actions — slow down',
      'Subject is required',
      'Invalid date/time',
    ]
    for (const msg of SAFE) {
      it(`"${msg}"`, () => {
        const r = actionError(new Error(msg), 'fallback should NOT be used')
        expect(r.error).toBe(msg)
      })
    }
  })

  it('uses fallback when input is not an Error', () => {
    expect(actionError('plain string', 'Generic failure').error).toBe('Generic failure')
    expect(actionError(null, 'Generic failure').error).toBe('Generic failure')
    expect(actionError(undefined, 'Generic failure').error).toBe('Generic failure')
    expect(actionError({ random: 'object' }, 'Generic failure').error).toBe('Generic failure')
  })
})
