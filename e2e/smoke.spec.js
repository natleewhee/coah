import { test, expect } from '@playwright/test'

// Every tool and its "the math" page renders without error. Covers R5.

const TOOLS = ['insure', 'drive', 'etf', 'house', 'retire', 'tax', 'ledger']

// Fail a page check if the browser logs an uncaught error or a React
// error while the page loads — a 200 with a broken client component
// otherwise passes silently.
function trackPageErrors(page) {
  const errors = []
  page.on('pageerror', (err) => errors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  return errors
}

test('home page renders all seven tool cards', async ({ page }) => {
  const errors = trackPageErrors(page)
  const res = await page.goto('/')
  expect(res?.status(), 'GET / status').toBe(200)

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  for (const tool of TOOLS) {
    await expect(
      page.locator(`a[href="/${tool}"]`),
      `home card link to /${tool}`,
    ).toBeVisible()
  }

  expect(errors, 'browser errors on /').toEqual([])
})

for (const tool of TOOLS) {
  test(`/${tool} landing renders`, async ({ page }) => {
    const errors = trackPageErrors(page)
    const res = await page.goto(`/${tool}`)
    expect(res?.status(), `GET /${tool} status`).toBe(200)
    await expect(page.getByRole('heading').first()).toBeVisible()
    await expect(page).toHaveTitle(/\S/)
    expect(errors, `browser errors on /${tool}`).toEqual([])
  })

  test(`/${tool}/the-math renders`, async ({ page }) => {
    const errors = trackPageErrors(page)
    const res = await page.goto(`/${tool}/the-math`)
    expect(res?.status(), `GET /${tool}/the-math status`).toBe(200)
    await expect(page.getByRole('heading').first()).toBeVisible()
    expect(errors, `browser errors on /${tool}/the-math`).toEqual([])
  })
}

// FlowState was absorbed into MyLedger's Capacity module — both of its old
// routes return a hard 410 rather than a redirect (KD4/KTD4), so nothing
// still resolves to a standalone FlowState decision.
test('/flow returns 410 Gone', async ({ page }) => {
  const res = await page.goto('/flow')
  expect(res?.status(), 'GET /flow status').toBe(410)
})

test('/flow/the-math returns 410 Gone', async ({ page }) => {
  const res = await page.goto('/flow/the-math')
  expect(res?.status(), 'GET /flow/the-math status').toBe(410)
})
