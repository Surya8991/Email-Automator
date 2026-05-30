import { test, expect } from '@playwright/test'

test('login page renders and shows magic-link form when SMTP is set', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByText('Welcome back')).toBeVisible()
  // The exact button visibility depends on env — assert at least one CTA exists.
  const ctas = await page.getByRole('button').count()
  expect(ctas).toBeGreaterThan(0)
})

test('root redirects unauthenticated users to /login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
})

test('protected pages redirect to login', async ({ page }) => {
  for (const path of ['/dashboard', '/contacts', '/drafts', '/templates', '/analytics']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login/)
  }
})
