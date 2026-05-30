// Each integration test gets an in-memory SQLite so they're hermetic.
process.env.DATABASE_URL = ':memory:'
process.env.AUTH_SECRET = 'test-secret-must-be-at-least-16-chars-long'
process.env.SMTP_USER = process.env.SMTP_USER ?? 'test@example.com'
process.env.SMTP_PASS = process.env.SMTP_PASS ?? 'test-pass'
process.env.EMAIL_FROM = process.env.EMAIL_FROM ?? 'test@example.com'
