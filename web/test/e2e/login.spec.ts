import { test, expect } from '@playwright/test'

test('login page renders', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByText('Welcome back')).toBeVisible()
  // CTA visibility depends on env: with SMTP set we get a magic-link form;
  // with neither SMTP nor Google we fall back to the "Configure SMTP" copy.
  // Both render the page heading, so we only assert that.
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
