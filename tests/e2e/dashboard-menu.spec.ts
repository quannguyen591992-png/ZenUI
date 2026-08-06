import { expect, test } from '@playwright/test'

import { createOnboardingProject, resetE2e, signIn } from './helpers'

test.beforeEach(async ({ page, request }) => {
  await resetE2e(request)
  await signIn(page)
})

test('opens project actions without navigating into the project', async ({ page }) => {
  const name = `Dashboard menu layering ${Date.now()}`
  const projectId = await createOnboardingProject(page, name)
  const dashboardUrl = page.url()

  await page.getByRole('button', { name: `Tùy chọn cho ${name}` }).click()

  await expect(page).toHaveURL(dashboardUrl)
  await expect(page.getByRole('menuitem', { name: `Đổi tên ${name}` })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: `Xóa ${name}` })).toBeVisible()
  await expect(page.getByRole('link', { name: `Mở ${name}` })).toHaveAttribute('href', `/projects/${projectId}`)
})
