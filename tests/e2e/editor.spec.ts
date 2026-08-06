import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { createProject, openAdvancedEditor, resetE2e, signIn, workspaceId } from './helpers'

import type { Page } from '@playwright/test'

test.beforeEach(async ({ page, request }) => {
  await resetE2e(request)
  await signIn(page)
})

async function projectDocument(page: Page, projectId: string) {
  const response = await page.request.get(`/api/v1/projects/${projectId}/document?workspaceId=${workspaceId}`)
  expect(response.status()).toBe(200)
  return (await response.json()).data as { version: number; document: {
    schemaVersion: number
    pages: { id: string; name: string; slug: string; rootNodeId: string }[]
    navigation: { items: { pageId: string; label: string }[] }
  } }
}

test('builds, edits, reorders, restores and exports a standalone design', async ({ page }) => {
  const projectId = await createProject(page, 'Editor flow')
  await page.goto(`/projects/${projectId}`)
  await openAdvancedEditor(page)
  await page.getByRole('treeitem', { name: /^Khung chứa: Khung chứa/ }).click()
  await page.getByRole('tab', { name: 'Thành phần' }).click()
  await page.getByRole('button', { name: 'Thêm Tiêu đề' }).click()
  const text = page.getByRole('textbox', { name: 'Nội dung', exact: true })
  await text.fill('Phase 2 heading')
  await page.getByLabel('Màu chữ', { exact: true }).fill('#112233')
  await expect(page.getByRole('heading', { name: 'Phase 2 heading' })).toHaveCSS('color', 'rgb(17, 34, 51)')
  await expect(page.locator('footer').getByText('Đã lưu')).toBeVisible()

  await page.getByRole('button', { name: 'Di chuyển Phase 2 heading lên' }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Hoàn tác' }).click()
  await page.getByRole('button', { name: 'Làm lại' }).click()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Phase 2 heading' })).toBeVisible()
  await openAdvancedEditor(page)

  await page.getByRole('button', { name: 'Xuất website' }).click()
  await expect(page.getByText('Tệp xuất đã sẵn sàng')).toBeVisible({ timeout: 15_000 })
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Tải website ZIP' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('zenui-export.zip')
  expect(await download.path()).not.toBeNull()
})

test('creates pages, edits navigation and switches active routes in Simple mode', async ({ page }) => {
  const projectId = await createProject(page, 'Multi-page flow')
  await page.goto(`/projects/${projectId}`)

  await page.getByLabel('Tên trang mới').fill('About')
  await page.getByLabel('Đường dẫn trang mới').fill('About Us')
  await page.getByRole('button', { name: 'Thêm trang' }).click()
  await expect(page.getByRole('button', { name: /About \/about-us/ })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('footer').getByText('Đã lưu')).toBeVisible()

  await page.getByRole('button', { name: /Trang chủ \// }).click()
  await expect(page.getByRole('heading', { name: 'Biến ý tưởng thành website của riêng bạn' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'About' }).check()
  await page.getByLabel('Nhãn điều hướng About').fill('Về chúng tôi')
  await page.getByRole('button', { name: 'Lưu nhãn About' }).click()
  await expect(page.locator('footer').getByText('Đã lưu')).toBeVisible()

  await page.reload()
  await expect(page.getByRole('button', { name: /About \/about-us/ })).toBeVisible()
  const stored = await projectDocument(page, projectId)
  expect(stored.document.schemaVersion).toBe(2)
  expect(stored.document.pages).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'Trang chủ', slug: '/' }),
    expect.objectContaining({ name: 'About', slug: '/about-us' }),
  ]))
  expect(stored.document.navigation.items).toEqual(expect.arrayContaining([
    expect.objectContaining({ pageId: expect.any(String), label: 'Về chúng tôi' }),
  ]))

  const desktopLayout = await page.evaluate(() => {
    const bounds = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector)
      if (!element) throw new Error(`Missing layout element: ${selector}`)
      const rectangle = element.getBoundingClientRect()
      return { top: rectangle.top, right: rectangle.right, bottom: rectangle.bottom, left: rectangle.left }
    }
    const manager = document.querySelector<HTMLElement>('.page-manager-panel')
    if (!manager) throw new Error('Missing Page Manager')
    return {
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      shell: bounds('.editor-shell'),
      manager: bounds('.page-manager-panel'),
      managerClientHeight: manager.clientHeight,
      managerScrollHeight: manager.scrollHeight,
      managerOverflowY: getComputedStyle(manager).overflowY,
      story: bounds('.page-story'),
      canvas: bounds('.canvas-panel'),
      guide: bounds('.section-guide'),
      assets: bounds('.asset-brand-panel'),
    }
  })
  expect(desktopLayout.documentWidth).toBeLessThanOrEqual(desktopLayout.viewportWidth)
  expect(desktopLayout.managerScrollHeight).toBeLessThanOrEqual(desktopLayout.managerClientHeight)
  expect(desktopLayout.managerOverflowY).not.toBe('scroll')
  expect(desktopLayout.managerOverflowY).not.toBe('auto')
  expect(desktopLayout.manager.right).toBeLessThanOrEqual(desktopLayout.shell.right)
  expect(desktopLayout.assets.right).toBeLessThanOrEqual(desktopLayout.shell.right)
  expect(desktopLayout.story.top).toBe(desktopLayout.canvas.top)
  expect(desktopLayout.guide.top).toBe(desktopLayout.canvas.top)
  expect(desktopLayout.assets.top).toBeGreaterThanOrEqual(Math.max(
    desktopLayout.story.bottom,
    desktopLayout.canvas.bottom,
    desktopLayout.guide.bottom,
  ))

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('complementary', { name: 'Quản lý trang' })).toBeVisible()
  const narrowLayout = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    shellWidth: document.querySelector<HTMLElement>('.editor-shell')?.scrollWidth ?? 0,
  }))
  expect(narrowLayout.documentWidth).toBeLessThanOrEqual(narrowLayout.viewportWidth)
  expect(narrowLayout.shellWidth).toBeLessThanOrEqual(narrowLayout.viewportWidth)
  const accessibility = await new AxeBuilder({ page }).include('.page-manager-panel').analyze()
  expect(accessibility.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([])
})

test('keeps the Share popover above the editor canvas', async ({ page }) => {
  const projectId = await createProject(page, 'Share overlay stacking')
  await page.goto(`/projects/${projectId}`)

  await page.getByRole('button', { name: 'Chia sẻ', exact: true }).click()
  const shareDialog = page.getByRole('dialog', { name: 'Chia sẻ website' })
  await expect(shareDialog).toBeVisible()

  const stacking = await shareDialog.evaluate(dialog => {
    const canvas = document.querySelector<HTMLElement>('.canvas-viewport > .canvas-node')
    if (!canvas) throw new Error('Missing editor canvas surface')
    const dialogBounds = dialog.getBoundingClientRect()
    const canvasBounds = canvas.getBoundingClientRect()
    const overlap = {
      left: Math.max(dialogBounds.left, canvasBounds.left),
      top: Math.max(dialogBounds.top, canvasBounds.top),
      right: Math.min(dialogBounds.right, canvasBounds.right),
      bottom: Math.min(dialogBounds.bottom, canvasBounds.bottom),
    }
    if (overlap.right <= overlap.left || overlap.bottom <= overlap.top) {
      throw new Error('Share popover must overlap the canvas to verify stacking')
    }
    const target = document.elementFromPoint(
      overlap.left + (overlap.right - overlap.left) / 2,
      overlap.top + Math.min(24, (overlap.bottom - overlap.top) / 2),
    )
    return {
      topElementBelongsToShareDialog: target !== null && dialog.contains(target),
    }
  })

  expect(stacking.topElementBelongsToShareDialog).toBe(true)
})

test('edits top-level sections in Simple mode and preserves the Advanced editor', async ({ page }) => {
  const projectId = await createProject(page, 'Section-first flow')
  await page.goto(`/projects/${projectId}`)

  await expect(page.getByRole('heading', { name: 'Câu chuyện trang' })).toBeVisible()
  const section = page.getByRole('button', { name: /Chọn Nội dung — Giải thích giá trị/ })
  await section.click()

  const selectedSection = page.locator('[data-node-id="section-1"]')
  const selectedToolbar = selectedSection.locator(':scope > .node-actions')
  await expect(selectedToolbar).toBeVisible()
  await expect(selectedToolbar.getByRole('button')).toHaveCount(6)
  expect(await selectedToolbar.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')))).toEqual([
    'Chọn Nội dung',
    'Kéo Nội dung',
    'Di chuyển Nội dung lên',
    'Di chuyển Nội dung xuống',
    'Nhân bản Nội dung',
    'Xóa Nội dung',
  ])
  await expect(selectedToolbar.getByRole('button', { name: 'Kéo Nội dung' })).toBeVisible()
  await expect(selectedToolbar.getByRole('button', { name: 'Xóa Nội dung' })).toBeVisible()
  await expect(selectedToolbar.getByText('Nội dung', { exact: true })).toHaveCount(1)
  await expect(selectedToolbar.getByRole('button', { name: 'Viết lại' })).toHaveCount(0)
  await expect(selectedToolbar.getByRole('button', { name: 'Thử bố cục khác' })).toHaveCount(0)
  await expect(selectedToolbar.getByRole('button', { name: 'Ẩn section' })).toHaveCount(0)
  await expect(page.locator('.section-actions')).toHaveCount(0)
  const attachment = await selectedSection.evaluate(element => {
    const toolbar = element.querySelector<HTMLElement>(':scope > .node-actions')
    if (!toolbar) throw new Error('Missing selected section toolbar')
    const visual = element.querySelector<HTMLElement>(':scope > .node-visual')
    if (!visual) throw new Error('Missing selected section content')
    const sectionBounds = element.getBoundingClientRect()
    const toolbarBounds = toolbar.getBoundingClientRect()
    const visualBounds = visual.getBoundingClientRect()
    return {
      distance: Math.abs(sectionBounds.top - toolbarBounds.top),
      overlapsContent: toolbarBounds.bottom > visualBounds.top,
      toolbarRight: toolbarBounds.right,
      viewportRight: document.documentElement.clientWidth,
    }
  })
  expect(attachment.distance).toBeLessThanOrEqual(4)
  expect(attachment.overlapsContent).toBe(false)
  expect(attachment.toolbarRight).toBeLessThanOrEqual(attachment.viewportRight)

  await selectedToolbar.getByRole('button', { name: 'Nhân bản Nội dung' }).click()
  await expect(page.getByRole('button', { name: 'Hoàn tác' })).toBeEnabled()
  await expect(page.locator('footer').getByText('Đã lưu')).toBeVisible()

  await page.getByRole('button', { name: 'Xóa Nội dung' }).click()
  await expect(page.getByRole('dialog', { name: 'Xóa section?' })).toBeVisible()
  await page.getByRole('button', { name: 'Xác nhận xóa section' }).click()
  await expect(page.getByRole('button', { name: /Chọn Nội dung — Giải thích giá trị/ })).toHaveCount(1)
  await expect(page.locator('footer').getByText('Đã lưu')).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Câu chuyện trang' })).toBeVisible()
  await openAdvancedEditor(page)
  await expect(page.getByRole('tree', { name: 'Lớp' })).toBeVisible()
  await page.getByRole('button', { name: 'Quay lại thiết kế trực quan' }).click()
  await expect(page.getByRole('heading', { name: 'Câu chuyện trang' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  const mobileToolbar = page.locator('.node-actions.has-selection-actions:visible')
  await expect(mobileToolbar).toHaveCount(1)
  const mobileLayout = await mobileToolbar.evaluate(toolbar => ({
    toolbarRight: toolbar.getBoundingClientRect().right,
    viewportRight: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
  }))
  expect(mobileLayout.toolbarRight).toBeLessThanOrEqual(mobileLayout.viewportRight)
  expect(mobileLayout.documentWidth).toBeLessThanOrEqual(mobileLayout.viewportRight)
  const storyButton = page.getByRole('button', { name: 'Câu chuyện' })
  await storyButton.click()
  await expect(page.getByRole('dialog', { name: 'Câu chuyện trang' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Đóng bảng' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(storyButton).toBeFocused()
})

test('reviews, discards and accepts contextual AI proposals without silent mutation', async ({ page }) => {
  const projectId = await createProject(page, 'Contextual AI proposal')
  await page.goto(`/projects/${projectId}`)

  const before = await page.request.get(`/api/v1/projects/${projectId}?workspaceId=${workspaceId}`)
  const beforeData = (await before.json()).data as { version: number; document: unknown }
  await page.getByRole('button', { name: /Chọn Nội dung — Giải thích giá trị/ }).click()
  await page.getByLabel('Bạn muốn cải thiện điều gì?').fill('Ngắn gọn hơn')
  const proposalRequest = page.waitForRequest(request => (
    request.method() === 'POST' && request.url().endsWith(`/projects/${projectId}/ai-proposals`)
  ))
  await page.getByRole('button', { name: 'Đề xuất thay đổi' }).click()
  expect((await proposalRequest).postDataJSON()).toMatchObject({
    prompt: 'Ngắn gọn hơn',
    selectedNodeId: 'section-1',
  })
  await expect(page.getByRole('heading', { name: 'Kiểm tra thay đổi được đề xuất' })).toBeVisible({ timeout: 15_000 })
  const compareButton = page.getByRole('button', { name: 'So sánh nội dung cũ và mới' })
  await expect(page.getByRole('list', { name: 'Tóm tắt thay đổi' })).toContainText('Thông điệp rõ ràng và thuyết phục hơn')
  await compareButton.click()
  await expect(page.getByRole('dialog', { name: 'So sánh nội dung cũ và mới' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Xem đề xuất' })).toHaveAttribute('aria-selected', 'true')
  const proposedPreview = page.getByRole('region', { name: 'Website được đề xuất' })
  await expect(proposedPreview).toContainText('Thông điệp rõ ràng và thuyết phục hơn')
  await expect(proposedPreview).toHaveAttribute('data-render-root-id', 'section-1')
  const changeDetails = page.getByRole('list', { name: 'Chi tiết thay đổi' })
  await expect(changeDetails).toContainText('Biến ý tưởng thành website của riêng bạn')
  await expect(changeDetails).toContainText('Thông điệp rõ ràng và thuyết phục hơn')
  await page.getByRole('tab', { name: 'Xem hiện tại' }).click()
  await expect(page.getByRole('region', { name: 'Website hiện tại' })).toContainText('Biến ý tưởng thành website của riêng bạn')
  await page.getByRole('button', { name: 'Đóng so sánh' }).click()
  await expect(page.getByRole('dialog', { name: 'So sánh nội dung cũ và mới' })).not.toBeVisible()
  await expect(compareButton).toBeFocused()

  const during = await page.request.get(`/api/v1/projects/${projectId}?workspaceId=${workspaceId}`)
  expect((await during.json()).data).toMatchObject({ version: beforeData.version, document: beforeData.document })
  await page.getByRole('button', { name: 'Bỏ đề xuất' }).click()
  await expect(page.getByRole('button', { name: 'Đề xuất thay đổi' })).toBeVisible()

  await page.getByLabel('Bạn muốn cải thiện điều gì?').fill('Viết lại phần này ngắn gọn hơn')
  await page.getByRole('button', { name: 'Đề xuất thay đổi' }).click()
  await expect(page.getByRole('heading', { name: 'Kiểm tra thay đổi được đề xuất' })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Chấp nhận thay đổi' }).click()
  await expect(page.getByLabel('Khung thiết kế').getByRole('heading', { name: 'Thông điệp rõ ràng và thuyết phục hơn' })).toBeVisible({ timeout: 15_000 })

  await expect.poll(async () => {
    const accepted = await page.request.get(`/api/v1/projects/${projectId}?workspaceId=${workspaceId}`)
    return (await accepted.json()).data.version as number
  }).toBe(beforeData.version + 1)
})

test('selects and edits directly on the Simple Canvas without relying on AI', async ({ page }) => {
  const projectId = await createProject(page, 'Simple direct editing')
  await page.goto(`/projects/${projectId}`)

  const canvas = page.getByLabel('Khung thiết kế')
  await canvas.getByRole('heading', { name: 'Biến ý tưởng thành website của riêng bạn' }).click()
  const selectedHeading = canvas.locator('[data-node-id="heading-1"]')
  const headingToolbar = selectedHeading.locator(':scope > .node-actions')
  await expect(headingToolbar).toBeVisible()
  expect(await headingToolbar.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')))).toEqual([
    'Chọn Biến ý tưởng thành website của riêng bạn',
    'Kéo Biến ý tưởng thành website của riêng bạn',
    'Di chuyển Biến ý tưởng thành website của riêng bạn lên',
    'Di chuyển Biến ý tưởng thành website của riêng bạn xuống',
    'Nhân bản Biến ý tưởng thành website của riêng bạn',
    'Xóa Biến ý tưởng thành website của riêng bạn',
  ])
  const manualEditor = page.getByRole('region', { name: 'Chỉnh sửa trực tiếp' })
  const contentInput = manualEditor.getByRole('textbox', { name: 'Nội dung' })
  await expect(contentInput).toHaveValue('Biến ý tưởng thành website của riêng bạn')
  await expect(page.getByRole('button', { name: 'Hoàn tác' })).toBeDisabled()

  await page.waitForTimeout(150)
  const before = await projectDocument(page, projectId)
  expect(JSON.stringify(before.document)).toContain('Biến ý tưởng thành website của riêng bạn')

  await contentInput.fill('Sửa tay trong chế độ đơn giản')
  await expect(canvas.getByRole('heading', { name: 'Sửa tay trong chế độ đơn giản' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Hoàn tác' })).toBeEnabled()
  await expect(page.locator('footer').getByText('Đã lưu')).toBeVisible()
  await expect.poll(async () => JSON.stringify((await projectDocument(page, projectId)).document)).toContain('Sửa tay trong chế độ đơn giản')

  await page.reload()
  await expect(canvas.getByRole('heading', { name: 'Sửa tay trong chế độ đơn giản' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Câu chuyện trang' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await canvas.getByRole('heading', { name: 'Sửa tay trong chế độ đơn giản' }).click()
  await page.getByRole('button', { name: 'Chỉnh sửa' }).click()
  const editDialog = page.getByRole('dialog', { name: 'Chỉnh sửa trực tiếp' })
  await expect(editDialog.getByRole('textbox', { name: 'Nội dung' })).toHaveValue('Sửa tay trong chế độ đơn giản')
  const accessibility = await new AxeBuilder({ page }).include('.section-sheet').analyze()
  expect(accessibility.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([])
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Chỉnh sửa' })).toBeFocused()
})

test('selects and edits directly on the Advanced Canvas with a readable Layers panel', async ({ page }) => {
  const projectId = await createProject(page, 'Direct Canvas editing')
  await page.goto(`/projects/${projectId}`)
  await openAdvancedEditor(page)

  const canvas = page.getByLabel('Khung thiết kế')
  await canvas.getByRole('heading', { name: 'Biến ý tưởng thành website của riêng bạn' }).click()
  const headingLayer = page.getByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ })
  await expect(headingLayer).toHaveAttribute('aria-selected', 'true')
  const contentInput = page.getByRole('textbox', { name: 'Nội dung', exact: true })
  await expect(contentInput).toHaveValue('Biến ý tưởng thành website của riêng bạn')
  await expect(page.getByRole('button', { name: 'Hoàn tác' })).toBeDisabled()

  const selectedHeading = canvas.locator('[data-node-id="heading-1"]')
  const advancedToolbar = selectedHeading.locator(':scope > .node-actions')
  await expect(advancedToolbar).toBeVisible()
  expect(await advancedToolbar.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')))).toEqual([
    'Chọn Biến ý tưởng thành website của riêng bạn',
    'Kéo Biến ý tưởng thành website của riêng bạn',
    'Di chuyển Biến ý tưởng thành website của riêng bạn lên',
    'Di chuyển Biến ý tưởng thành website của riêng bạn xuống',
    'Nhân bản Biến ý tưởng thành website của riêng bạn',
    'Xóa Biến ý tưởng thành website của riêng bạn',
  ])
  const advancedAttachment = await selectedHeading.evaluate(element => {
    const toolbar = element.querySelector<HTMLElement>(':scope > .node-actions')
    const visual = element.querySelector<HTMLElement>(':scope > .node-visual')
    if (!toolbar || !visual) throw new Error('Missing Advanced selection toolbar')
    return {
      overlapsContent: toolbar.getBoundingClientRect().bottom > visual.getBoundingClientRect().top,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }
  })
  expect(advancedAttachment.overlapsContent).toBe(false)
  expect(advancedAttachment.documentWidth).toBeLessThanOrEqual(advancedAttachment.viewportWidth)

  await advancedToolbar.getByRole('button', { name: 'Nhân bản Biến ý tưởng thành website của riêng bạn' }).click()
  await expect(page.getByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ })).toHaveCount(2)
  await expect(page.locator('footer').getByText('Đã lưu')).toBeVisible()
  await page.getByRole('button', { name: 'Xóa Biến ý tưởng thành website của riêng bạn' }).click()
  await expect(page.getByRole('dialog', { name: 'Xóa thành phần?' })).toBeVisible()
  await page.getByRole('button', { name: 'Xác nhận xóa thành phần' }).click()
  await expect(page.getByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ })).toHaveCount(1)
  await expect(page.locator('footer').getByText('Đã lưu')).toBeVisible()
  await page.getByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ }).click()

  const layerLayout = await page.evaluate(() => {
    const sidebar = document.querySelector<HTMLElement>('.advanced-sidebar')
    const panel = document.querySelector<HTMLElement>('.layers-panel')
    const rows = [...document.querySelectorAll<HTMLElement>('.layers-tree [role="treeitem"]')]
    if (!sidebar || !panel || rows.length === 0) throw new Error('Missing Advanced Layers panel')
    return {
      sidebarClientWidth: sidebar.clientWidth,
      sidebarScrollWidth: sidebar.scrollWidth,
      panelClientWidth: panel.clientWidth,
      panelScrollWidth: panel.scrollWidth,
      rowsFit: rows.every(row => row.scrollWidth <= row.clientWidth),
      minimumRowHeight: Math.min(...rows.map(row => row.getBoundingClientRect().height)),
    }
  })
  expect(layerLayout.sidebarScrollWidth).toBeLessThanOrEqual(layerLayout.sidebarClientWidth)
  expect(layerLayout.panelScrollWidth).toBeLessThanOrEqual(layerLayout.panelClientWidth)
  expect(layerLayout.rowsFit).toBe(true)
  expect(layerLayout.minimumRowHeight).toBeGreaterThanOrEqual(40)

  await contentInput.fill('Chỉnh trực tiếp từ Canvas')
  await expect(canvas.getByRole('heading', { name: 'Chỉnh trực tiếp từ Canvas' })).toBeVisible()
  await expect(page.getByRole('treeitem', { name: /^Tiêu đề: Chỉnh trực tiếp từ Canvas/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('footer').getByText('Đã lưu')).toBeVisible()

  await expect.poll(async () => {
    const response = await page.request.get(`/api/v1/projects/${projectId}/document?workspaceId=${workspaceId}`)
    return JSON.stringify((await response.json()).data.document)
  }).toContain('Chỉnh trực tiếp từ Canvas')

  const accessibility = await new AxeBuilder({ page }).include('.advanced-sidebar').include('.inspector-panel').analyze()
  expect(accessibility.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([])
})

test('rejects invalid targets without changing the canvas', async ({ page }) => {
  const projectId = await createProject(page, 'Invalid target')
  await page.goto(`/projects/${projectId}`)
  await openAdvancedEditor(page)
  await page.getByRole('treeitem', { name: /^Trang: Trang/ }).click()
  const before = await page.locator('[data-node-id]').count()
  await page.getByRole('tab', { name: 'Thành phần' }).click()
  await page.getByRole('button', { name: 'Thêm Nút' }).click()
  await expect(page.getByText('Không thể đặt thành phần vào vị trí này.')).toBeVisible()
  await expect(page.locator('[data-node-id]')).toHaveCount(before)
})
