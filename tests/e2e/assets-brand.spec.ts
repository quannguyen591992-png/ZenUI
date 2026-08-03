import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { createProject, resetE2e, signIn, workspaceId } from './helpers'

test.beforeEach(async ({ page, request }) => {
  await resetE2e(request)
  await signIn(page)
})

test('uploads, crops and applies an owned image in Simple mode', async ({ page }) => {
  const projectId = await createProject(page, 'Asset journey')
  await page.goto(`/projects/${projectId}`)

  await expect(page.getByLabel('Tải ảnh của bạn')).toBeVisible()
  const assetSurfaceLayout = await page.locator('.asset-brand-panel').evaluate(element => {
    const container = element as HTMLElement
    const library = container.querySelector<HTMLElement>('.asset-library-panel')
    const brand = container.querySelector<HTMLElement>('.brand-kit-panel')
    if (!library || !brand) throw new Error('Missing asset or brand panel')
    const containerBounds = container.getBoundingClientRect()
    const libraryBounds = library.getBoundingClientRect()
    const brandBounds = brand.getBoundingClientRect()
    return {
      overflowY: getComputedStyle(container).overflowY,
      clientHeight: container.clientHeight,
      scrollHeight: container.scrollHeight,
      containerRight: containerBounds.right,
      libraryRight: libraryBounds.right,
      brandRight: brandBounds.right,
    }
  })
  expect(assetSurfaceLayout.overflowY).not.toBe('auto')
  expect(assetSurfaceLayout.overflowY).not.toBe('scroll')
  expect(assetSurfaceLayout.scrollHeight).toBeLessThanOrEqual(assetSurfaceLayout.clientHeight)
  expect(assetSurfaceLayout.libraryRight).toBeLessThanOrEqual(assetSurfaceLayout.containerRight)
  expect(assetSurfaceLayout.brandRight).toBeLessThanOrEqual(assetSurfaceLayout.containerRight)
  await page.getByLabel('Khung thiết kế').getByRole('button', { name: 'Thay ảnh' }).click()
  await expect(page.getByText('Đang thay ảnh')).toBeVisible()

  await page.getByLabel('Tải ảnh của bạn').setInputFiles({
    name: 'launch.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAQCAIAAAD4YuoOAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAJElEQVQ4jWNQTX5NU8QwakHyaBC9Hk1FqqMZ7fVoUaE6yEtTAC3I5h/nnPJWAAAAAElFTkSuQmCC', 'base64'),
  })
  const assetPanel = page.getByRole('region', { name: 'Thư viện ảnh' })
  await expect(assetPanel.getByRole('button', { name: /launch/ })).toBeVisible({ timeout: 15_000 })
  await assetPanel.evaluate(element => { element.scrollTop = element.scrollHeight })
  await page.getByRole('button', { name: 'Cắt ảnh vuông' }).click()
  await expect(assetPanel.getByRole('button', { name: /launch/ })).toHaveCount(2, { timeout: 15_000 })
  await page.getByLabel('Mô tả ảnh').fill('Bảng lập kế hoạch ra mắt')
  await page.getByRole('button', { name: 'Dùng ảnh đã chọn' }).click()
  await expect(page.getByRole('img', { name: 'Bảng lập kế hoạch ra mắt' })).toBeVisible()
  await expect.poll(async () => {
    const response = await page.request.get(`/api/v1/projects/${projectId}?workspaceId=${workspaceId}`)
    return (await response.json()).data.document.nodes['image-1'].props.alt as string
  }).toBe('Bảng lập kế hoạch ra mắt')

  const audit = await new AxeBuilder({ page }).include('.asset-brand-panel').analyze()
  expect(audit.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
})

test('imports a fixed-provider result and applies a versioned Brand Kit', async ({ page }) => {
  const projectId = await createProject(page, 'Brand journey')
  await page.goto(`/projects/${projectId}`)

  await page.getByLabel('Khung thiết kế').getByRole('button', { name: 'Thay ảnh' }).click()
  await expect(page.getByText('Đang thay ảnh')).toBeVisible()
  await page.getByLabel('Tìm ảnh').fill('launch')
  await page.getByRole('button', { name: 'Tìm' }).click()
  await expect(page.getByText('Bảng lập kế hoạch ra mắt', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Nhập ảnh Bảng lập kế hoạch ra mắt' }).click()
  const importedAsset = page.getByRole('list', { name: 'Ảnh của dự án' })
    .getByRole('button', { name: /Bảng lập kế hoạch ra mắt/ })
  await expect(importedAsset).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Dùng ảnh đã chọn' }).click()
  await expect.poll(async () => {
    const response = await page.request.get(`/api/v1/projects/${projectId}?workspaceId=${workspaceId}`)
    return (await response.json()).data.document.nodes['image-1'].props.alt as string
  }).toBe('Bảng lập kế hoạch ra mắt')

  await page.getByLabel('Tên thương hiệu').fill('NovaFlow')
  await page.getByLabel('Màu chính thương hiệu').fill('#1d4ed8')
  await page.getByRole('button', { name: 'Lưu Brand Kit' }).click()
  await expect(page.getByRole('button', { name: 'Áp dụng cho website' })).toBeEnabled()
  await page.getByRole('button', { name: 'Áp dụng cho website' }).click()
  await expect(page.locator('footer').getByText('Đã áp dụng Brand Kit cho website')).toBeVisible()

  const project = await page.request.get(`/api/v1/projects/${projectId}?workspaceId=${workspaceId}`)
  expect((await project.json()).data.document.theme.colors.primary).toBe('#1d4ed8')
})

test('rejects forged asset mutations and keeps the mobile surface accessible', async ({ page }) => {
  const projectId = await createProject(page, 'Asset security')
  const forged = await page.request.post(`/api/v1/projects/${projectId}/assets/imports`, {
    headers: { origin: 'https://evil.test' },
    data: { workspaceId, requestId: crypto.randomUUID(), resultId: '42', defaultAlt: 'Forged' },
  })
  expect(forged.status()).toBe(403)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/projects/${projectId}`)
  await expect(page.getByRole('heading', { name: 'Thư viện ảnh' })).toBeVisible()
  const audit = await new AxeBuilder({ page }).include('.asset-brand-panel').analyze()
  expect(audit.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
})
