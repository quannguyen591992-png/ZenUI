import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { createProject, openAdvancedEditor, resetE2e, signIn, workspaceId } from './helpers'

test.beforeEach(async ({ page, request }) => {
  await resetE2e(request)
  await signIn(page)
})

test('creates an immutable public revision link and disables it', async ({ page, browser }) => {
  const projectId = await createProject(page, 'Public share')
  await page.goto(`/projects/${projectId}`)
  await openAdvancedEditor(page)
  await page.getByLabel('Tên phiên bản').fill('Public snapshot')
  await page.getByRole('button', { name: 'Tạo phiên bản' }).click()
  await expect(page.getByText('Public snapshot')).toBeVisible()

  await page.getByRole('button', { name: 'Chia sẻ' }).click()
  await page.getByRole('button', { name: 'Tạo liên kết chia sẻ' }).click()
  const publicLink = page.getByRole('link', { name: 'Mở Public snapshot' })
  await expect(publicLink).toBeVisible()
  const publicUrl = await publicLink.getAttribute('href')
  expect(publicUrl).toMatch(/^http:\/\/127\.0\.0\.1:3000\/s\/[A-Za-z0-9_-]{32}$/)

  const publicRequest = await page.request.get(publicUrl!)
  expect(publicRequest.status()).toBe(200)
  expect(publicRequest.headers()['set-cookie']).toBeUndefined()
  expect(publicRequest.headers()['x-robots-tag']).toBe('noindex, nofollow, noarchive')
  expect(publicRequest.headers()['content-security-policy']).toContain("script-src 'none'")
  const html = await publicRequest.text()
  expect(html).toContain('Biến ý tưởng thành website của riêng bạn')
  expect(html).not.toContain(projectId)
  expect(html).not.toContain(workspaceId)
  expect(html).not.toMatch(/<script|\son\w+=/i)

  const publicContext = await browser.newContext()
  const publicPage = await publicContext.newPage()
  await publicPage.goto(publicUrl!)
  await expect(publicPage.getByRole('heading', { name: 'Biến ý tưởng thành website của riêng bạn' })).toBeVisible()
  expect(await publicPage.evaluate(() => document.cookie)).toBe('')
  const accessibility = await new AxeBuilder({ page: publicPage }).analyze()
  expect(accessibility.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([])
  await publicContext.close()

  await page.getByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ }).click()
  await page.getByRole('textbox', { name: 'Nội dung', exact: true }).fill('Changed after sharing')
  await expect(page.locator('footer').getByText('Đã lưu')).toBeVisible()
  const unchanged = await page.request.get(publicUrl!)
  expect(await unchanged.text()).toContain('Biến ý tưởng thành website của riêng bạn')
  expect(await (await page.request.get(publicUrl!)).text()).not.toContain('Changed after sharing')

  await page.getByRole('button', { name: 'Tắt liên kết Public snapshot' }).click()
  await expect(page.getByText('Đã tắt', { exact: true })).toBeVisible()
  expect((await page.request.get(publicUrl!)).status()).toBe(404)
})

test('collects a managed Share lead and persists contacted status in the project Inbox', async ({ page, browser }) => {
  const projectId = await createProject(page, 'Customer Leads journey')
  await page.goto(`/projects/${projectId}`)
  await openAdvancedEditor(page)
  await page.getByRole('treeitem', {
    name: /^Khung chứa: Khung chứa/,
  }).click()
  await page.getByRole('tab', { name: 'Thành phần' }).click()
  await page.getByRole('button', {
    name: 'Thêm Biểu mẫu khách hàng',
  }).click()

  const builder = page.getByRole('region', {
    name: 'Trình tạo biểu mẫu khách hàng',
  })
  await builder.getByLabel('Tiêu đề biểu mẫu').fill(
    'Nhận tư vấn E2E',
  )
  await builder.getByLabel('Nhãn nút gửi').fill('Gửi yêu cầu E2E')
  await builder.getByRole('button', { name: 'Lưu biểu mẫu' }).click()
  await expect(page.locator('footer').getByText('Đã lưu')).toBeVisible()

  const revisions = page.getByRole('region', { name: 'Phiên bản' })
  await revisions.getByLabel('Tên phiên bản').fill(
    'Customer Leads snapshot',
  )
  await revisions.getByRole('button', { name: 'Tạo phiên bản' }).click()
  await expect(revisions.getByText('Customer Leads snapshot')).toBeVisible()

  await page.getByRole('button', { name: 'Chia sẻ' }).click()
  await page.getByRole('button', {
    name: 'Tạo liên kết chia sẻ',
  }).click()
  const publicLink = page.getByRole('link', {
    name: 'Mở Customer Leads snapshot',
  })
  const publicUrl = await publicLink.getAttribute('href')
  expect(publicUrl).toMatch(
    /^http:\/\/127\.0\.0\.1:3000\/s\/[A-Za-z0-9_-]{32}$/,
  )
  const managedLinks = await page.request.get(
    `/api/v1/projects/${projectId}/share-links?workspaceId=${workspaceId}`,
  )
  expect(managedLinks.status()).toBe(200)
  expect((await managedLinks.json()).data).toEqual([
    expect.objectContaining({ leadFormsLive: true }),
  ])

  const visitorContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const visitor = await visitorContext.newPage()
  await visitor.goto(publicUrl!)
  const liveForm = visitor.getByRole('form', {
    name: 'Nhận tư vấn E2E',
  })
  await expect(liveForm).toContainText(
    'Dữ liệu được ZenUI lưu tối đa 90 ngày',
  )
  const publicAccessibility = await new AxeBuilder({ page: visitor })
    .analyze()
  expect(publicAccessibility.violations.filter(
    item => ['serious', 'critical'].includes(item.impact ?? ''),
  )).toEqual([])
  await liveForm.getByLabel('Họ và tên').fill('Khách E2E')
  await liveForm.getByLabel('Email').fill('lead-e2e@example.test')
  await liveForm.getByRole('button', {
    name: 'Gửi yêu cầu E2E',
  }).click()
  await expect(visitor.getByRole('heading', {
    name: 'Đã nhận thông tin',
  })).toBeVisible()
  expect(visitor.url()).not.toContain('lead-e2e')
  expect(await visitor.content()).not.toContain('lead-e2e@example.test')
  await visitorContext.close()

  await page.bringToFront()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  const leadsTab = page.getByRole('tab', { name: /Khách hàng/ })
  await expect(leadsTab).toContainText('1')
  await leadsTab.click()
  const inboxAccessibility = await new AxeBuilder({ page }).analyze()
  expect(inboxAccessibility.violations.filter(
    item => ['serious', 'critical'].includes(item.impact ?? ''),
  )).toEqual([])
  await page.getByRole('button', { name: /Nhận tư vấn E2E/ }).click()
  await expect(page.getByText('lead-e2e@example.test')).toBeVisible()
  await page.getByRole('button', {
    name: 'Đánh dấu đã liên hệ',
  }).click()
  await expect(leadsTab).not.toContainText('1')

  await page.reload()
  await page.getByRole('tab', { name: /Khách hàng/ }).click()
  await page.getByRole('button', { name: /Nhận tư vấn E2E/ }).click()
  await expect(page.getByRole('button', {
    name: 'Đánh dấu đã liên hệ',
  })).toHaveCount(0)
  await expect(page.getByText('Đã liên hệ').first()).toBeVisible()

  const outsider = await browser.newPage()
  await signIn(outsider, 'outsider')
  const hidden = await outsider.request.get(
    `/api/v1/projects/${projectId}/leads?workspaceId=${workspaceId}`,
  )
  expect(hidden.status()).toBe(404)
  await outsider.close()
})

test('hides share management from outsiders and rejects forged origins', async ({ page }) => {
  const projectId = await createProject(page, 'Private share')
  const response = await page.request.post(`/api/v1/projects/${projectId}/share-links`, {
    headers: { origin: 'https://attacker.example' },
    data: {
      workspaceId,
      revisionId: '33333333-3333-4333-8333-333333333333',
      requestId: crypto.randomUUID(),
    },
  })
  expect(response.status()).toBe(403)

  const outsider = await page.context().browser()!.newPage()
  await signIn(outsider, 'outsider')
  const hidden = await outsider.request.get(`/api/v1/projects/${projectId}/share-links?workspaceId=${workspaceId}`)
  expect(hidden.status()).toBe(404)
  await outsider.close()

  const malformed = await page.request.get(`http://127.0.0.1:3000/s/not-a-valid-slug`)
  expect(malformed.status()).toBe(404)
  expect(await malformed.text()).toBe('Không tìm thấy')
})
