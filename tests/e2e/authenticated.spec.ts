import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { createProject, resetE2e, signIn, workspaceId } from './helpers'

test.beforeEach(async ({ page, request }) => {
  await resetE2e(request)
  await signIn(page)
})

test('creates a project, autosaves, reloads and restores an immutable revision', async ({ page }) => {
  const projectId = await createProject(page)
  await page.goto(`/projects/${projectId}`)
  await page.getByRole('treeitem', { name: 'Heading: Build your next product' }).click()
  await page.getByLabel('Text').fill('Persisted heading')
  await expect(page.getByText('Saved')).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Persisted heading' })).toBeVisible()
  await page.getByLabel('Revision summary').fill('Saved baseline')
  await page.getByRole('button', { name: 'Create revision' }).click()
  await expect(page.getByText('Saved baseline')).toBeVisible()

  await page.getByRole('treeitem', { name: 'Heading: Persisted heading' }).click()
  await page.getByLabel('Text').fill('Changed after revision')
  await expect(page.getByText('Saved')).toBeVisible()
  await page.getByRole('button', { name: 'Restore Saved baseline' }).click()
  await expect(page.getByRole('heading', { name: 'Persisted heading' })).toBeVisible()
})

test('prevents tenant enumeration and preserves stale-tab local work', async ({ browser, page }) => {
  const projectId = await createProject(page, 'Concurrent project')
  const contextA = page.context()
  const pageA = await contextA.newPage()
  const pageB = await contextA.newPage()
  await Promise.all([pageA.goto(`/projects/${projectId}`), pageB.goto(`/projects/${projectId}`)])

  await pageA.getByRole('treeitem', { name: 'Heading: Build your next product' }).click()
  await pageA.getByLabel('Color').fill('#112233')
  await expect(pageA.getByText('Saved')).toBeVisible()

  await pageB.getByRole('treeitem', { name: 'Heading: Build your next product' }).click()
  await pageB.getByLabel('Text').fill('Stale local heading')
  await expect(pageB.getByText('Conflict: local work is preserved')).toBeVisible()
  await expect(pageB.getByRole('heading', { name: 'Stale local heading' })).toBeVisible()
  await expect(pageB.getByRole('button', { name: 'Download recovery copy' })).toBeVisible()

  const outsider = await browser.newContext({ baseURL: 'http://localhost:3000' })
  const outsiderPage = await outsider.newPage()
  await signIn(outsiderPage, 'outsider')
  const read = await outsiderPage.request.get(`/api/v1/projects/${projectId}?workspaceId=${workspaceId}`)
  expect(read.status()).toBe(404)
  await expect(outsiderPage.goto(`/projects/${projectId}`)).resolves.toBeTruthy()
  await expect(outsiderPage.getByRole('heading', { name: 'Project not found' })).toBeVisible()
  await outsider.close()
})

test('dashboard and editor have no serious or critical axe violations', async ({ page }) => {
  await page.goto('/')
  const dashboard = await new AxeBuilder({ page }).analyze()
  expect(dashboard.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])

  const projectId = await createProject(page, 'Accessible project')
  await page.goto(`/projects/${projectId}`)
  const editor = await new AxeBuilder({ page }).analyze()
  expect(editor.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
})
