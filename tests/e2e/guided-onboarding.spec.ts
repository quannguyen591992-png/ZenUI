import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { createOnboardingProject, resetE2e, signIn, workspaceId } from './helpers'

test.beforeEach(async ({ page, request }) => {
  await resetE2e(request)
  await signIn(page)
})

test('prepares exactly three directions with one provider call and accepts one into the editor', async ({ page }) => {
  const projectId = await createOnboardingProject(page, 'Guided production')
  await page.goto(`/projects/${projectId}`)

  await expect(page.getByRole('heading', { name: 'Hãy cho chúng tôi biết website bạn muốn tạo' })).toBeVisible({ timeout: 15_000 })
  await page.getByLabel('Mô tả doanh nghiệp hoặc ý tưởng').fill(
    'NovaFlow giúp nhóm sản phẩm nhỏ lên kế hoạch ra mắt. Mục tiêu là nhận lịch tư vấn. Hành động chính: Đặt lịch tư vấn.',
  )
  await page.getByRole('button', { name: 'Dùng mô tả của tôi' }).click()
  await expect(page.getByLabel('Bạn cung cấp sản phẩm hoặc dịch vụ gì?')).toHaveValue(
    'NovaFlow giúp nhóm sản phẩm nhỏ lên kế hoạch ra mắt',
  )
  await page.getByLabel('Website này dành cho ai?').fill('Nhóm sản phẩm nhỏ')
  await page.getByLabel('Website này cần đạt được điều gì?').fill('Nhận lịch tư vấn phù hợp')
  await page.getByLabel('Khách truy cập nên làm gì tiếp theo?').fill('Đặt lịch tư vấn')
  await page.getByLabel('Website nên mang lại cảm giác như thế nào?').fill('Rõ ràng và hiện đại')

  const before = await page.request.get(`/api/v1/projects/${projectId}?workspaceId=${workspaceId}`)
  expect((await before.json()).data).toMatchObject({ creationState: 'onboarding', version: 1 })

  await page.getByRole('button', { name: 'Tạo 3 hướng thiết kế' }).click()
  await expect(page.getByTestId('production-direction-card')).toHaveCount(3)
  await expect(page.getByRole('heading', { name: 'Đà tiến rõ ràng' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Người bạn đáng tin' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Khởi động nổi bật' })).toBeVisible()

  const directionCards = page.getByTestId('production-direction-card')
  const clearPreview = directionCards.nth(0).locator('.design-document-renderer')
  const trustedPreview = directionCards.nth(1).locator('.design-document-renderer')
  const boldPreview = directionCards.nth(2).locator('.design-document-renderer')
  await expect(clearPreview.locator('[data-node-type="heading"]').first()).toBeVisible()
  await expect(trustedPreview.locator('[data-node-type="heading"]').first()).toBeVisible()
  await expect(boldPreview.locator('[data-node-type="heading"]').first()).toBeVisible()
  const desktopThumbnailGeometry = await page.evaluate(() => (
    [...document.querySelectorAll<HTMLElement>('.guided-direction-preview')].map(preview => {
      const content = preview.querySelector<HTMLElement>('.design-document-renderer [data-node-type="heading"]')
      if (!content) throw new Error('Missing direction thumbnail heading')
      const previewRect = preview.getBoundingClientRect()
      const contentRect = content.getBoundingClientRect()
      return {
        intersects: contentRect.right > previewRect.left
          && contentRect.left < previewRect.right
          && contentRect.bottom > previewRect.top
          && contentRect.top < previewRect.bottom,
        startsInside: contentRect.left >= previewRect.left - 2
          && contentRect.left < previewRect.right,
      }
    })
  ))
  expect(desktopThumbnailGeometry).toHaveLength(3)
  expect(desktopThumbnailGeometry.every(item => item.intersects && item.startsInside)).toBe(true)

  await page.getByRole('button', { name: 'Điện thoại' }).click()
  await expect(clearPreview).toHaveAttribute('data-viewport', 'mobile')
  await expect(clearPreview.locator('[data-node-type="heading"]').first()).toBeVisible()
  const mobileThumbnailGeometry = await page.evaluate(() => {
    const preview = document.querySelector<HTMLElement>('.guided-direction-preview')
    const content = preview?.querySelector<HTMLElement>('.design-document-renderer [data-node-type="heading"]')
    if (!preview || !content) throw new Error('Missing mobile direction thumbnail')
    const previewRect = preview.getBoundingClientRect()
    const contentRect = content.getBoundingClientRect()
    return {
      intersects: contentRect.right > previewRect.left
        && contentRect.left < previewRect.right
        && contentRect.bottom > previewRect.top
        && contentRect.top < previewRect.bottom,
      startsInside: contentRect.left >= previewRect.left - 2
        && contentRect.left < previewRect.right,
    }
  })
  expect(mobileThumbnailGeometry.intersects && mobileThumbnailGeometry.startsInside).toBe(true)

  await page.getByRole('button', { name: 'Xem lớn hơn' }).first().click()
  await expect(page.getByRole('dialog', { name: /Bản xem trước lớn của Đà tiến rõ ràng/ })).toBeVisible()
  await page.getByRole('button', { name: 'Đóng' }).click()

  const prepared = await page.request.get(`/api/v1/projects/${projectId}?workspaceId=${workspaceId}`)
  expect((await prepared.json()).data).toMatchObject({ creationState: 'onboarding', version: 1 })
  const revisionsBeforeChoose = await page.request.get(`/api/v1/projects/${projectId}/revisions?workspaceId=${workspaceId}`)
  expect((await revisionsBeforeChoose.json()).data).toEqual([])
  const counters = await page.request.get('/api/e2e/runtime-counters')
  expect((await counters.json()).data).toEqual({ directionProviderCalls: 1 })

  const chooseResponse = page.waitForResponse(response => response.url().endsWith('/choose'))
  await page.getByRole('button', { name: 'Chọn hướng này' }).nth(1).click()
  expect((await chooseResponse).status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Câu chuyện trang' })).toBeVisible({ timeout: 15_000 })

  const accepted = await page.request.get(`/api/v1/projects/${projectId}?workspaceId=${workspaceId}`)
  expect((await accepted.json()).data).toMatchObject({ creationState: 'accepted', version: 2 })
  const revisionsAfterChoose = await page.request.get(`/api/v1/projects/${projectId}/revisions?workspaceId=${workspaceId}`)
  expect((await revisionsAfterChoose.json()).data).toHaveLength(1)

  await expect(page.getByRole('heading', { name: 'Hiểu website của bạn' })).toBeVisible()
  await page.getByRole('button', { name: 'Kiểm tra website' }).click()
  await expect(page.getByRole('heading', { name: 'Đánh giá website' })).toBeVisible()
  await expect(page.getByText('Nhận lịch tư vấn phù hợp', { exact: false }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Giải thích thiết kế này' }).click()
  await expect(page.getByRole('heading', { name: 'Vì sao thiết kế này hỗ trợ bản mô tả?' })).toBeVisible()
  await page.getByRole('button', { name: 'Bỏ qua mục này' }).first().click()
  await page.getByRole('button', { name: 'Hiện mục đã bỏ qua' }).click()
  await expect(page.getByRole('button', { name: 'Khôi phục mục này' }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Khôi phục mục này' }).first().click()

  const intelligenceAudit = await new AxeBuilder({ page }).include('.site-intelligence').analyze()
  expect(intelligenceAudit.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])

  await page.getByRole('button', { name: 'Thử bố cục khác' }).click()
  await expect(page.locator('header').getByText('Đã lưu')).toBeVisible()

  await page.getByRole('button', { name: 'Xem trước' }).click()
  const preview = page.frameLocator('iframe[title="Bản xem trước trang an toàn"]')
  await expect(preview.getByRole('heading', { name: 'Biến novaflow giúp nhóm sản phẩm nhỏ lên kế hoạch ra mắt thành kết quả rõ ràng' })).toBeVisible()
  await page.getByRole('button', { name: 'Đóng xem trước' }).click()

  await page.getByRole('button', { name: 'Chia sẻ', exact: true }).click()
  expect(page.getByLabel('Chia sẻ website').getByLabel('Phiên bản để chia sẻ')).toHaveCount(0)
  await page.getByRole('button', { name: 'Tạo liên kết chia sẻ' }).click()
  const shared = page.getByRole('link', { name: 'Mở website được chia sẻ' })
  await expect(shared).toBeVisible()
  const sharedUrl = await shared.getAttribute('href')
  expect(sharedUrl).toBeTruthy()
  const sharedHtml = await (await page.request.get(sharedUrl!)).text()
  expect(sharedHtml).toContain('Biến novaflow giúp nhóm sản phẩm nhỏ lên kế hoạch ra mắt thành kết quả rõ ràng')
  await page.getByRole('button', { name: 'Chia sẻ', exact: true }).click()

  await page.getByRole('button', { name: 'Xuất bản' }).click()
  await expect(page.getByRole('heading', { name: 'Xuất bản website' })).toBeVisible()
  const publishDialog = page.getByRole('dialog', { name: 'Xuất bản website' })
  await expect(publishDialog.getByText('Guided production')).toBeVisible()
  await expect(publishDialog.getByText('Đặt lịch tư vấn', { exact: true })).toBeVisible()
  expect(publishDialog.getByLabel('Môi trường triển khai')).toHaveCount(0)
  await page.getByRole('button', { name: 'Kết nối dịch vụ xuất bản' }).click()
  await expect(page.getByText('Dịch vụ xuất bản đã sẵn sàng')).toBeVisible({ timeout: 10_000 })
  await page.getByRole('checkbox', { name: 'Tôi hiểu website này sẽ trở thành công khai' }).check()
  await page.getByRole('button', { name: 'Xuất bản website' }).click()
  await expect(page.getByText('Website của bạn đã được xuất bản')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('link', { name: 'Mở website' })).toHaveAttribute('href', /^https:\/\/zenui-[a-z0-9]+\.vercel\.app$/)

  const releaseAudit = await new AxeBuilder({ page }).include('.editor-toolbar').analyze()
  expect(releaseAudit.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
})

test('keeps Simple Preview, Share and Publish accessible at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const projectId = await createOnboardingProject(page, 'Guided mobile publish')
  await page.goto(`/projects/${projectId}`)
  await page.getByLabel('Bạn cung cấp sản phẩm hoặc dịch vụ gì?').fill('NovaFlow lập kế hoạch ra mắt')
  await page.getByLabel('Website này dành cho ai?').fill('Nhóm sản phẩm nhỏ')
  await page.getByLabel('Website này cần đạt được điều gì?').fill('Nhận lịch tư vấn')
  await page.getByLabel('Khách truy cập nên làm gì tiếp theo?').fill('Đặt lịch tư vấn')
  await page.getByLabel('Website nên mang lại cảm giác như thế nào?').fill('Rõ ràng và hiện đại')
  await page.getByRole('button', { name: 'Tạo 3 hướng thiết kế' }).click()
  await expect(page.getByTestId('production-direction-card')).toHaveCount(3)
  await page.getByRole('button', { name: 'Chọn hướng này' }).first().click()
  await expect(page.getByRole('button', { name: 'Câu chuyện' })).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Chia sẻ', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Chia sẻ website' })).toBeVisible()
  const shareAudit = await new AxeBuilder({ page }).include('.share-popover').analyze()
  expect(shareAudit.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
  await page.getByRole('button', { name: 'Chia sẻ', exact: true }).click()

  await page.getByRole('button', { name: 'Xuất bản' }).click()
  const publishDialog = page.getByRole('dialog', { name: 'Xuất bản website' })
  await expect(publishDialog).toBeVisible()
  await expect(publishDialog).toBeInViewport()
  const publishAudit = await new AxeBuilder({ page }).include('.publish-popover').analyze()
  expect(publishAudit.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
})

test('keeps the production Guided Brief and gallery accessible at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const projectId = await createOnboardingProject(page, 'Guided mobile')
  await page.goto(`/projects/${projectId}`)

  const briefAudit = await new AxeBuilder({ page }).analyze()
  expect(briefAudit.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])

  await page.getByLabel('Bạn cung cấp sản phẩm hoặc dịch vụ gì?').fill('NovaFlow lập kế hoạch ra mắt')
  await page.getByLabel('Website này dành cho ai?').fill('Nhóm sản phẩm nhỏ')
  await page.getByLabel('Website này cần đạt được điều gì?').fill('Nhận lịch tư vấn')
  await page.getByLabel('Khách truy cập nên làm gì tiếp theo?').fill('Đặt lịch tư vấn')
  await page.getByLabel('Website nên mang lại cảm giác như thế nào?').fill('Rõ ràng và hiện đại')
  await page.getByRole('button', { name: 'Tạo 3 hướng thiết kế' }).click()
  await expect(page.getByTestId('production-direction-card')).toHaveCount(3)

  const firstCard = page.getByTestId('production-direction-card').first()
  await expect(firstCard).toBeInViewport()
  const galleryAudit = await new AxeBuilder({ page }).analyze()
  expect(galleryAudit.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
})
