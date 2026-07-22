import { expect, test } from '@playwright/test'

import { createProject, resetE2e, signIn } from './helpers'

test.beforeEach(async ({ page, request }) => {
  await resetE2e(request)
  await signIn(page)
})

test('builds, edits, reorders, restores and exports a standalone design', async ({ page }) => {
  const projectId = await createProject(page, 'Editor flow')
  await page.goto(`/projects/${projectId}`)
  await page.getByRole('treeitem', { name: 'Container: Container' }).click()
  await page.getByRole('button', { name: 'Add Heading' }).click()
  const text = page.getByLabel('Text')
  await text.fill('Phase 2 heading')
  await page.getByLabel('Color').fill('#112233')
  await expect(page.getByRole('heading', { name: 'Phase 2 heading' })).toHaveCSS('color', 'rgb(17, 34, 51)')
  await expect(page.getByText('Saved')).toBeVisible()

  await page.getByRole('button', { name: 'Move Phase 2 heading up' }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Undo' }).click()
  await page.getByRole('button', { name: 'Redo' }).click()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Phase 2 heading' })).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export HTML' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('zenui-export.html')
  expect(await download.path()).not.toBeNull()
})

test('rejects invalid targets without changing the canvas', async ({ page }) => {
  const projectId = await createProject(page, 'Invalid target')
  await page.goto(`/projects/${projectId}`)
  await page.getByRole('treeitem', { name: 'Page: Page' }).click()
  const before = await page.locator('[data-node-id]').count()
  await page.getByRole('button', { name: 'Add Button' }).click()
  await expect(page.getByText('button is not allowed inside page')).toBeVisible()
  await expect(page.locator('[data-node-id]')).toHaveCount(before)
})
