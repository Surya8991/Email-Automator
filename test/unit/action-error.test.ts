import { describe, it, expect } from 'vitest'
import { actionError, isSchemaMissingError } from '@/lib/action-error'

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
      // "no such column" / "no such table" now route to the schema-missing
      // branch — those are covered in the dedicated section below.
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

  describe('schema-missing detection', () => {
    const SCHEMA_MSGS = [
      'no such table: job_sources',
      'no such column: source_id',
      'SQLITE_ERROR: no such table: foo',
    ]
    for (const msg of SCHEMA_MSGS) {
      it(`detects "${msg}"`, () => {
        expect(isSchemaMissingError(new Error(msg))).toBe(true)
      })
    }
    it('does NOT detect generic SQLite errors', () => {
      expect(isSchemaMissingError(new Error('SQLITE_BUSY: locked'))).toBe(false)
      expect(isSchemaMissingError(new Error('UNIQUE constraint failed'))).toBe(false)
    })
    it('does NOT detect non-Error inputs', () => {
      expect(isSchemaMissingError('no such table: x')).toBe(false)
      expect(isSchemaMissingError(null)).toBe(false)
      expect(isSchemaMissingError(undefined)).toBe(false)
    })
    it('actionError returns an actionable message for schema-missing errors', () => {
      const r = actionError(new Error('no such table: job_sources'), 'Add failed')
      // Must mention migrations + OPERATOR_TODO so the user can act,
      // not just "Add failed" which left them stranded before this fix.
      expect(r.error).toMatch(/migration/i)
      expect(r.error).toMatch(/OPERATOR_TODO/i)
    })
  })
})
