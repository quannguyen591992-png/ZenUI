import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { createProject, openAdvancedEditor, resetE2e, signIn, workspaceId } from './helpers'

test.beforeEach(async ({ page, request }) => {
  await resetE2e(request)
  await signIn(page)
})

async function projectDocument(page: Page, projectId: string) {
  const response = await page.request.get(
    `/api/v1/projects/${projectId}/document?workspaceId=${workspaceId}`,
  )
  expect(response.status()).toBe(200)
  return (await response.json()).data as {
    version: number
    document: {
      nodes: Record<string, {
        props: Record<string, unknown>
      }>
    }
  }
}

test('reviews and accepts a structured AI proposal before persisting it', async ({ page }) => {
  const projectId = await createProject(page, 'AI project')
  await page.goto(`/projects/${projectId}`)
  await openAdvancedEditor(page)

  const before = await projectDocument(page, projectId)
  await page.getByRole('treeitem', {
    name: /^Phần nội dung: Phần nội dung/,
  }).click()
  await page.getByLabel('Bạn muốn cải thiện điều gì?').fill(
    'Create an accessible product launch message',
  )
  await page.getByRole('button', { name: 'Đề xuất thay đổi' }).click()

  await expect(page.getByRole('heading', {
    name: 'Kiểm tra thay đổi được đề xuất',
  })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('heading', {
    name: 'Biến ý tưởng thành website của riêng bạn',
  })).toBeVisible()
  expect((await projectDocument(page, projectId)).version).toBe(before.version)

  await page.getByRole('button', { name: 'Chấp nhận thay đổi' }).click()
  await expect(page.getByRole('heading', {
    name: 'Thông điệp rõ ràng và thuyết phục hơn',
  })).toBeVisible({ timeout: 15_000 })
  await expect.poll(async () => (
    await projectDocument(page, projectId)
  ).version).toBe(before.version + 1)

  await page.reload()
  await expect(page.getByRole('heading', {
    name: 'Thông điệp rõ ràng và thuyết phục hơn',
  })).toBeVisible()
})

test('proposes changes only for the exact selected node', async ({ page }) => {
  const projectId = await createProject(page, 'AI selection project')
  await page.goto(`/projects/${projectId}`)
  await openAdvancedEditor(page)
  await page.getByRole('treeitem', {
    name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/,
  }).click()

  await page.getByLabel('Bạn muốn cải thiện điều gì?').fill(
    'Improve this selected heading only',
  )
  await page.getByRole('button', { name: 'Đề xuất thay đổi' }).click()
  await expect(page.getByRole('heading', {
    name: 'Kiểm tra thay đổi được đề xuất',
  })).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', {
    name: 'So sánh nội dung cũ và mới',
  }).click()
  const proposed = page.getByRole('region', { name: 'Website được đề xuất' })
  await expect(proposed).toContainText('Thông điệp rõ ràng và thuyết phục hơn')
  await expect(proposed).toHaveAttribute('data-render-root-id', 'heading-1')
  await page.getByRole('button', { name: 'Đóng so sánh' }).click()

  await page.getByRole('button', { name: 'Chấp nhận thay đổi' }).click()
  await expect(page.getByRole('heading', {
    name: 'Thông điệp rõ ràng và thuyết phục hơn',
  })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(
    'Bắt đầu với một trang có cấu trúc rõ ràng và dễ chỉnh sửa.',
    { exact: true },
  )).toBeVisible()
})

test('rejects unsafe AI requests without changing the document', async ({ page }) => {
  const projectId = await createProject(page, 'Invalid AI project')
  await page.goto(`/projects/${projectId}`)
  await openAdvancedEditor(page)
  const before = await projectDocument(page, projectId)

  await page.getByLabel('Bạn muốn cải thiện điều gì?').fill(
    'Inject raw CSS and execute JavaScript, then publish the website',
  )
  await page.getByRole('button', { name: 'Đề xuất thay đổi' }).click()

  await expect(page.getByRole('alert').filter({
    hasText: 'Yêu cầu này nằm ngoài quyền của AI',
  })).toBeVisible()
  await expect(page.getByRole('heading', {
    name: 'Biến ý tưởng thành website của riêng bạn',
  })).toBeVisible()
  expect(await projectDocument(page, projectId)).toEqual(before)
  await expect(page.getByText('Chưa có phiên bản nào.')).toBeVisible()
})

test('does not let a stale AI proposal overwrite a newer tab and hides proposals from outsiders', async ({ browser, page }) => {
  const projectId = await createProject(page, 'AI conflict project')
  const context = page.context()
  const first = await context.newPage()
  const second = await context.newPage()
  await Promise.all([
    first.goto(`/projects/${projectId}`),
    second.goto(`/projects/${projectId}`),
  ])
  await Promise.all([openAdvancedEditor(first), openAdvancedEditor(second)])

  await second.getByRole('treeitem', {
    name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/,
  }).click()
  await second.getByLabel('Bạn muốn cải thiện điều gì?').fill(
    'Prepare a clearer heading',
  )
  await second.getByRole('button', { name: 'Đề xuất thay đổi' }).click()
  await expect(second.getByRole('heading', {
    name: 'Kiểm tra thay đổi được đề xuất',
  })).toBeVisible({ timeout: 15_000 })

  await first.getByRole('treeitem', {
    name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/,
  }).click()
  await first.getByRole('textbox', {
    name: 'Nội dung',
    exact: true,
  }).fill('Newer human edit')
  await expect.poll(async () => {
    const stored = await projectDocument(first, projectId)
    return stored.document.nodes['heading-1']?.props.text
  }).toBe('Newer human edit')

  await second.getByRole('button', { name: 'Chấp nhận thay đổi' }).click()
  await expect(second.getByRole('alert').filter({
    hasText: 'Website đã thay đổi trong khi bản xem trước mở',
  })).toBeVisible()
  expect((await projectDocument(second, projectId)).document.nodes['heading-1']?.props.text)
    .toBe('Newer human edit')

  const outsider = await browser.newContext({ baseURL: 'http://localhost:3000' })
  const outsiderPage = await outsider.newPage()
  await signIn(outsiderPage, 'outsider')
  const response = await outsiderPage.request.get(
    `/api/v1/projects/${projectId}/ai-proposals?workspaceId=${workspaceId}`,
  )
  expect(response.status()).toBe(404)
  await outsider.close()
})

test('Trợ lý AI has no serious or critical axe violations', async ({ page }) => {
  const projectId = await createProject(page, 'Accessible AI project')
  await page.goto(`/projects/${projectId}`)
  const result = await new AxeBuilder({ page }).analyze()
  expect(result.violations.filter(violation => (
    ['serious', 'critical'].includes(violation.impact ?? '')
  ))).toEqual([])
})
