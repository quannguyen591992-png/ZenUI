import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { resetE2e, signIn } from './helpers'

const projectId = '55555555-5555-4555-8555-555555555555'

test.beforeEach(async ({ page, request }) => {
  await resetE2e(request)
  await page.context().clearCookies()
})

test('public landing leads to private-beta login without a session error dead end', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', {
    name: 'Từ ý tưởng đến website hoàn mỹ, theo cách của bạn.',
  })).toBeVisible()
  const landingVisual = page.getByLabel('Minh họa quy trình thiết kế')
  await expect(landingVisual).toBeVisible()
  const visualLayout = await landingVisual.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    return {
      width: bounds.width,
      height: bounds.height,
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
    }
  })
  expect(visualLayout.width).toBeGreaterThan(0)
  expect(visualLayout.height).toBeGreaterThan(0)
  expect(visualLayout.documentWidth).toBeLessThanOrEqual(visualLayout.viewportWidth)
  await expect(page.getByText('Vui lòng đăng nhập để tiếp tục.')).not.toBeVisible()
  await page.getByRole('link', { name: 'Đăng nhập', exact: true }).click()

  await expect(page).toHaveURL('/login')
  await expect(page.getByRole('heading', { name: 'Đăng nhập ZenUI' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Yêu cầu quyền truy cập beta' })).toBeVisible()
})

test('protected routes preserve only safe internal login callbacks', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL('/login?callbackUrl=%2Fdashboard')

  await page.goto(`/projects/${projectId}`)
  await expect(page).toHaveURL(`/login?callbackUrl=${encodeURIComponent(`/projects/${projectId}`)}`)
})

test('guarded E2E identity reaches the separated dashboard', async ({ page }) => {
  await signIn(page)
  await page.goto('/dashboard')

  await expect(page.getByRole('heading', {
    name: 'Chào mừng đến với ZenUI',
  })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tạo dự án' })).toBeVisible()
})

test('landing, login and dashboard have no serious or critical axe violations', async ({ page }) => {
  for (const path of ['/', '/login']) {
    await page.goto(path)
    const publicAudit = await new AxeBuilder({ page }).analyze()
    expect(publicAudit.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
  }

  await signIn(page)
  await page.goto('/dashboard')
  const dashboardAudit = await new AxeBuilder({ page }).analyze()
  expect(dashboardAudit.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
})
