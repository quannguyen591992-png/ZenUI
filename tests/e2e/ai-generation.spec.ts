import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { createProject, openAdvancedEditor, resetE2e, signIn, workspaceId } from './helpers'

test.beforeEach(async ({ page, request }) => {
  await resetE2e(request)
  await signIn(page)
})

test('generates a canonical page, persists it and creates an AI revision', async ({ page }) => {
  const projectId = await createProject(page, 'AI project')
  await page.goto(`/projects/${projectId}`)
  await openAdvancedEditor(page)

  await page.getByLabel('Yêu cầu cho AI').fill('Create an accessible product launch page')
  await page.getByRole('button', { name: 'Chạy AI' }).click()
  await expect(page.getByRole('region', { name: 'Trợ lý AI' }).getByRole('status')).toContainText('AI đã hoàn tất', { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'AI generated landing page' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Phiên bản' }).getByText('AI generated landing page')).toBeVisible()

  const reloaded = await page.context().newPage()
  await reloaded.goto(`/projects/${projectId}`)
  await expect(reloaded.getByRole('heading', { name: 'AI generated landing page' })).toBeVisible()
  await reloaded.close()
})

test('edits only the selected node and restores the AI revision', async ({ page }) => {
  const projectId = await createProject(page, 'AI selection project')
  await page.goto(`/projects/${projectId}`)
  await openAdvancedEditor(page)
  await page.getByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ }).click()
  await page.getByLabel('Chế độ AI').selectOption('edit-selection')
  await page.getByLabel('Yêu cầu cho AI').fill('Improve this selected heading only')
  await page.getByRole('button', { name: 'Chạy AI' }).click()

  await expect(page.getByRole('heading', { name: 'AI selected heading' })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.node-visual').getByText('Bắt đầu với một trang có cấu trúc rõ ràng và dễ chỉnh sửa.', { exact: true })).toBeVisible()
  await expect(page.getByText('AI edited selected node')).toBeVisible()
})

test('repairs invalid model output then fails without changing the document', async ({ page }) => {
  const projectId = await createProject(page, 'Invalid AI project')
  await page.goto(`/projects/${projectId}`)
  await openAdvancedEditor(page)
  await page.getByLabel('Yêu cầu cho AI').fill('invalid model fixture')
  await page.getByRole('button', { name: 'Chạy AI' }).click()

  const assistant = page.getByRole('region', { name: 'Trợ lý AI' })
  await expect(assistant.getByRole('strong')).toHaveText('AI đã dừng an toàn', { timeout: 30_000 })
  await expect(assistant.getByText('Trang được tạo chưa đạt cấu trúc an toàn. Hãy thử mô tả ngắn gọn và tập trung hơn.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Biến ý tưởng thành website của riêng bạn' })).toBeVisible()
  await expect(page.getByText('Chưa có phiên bản nào.')).toBeVisible()
})

test('does not let stale AI overwrite a newer tab and hides runs from outsiders', async ({ browser, page }) => {
  const projectId = await createProject(page, 'AI conflict project')
  const context = page.context()
  const first = await context.newPage()
  const second = await context.newPage()
  await Promise.all([first.goto(`/projects/${projectId}`), second.goto(`/projects/${projectId}`)])
  await Promise.all([openAdvancedEditor(first), openAdvancedEditor(second)])

  await second.getByLabel('Yêu cầu cho AI').fill('Create a delayed stale generation')
  await second.getByRole('button', { name: 'Chạy AI' }).click()

  await first.getByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ }).click()
  await first.getByRole('textbox', { name: 'Nội dung', exact: true }).fill('Newer human edit')
  await expect(first.getByRole('heading', { name: 'Newer human edit' })).toBeVisible()
  await expect.poll(async () => {
    const response = await first.request.get(`/api/v1/projects/${projectId}?workspaceId=${workspaceId}`)
    if (!response.ok()) return ''
    const body = await response.json() as { data?: { document?: { nodes?: Record<string, { props?: { text?: string } }> } } }
    return body.data?.document?.nodes?.['heading-1']?.props?.text ?? ''
  }).toBe('Newer human edit')

  await expect(second.getByText('AI đã dừng an toàn')).toBeVisible({ timeout: 30_000 })
  await expect(second.getByText('Website đã thay đổi trong khi AI xử lý. Hãy tải phiên bản mới nhất rồi thử lại.')).toBeVisible()

  const outsider = await browser.newContext({ baseURL: 'http://localhost:3000' })
  const outsiderPage = await outsider.newPage()
  await signIn(outsiderPage, 'outsider')
  const response = await outsiderPage.request.get(
    `/api/v1/projects/${projectId}/generation-runs?workspaceId=${workspaceId}`,
  )
  expect(response.status()).toBe(404)
  await outsider.close()
})

test('Trợ lý AI has no serious or critical axe violations', async ({ page }) => {
  const projectId = await createProject(page, 'Accessible AI project')
  await page.goto(`/projects/${projectId}`)
  const result = await new AxeBuilder({ page }).analyze()
  expect(result.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
})
