import { test, expect } from '@playwright/test'

// Impersonation flow E2E:
//
//   admin signs in (dev-signin)
//   → navigates to /admin/users
//   → identifies another user (creates a fixture if needed)
//   → clicks Impersonate
//   → confirms purple banner appears with "Impersonating <target>"
//   → asserts admin sidebar items hidden (target is non-admin)
//   → exits via the banner's [Exit] button
//   → asserts redirect to /login
//
// Requires ALLOW_DEV_SIGNIN=true in the env that runs the test. The
// default dev allowlist includes test@gmail.com; we also need a second
// non-admin user, which we create via dev-signin too.

const ADMIN_EMAIL = 'test@gmail.com'
const TARGET_EMAIL = 'target@gmail.com'

test.describe('admin impersonation flow', () => {
  test.beforeAll(async () => {
    // The dev-signin route checks DEV_BYPASS_EMAILS — when running this
    // suite locally, export DEV_BYPASS_EMAILS=test@gmail.com,target@gmail.com
    // before `npm run e2e`. Otherwise the second sign-in below 403s.
  })

  test('admin impersonates a user, banner shows, exit redirects to login', async ({ page, context }) => {
    // ── 1. Seed the target user by signing them in once, then signing out
    await page.goto('/login')
    await page.evaluate(async (email) => {
      await fetch('/api/dev-signin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
    }, TARGET_EMAIL)
    await context.clearCookies()

    // ── 2. Sign in as admin via dev-signin
    await page.goto('/login')
    await page.evaluate(async (email) => {
      await fetch('/api/dev-signin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
    }, ADMIN_EMAIL)

    // ── 3. Navigate to admin users tab
    await page.goto('/admin/users')
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible()

    // ── 4. Find the target user's row and click Impersonate
    const targetRow = page.locator('tr', { hasText: TARGET_EMAIL }).first()
    await expect(targetRow).toBeVisible({ timeout: 5000 })
    // Confirm dialog auto-accept since impersonate() uses native confirm()
    page.once('dialog', (d) => d.accept())
    await targetRow.getByRole('button', { name: /impersonate/i }).click()

    // ── 5. Banner should appear with target's email
    const banner = page.locator('text=Impersonating').first()
    await expect(banner).toBeVisible({ timeout: 5000 })
    await expect(page.locator(`text=${TARGET_EMAIL}`).first()).toBeVisible()

    // Admin sidebar entry should disappear since we're now signed in as
    // a non-admin user.
    await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0)

    // ── 6. Click Exit on the banner
    await page.getByRole('button', { name: /exit/i }).click()

    // ── 7. Should land on /login
    await expect(page).toHaveURL(/\/login/)
  })

  test('non-admin cannot reach /admin even with planted ea_impersonator cookie', async ({ page, context }) => {
    // Sign in as a non-admin user
    await page.goto('/login')
    await page.evaluate(async (email) => {
      await fetch('/api/dev-signin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
    }, TARGET_EMAIL)

    // Try planting a forged ea_impersonator cookie (mimicking the
    // DevTools attack the HMAC signing defends against).
    await context.addCookies([{
      name: 'ea_impersonator',
      value: 'forged-admin-id.notavalidsignature',
      domain: new URL(page.url()).hostname,
      path: '/',
    }])

    // /admin should still redirect (requireAdmin checks the SESSION
    // user's admin status, not the cookie). The cookie only affects
    // the audit-log marker — and that path silently drops a forged
    // value via verifyCookieValue.
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/dashboard|\/login/)
  })
})
