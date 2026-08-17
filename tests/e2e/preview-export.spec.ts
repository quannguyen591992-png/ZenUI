import { expect, test } from '@playwright/test'

import { createProject, openAdvancedEditor, resetE2e, signIn, workspaceId } from './helpers'

test.beforeEach(async ({ page, request }) => {
  await resetE2e(request)
  await signIn(page)
})

test('renders an isolated presentation preview without changing editor selection', async ({ page }) => {
  const projectId = await createProject(page, 'Secure preview')
  const previewRequests: { cookie?: string }[] = []
  page.on('request', request => {
    if (request.url().startsWith('http://127.0.0.1:3001')) previewRequests.push({ cookie: request.headers().cookie })
  })
  await page.goto(`/projects/${projectId}`)
  await openAdvancedEditor(page)
  await page.getByRole('button', { name: 'Mở xem trước' }).click()
  const frame = page.frameLocator('iframe[title="Bản xem trước trang an toàn"]')
  await expect(frame.getByRole('heading', { name: 'Biến ý tưởng thành website của riêng bạn' })).toBeVisible()
  await frame.getByRole('heading', { name: 'Biến ý tưởng thành website của riêng bạn' }).click()
  await expect(page.getByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ })).toHaveAttribute('aria-selected', 'false')

  const iframe = page.locator('iframe[title="Bản xem trước trang an toàn"]')
  await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin')
  expect(previewRequests.some(request => Boolean(request.cookie))).toBe(false)
  const previewResponse = await page.request.get('http://127.0.0.1:3001')
  expect(previewResponse.headers()['content-security-policy']).toContain("default-src 'none'")
  expect(previewResponse.headers()['set-cookie']).toBeUndefined()
})

test('creates and downloads one authenticated multi-route ZIP export', async ({ page }) => {
  const projectId = await createProject(page, 'Durable export')
  await page.goto(`/projects/${projectId}`)
  await openAdvancedEditor(page)
  await page.getByRole('button', { name: 'Xuất website' }).click()
  await expect(page.getByText('Tệp xuất đã sẵn sàng')).toBeVisible({ timeout: 15_000 })

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Tải website ZIP' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('zenui-export.zip')
  const path = await download.path()
  expect(path).not.toBeNull()
  const content = await import('node:fs/promises').then(fs => fs.readFile(path!))
  expect([...content.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
  expect(content.toString('utf8')).toContain('index.html')
  expect(content.toString('utf8')).toContain('Biến ý tưởng thành website của riêng bạn')
  expect(content.toString('utf8')).not.toMatch(/<script|\son\w+=/i)

  const downloadHref = await page.getByRole('link', { name: 'Tải website ZIP' }).getAttribute('href')
  const exportId = new URL(downloadHref!, 'http://localhost').pathname.split('/').at(-2)!
  const outsider = await page.context().browser()!.newPage()
  await signIn(outsider, 'outsider')
  const response = await outsider.request.get(`/api/v1/projects/${projectId}/exports/${exportId}?workspaceId=${workspaceId}`)
  expect(response.status()).toBe(404)
  await outsider.close()
})
