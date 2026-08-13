import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { createProject, openAdvancedEditor, resetE2e, signIn, workspaceId } from './helpers'

test.beforeEach(async ({ page, request }) => {
  await resetE2e(request)
  await signIn(page)
})

test('creates a project, autosaves, reloads and restores an immutable revision', async ({ page }) => {
  const projectId = await createProject(page)
  await page.goto(`/projects/${projectId}`)
  const canvas = page.getByLabel('Khung thiết kế')
  await canvas.getByRole('heading', { name: 'Biến ý tưởng thành website của riêng bạn' }).click()
  await page.getByRole('region', { name: 'Chỉnh sửa trực tiếp' }).getByRole('textbox', { name: 'Nội dung', exact: true }).fill('Persisted heading')
  await expect(page.locator('footer').getByText('Đã lưu')).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Persisted heading' })).toBeVisible()
  const revisions = page.getByRole('region', { name: 'Phiên bản' })
  await revisions.getByLabel('Tên phiên bản').fill('Đã lưu baseline')
  await revisions.getByRole('button', { name: 'Tạo phiên bản' }).click()
  await expect(revisions.getByText('Đã lưu baseline')).toBeVisible({ timeout: 15_000 })

  await canvas.getByRole('heading', { name: 'Persisted heading' }).click()
  await page.getByRole('region', { name: 'Chỉnh sửa trực tiếp' }).getByRole('textbox', { name: 'Nội dung', exact: true }).fill('Changed after revision')
  await expect(page.locator('footer').getByText('Đã lưu')).toBeVisible()
  await expect.poll(async () => {
    const response = await page.request.get(`/api/v1/projects/${projectId}?workspaceId=${workspaceId}`)
    return (await response.json()).data.document.nodes['heading-1'].props.text as string
  }).toBe('Changed after revision')
  await page.getByRole('region', { name: 'Phiên bản' }).getByRole('button', { name: 'Khôi phục Đã lưu baseline' }).click()
  await expect(page.getByRole('heading', { name: 'Persisted heading' })).toBeVisible()
})

test('prevents tenant enumeration and preserves stale-tab local work', async ({ browser, page }) => {
  const projectId = await createProject(page, 'Concurrent project')
  const contextA = page.context()
  const pageA = await contextA.newPage()
  const pageB = await contextA.newPage()
  await Promise.all([pageA.goto(`/projects/${projectId}`), pageB.goto(`/projects/${projectId}`)])
  await Promise.all([openAdvancedEditor(pageA), openAdvancedEditor(pageB)])

  await pageA.getByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ }).click()
  await pageA.getByLabel('Tùy chỉnh màu chữ').fill('#112233')
  await expect.poll(async () => {
    const response = await pageA.request.get(
      `/api/v1/projects/${projectId}/document?workspaceId=${workspaceId}`,
    )
    return (await response.json()).data.document.nodes['heading-1'].style.color as string
  }).toBe('#112233')

  await pageB.getByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ }).click()
  await pageB.getByRole('textbox', { name: 'Nội dung', exact: true }).fill('Stale local heading')
  await expect(pageB.getByText('Có xung đột: thay đổi cục bộ vẫn được giữ')).toBeVisible()
  await expect(pageB.getByRole('heading', { name: 'Stale local heading' })).toBeVisible()
  await expect(pageB.getByRole('button', { name: 'Tải bản sao khôi phục' })).toBeVisible()

  const outsider = await browser.newContext({ baseURL: 'http://localhost:3000' })
  const outsiderPage = await outsider.newPage()
  await signIn(outsiderPage, 'outsider')
  const read = await outsiderPage.request.get(`/api/v1/projects/${projectId}?workspaceId=${workspaceId}`)
  expect(read.status()).toBe(404)
  await expect(outsiderPage.goto(`/projects/${projectId}`)).resolves.toBeTruthy()
  await expect(outsiderPage.getByRole('heading', { name: 'Không thể mở dự án' })).toBeVisible()
  await outsider.close()
})

test('dashboard and editor have no serious or critical axe violations', async ({ page }) => {
  await page.goto('/dashboard')
  const dashboard = await new AxeBuilder({ page }).analyze()
  expect(dashboard.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])

  const projectId = await createProject(page, 'Accessible project')
  await page.goto(`/projects/${projectId}`)
  const editor = await new AxeBuilder({ page }).analyze()
  expect(editor.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
})
