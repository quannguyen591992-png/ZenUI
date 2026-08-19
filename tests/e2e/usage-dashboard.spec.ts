import { expect, test } from '@playwright/test'

import {
  createProject,
  resetE2e,
  signIn,
} from './helpers'

test.beforeEach(async ({ page, request }) => {
  await resetE2e(request)
  await signIn(page)
})

test('shows current-user priced and unpriced AI usage', async ({ page }) => {
  const projectId = await createProject(page, 'Usage dashboard project')
  const seeded = await page.request.post('/api/e2e/ai-usage', {
    data: { projectId },
  })
  expect(seeded.ok()).toBe(true)

  await page.getByRole('link', {
    name: 'Sử dụng AI',
  }).click()
  await expect(page).toHaveURL(
    '/dashboard/usage',
  )
  await expect(page.getByRole('heading', {
    name: 'Sử dụng AI',
  })).toBeVisible()
  await expect(page.getByText('gemini-2.5-flash')).toBeVisible()
  await expect(page.getByText('unknown-e2e-model')).toBeVisible()
  await expect(page.getByText(
    'Chưa có giá',
    { exact: true },
  )).toBeVisible()
  await expect(page.getByText(
    /1 lượt gọi chưa có giá\./,
  )).toBeVisible()
  await expect(page.getByRole('img', {
    name: 'Biểu đồ token AI theo ngày',
  })).toBeVisible()
})

test('shows an empty state before the account uses AI', async ({ page }) => {
  await page.goto('/dashboard/usage')
  await expect(page.getByText(
    'Chưa có lượt sử dụng AI trong khoảng thời gian này.',
  )).toBeVisible()
})
