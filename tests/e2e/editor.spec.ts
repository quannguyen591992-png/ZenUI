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
    nodes: Record<string, { type: string; props: Record<string, unknown>; style: Record<string, unknown>; children: string[] }>
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
  await page.getByLabel('Tùy chỉnh màu chữ').fill('#112233')
  await expect(page.getByRole('heading', { name: 'Phase 2 heading' })).toHaveCSS('color', 'rgb(17, 34, 51)')
  await expect.poll(async () => {
    const stored = await projectDocument(page, projectId)
    return Object.values(stored.document.nodes).find(node => (
      node.type === 'heading' && node.props.text === 'Phase 2 heading'
    ))?.style.color
  }).toBe('#112233')

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

test('changes visible spacing only for a supported multi-item layout', async ({ page }) => {
  const projectId = await createProject(page, 'Visible layout spacing')
  await page.goto(`/projects/${projectId}`)
  await openAdvancedEditor(page)

  await page.getByRole('treeitem', { name: /^Khung chứa: Khung chứa/ }).click()
  await expect(page.getByLabel('Khoảng cách giữa các phần tử')).toHaveCount(0)
  await page.getByRole('tab', { name: 'Thành phần' }).click()
  await page.getByRole('button', { name: 'Thêm Nhóm xếp chồng' }).click()
  await page.getByRole('button', { name: 'Thêm Tiêu đề' }).click()
  await page.getByRole('tab', { name: 'Lớp' }).click()
  const stackLayer = page.getByRole('treeitem', { name: /^Nhóm xếp chồng: Nhóm xếp chồng/ })
  await stackLayer.click()
  await page.getByRole('tab', { name: 'Thành phần' }).click()
  await page.getByRole('button', { name: 'Thêm Đoạn văn' }).click()
  await page.getByRole('tab', { name: 'Lớp' }).click()
  await stackLayer.click()

  const stackId = await stackLayer.getAttribute('data-layer-id')
  expect(stackId).not.toBeNull()
  const stack = page.locator(`[data-node-id="${stackId}"] > .node-visual > [data-node-type="stack"]`)
  const renderedGap = () => stack.evaluate(element => {
    const first = element.children[0]?.getBoundingClientRect()
    const second = element.children[1]?.getBoundingClientRect()
    if (!first || !second) throw new Error('Stack needs two rendered children')
    return second.top - first.bottom
  })
  await expect.poll(renderedGap).toBeCloseTo(16, 0)

  await page.getByRole('slider', { name: 'Điều chỉnh khoảng cách giữa các phần tử' }).fill('48')
  await expect(page.getByRole('textbox', { name: 'Khoảng cách giữa các phần tử' })).toHaveValue('48')
  await expect.poll(renderedGap).toBeCloseTo(48, 0)
  await expect.poll(async () => (
    await projectDocument(page, projectId)
  ).document.nodes[stackId!]?.style.gap).toBe(48)

  await page.getByRole('button', { name: 'Hoàn tác' }).click()
  await expect.poll(renderedGap).toBeCloseTo(16, 0)
  await page.getByRole('button', { name: 'Làm lại' }).click()
  await expect.poll(renderedGap).toBeCloseTo(48, 0)

  await page.reload()
  await openAdvancedEditor(page)
  await page.getByRole('treeitem', { name: /^Nhóm xếp chồng: Nhóm xếp chồng/ }).click()
  await expect.poll(renderedGap).toBeCloseTo(48, 0)
  await page.getByRole('treeitem', { name: /^Tiêu đề: Tiêu đề mới/ }).click()
  await expect(page.getByLabel('Khoảng cách giữa các phần tử')).toHaveCount(0)
})

test('keeps desktop controls available while only the center workspace scrolls', async ({ page }) => {
  const projectId = await createProject(page, 'Bounded editor workspace')
  await page.goto(`/projects/${projectId}`)
  await expect(page.getByLabel('Khung thiết kế')).toBeVisible()

  const initialLayout = await page.evaluate(() => {
    const bounds = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector)
      if (!element) throw new Error(`Missing layout element: ${selector}`)
      const rectangle = element.getBoundingClientRect()
      return {
        top: rectangle.top,
        right: rectangle.right,
        bottom: rectangle.bottom,
        left: rectangle.left,
      }
    }
    const center = document.querySelector<HTMLElement>('.editor-center-scroll')
    const designPanel = document.querySelector<HTMLElement>('#project-design-panel')
    if (!center || !designPanel) throw new Error('Missing bounded editor workspace')
    return {
      viewportHeight: document.documentElement.clientHeight,
      viewportWidth: document.documentElement.clientWidth,
      documentHeight: document.documentElement.scrollHeight,
      documentWidth: document.documentElement.scrollWidth,
      windowScrollY: window.scrollY,
      tabs: bounds('.project-surface-tabs'),
      designPanel: bounds('#project-design-panel'),
      toolbar: bounds('.editor-toolbar'),
      story: bounds('.page-story-pro'),
      design: bounds('.section-guide'),
      center: bounds('.editor-center-scroll'),
      canvas: bounds('.canvas-panel'),
      assets: bounds('.asset-brand-panel'),
      centerClientHeight: center.clientHeight,
      centerScrollHeight: center.scrollHeight,
      centerOverflowY: getComputedStyle(center).overflowY,
      designPanelOverflowY: getComputedStyle(designPanel).overflowY,
    }
  })

  expect(initialLayout.designPanel.top).toBeCloseTo(initialLayout.tabs.bottom, 0)
  expect(initialLayout.designPanel.bottom).toBeCloseTo(initialLayout.viewportHeight, 0)
  expect(initialLayout.documentHeight).toBeLessThanOrEqual(initialLayout.viewportHeight)
  expect(initialLayout.documentWidth).toBeLessThanOrEqual(initialLayout.viewportWidth)
  expect(initialLayout.centerScrollHeight).toBeGreaterThan(initialLayout.centerClientHeight)
  expect(initialLayout.centerOverflowY).toBe('auto')
  expect(initialLayout.designPanelOverflowY).toBe('hidden')

  await page.locator('.editor-center-scroll').evaluate(element => {
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event('scroll'))
  })
  await expect.poll(() => page.locator('.editor-center-scroll').evaluate(element => element.scrollTop))
    .toBeGreaterThan(0)

  const scrolledLayout = await page.evaluate(() => {
    const bounds = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector)
      if (!element) throw new Error(`Missing layout element: ${selector}`)
      const rectangle = element.getBoundingClientRect()
      return { top: rectangle.top, bottom: rectangle.bottom }
    }
    return {
      windowScrollY: window.scrollY,
      toolbar: bounds('.editor-toolbar'),
      story: bounds('.page-story-pro'),
      design: bounds('.section-guide'),
      center: bounds('.editor-center-scroll'),
      canvas: bounds('.canvas-panel'),
      assets: bounds('.asset-brand-panel'),
    }
  })

  expect(scrolledLayout.windowScrollY).toBe(initialLayout.windowScrollY)
  expect(scrolledLayout.toolbar.top).toBeCloseTo(initialLayout.toolbar.top, 0)
  expect(scrolledLayout.story.top).toBeCloseTo(initialLayout.story.top, 0)
  expect(scrolledLayout.design.top).toBeCloseTo(initialLayout.design.top, 0)
  expect(scrolledLayout.canvas.top).toBeLessThan(initialLayout.canvas.top)
  expect(scrolledLayout.assets.top).toBeLessThan(scrolledLayout.center.bottom)
  expect(scrolledLayout.assets.bottom).toBeGreaterThan(scrolledLayout.center.top)
})

test('authors a bounded visual-only Lead Form and preserves its immutable revision', async ({ page }) => {
  const projectId = await createProject(page, 'Lead Form foundation')
  await page.goto(`/projects/${projectId}`)
  await openAdvancedEditor(page)
  await page.getByRole('treeitem', { name: /^Khung chứa: Khung chứa/ }).click()
  await page.getByRole('tab', { name: 'Thành phần' }).click()
  await page.getByRole('button', { name: 'Thêm Biểu mẫu khách hàng' }).click()

  const builder = page.getByRole('region', { name: 'Trình tạo biểu mẫu khách hàng' })
  await expect(builder).toBeVisible()
  const desktopInspectorLayout = await page.locator('.inspector-panel').evaluate(element => {
    const panel = element as HTMLElement
    const saveBar = panel.querySelector<HTMLElement>('.lead-form-save-bar')
    if (!saveBar) throw new Error('Missing Lead Form save bar')
    const bounds = panel.getBoundingClientRect()
    const nestedScrollOwners = Array.from(panel.querySelectorAll<HTMLElement>('*')).filter(child => {
      const overflowY = getComputedStyle(child).overflowY
      return (overflowY === 'auto' || overflowY === 'scroll')
        && child.scrollHeight > child.clientHeight
    })
    return {
      panelPosition: getComputedStyle(panel).position,
      panelOverflowY: getComputedStyle(panel).overflowY,
      panelTop: bounds.top,
      panelBottom: bounds.bottom,
      viewportHeight: document.documentElement.clientHeight,
      panelClientHeight: panel.clientHeight,
      panelScrollHeight: panel.scrollHeight,
      nestedScrollOwnerCount: nestedScrollOwners.length,
      saveBarPosition: getComputedStyle(saveBar).position,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }
  })
  expect(desktopInspectorLayout.panelPosition).toBe('static')
  expect(desktopInspectorLayout.panelOverflowY).toBe('auto')
  expect(desktopInspectorLayout.panelTop).toBeGreaterThanOrEqual(0)
  expect(desktopInspectorLayout.panelBottom).toBeLessThanOrEqual(desktopInspectorLayout.viewportHeight)
  expect(desktopInspectorLayout.panelScrollHeight).toBeGreaterThan(desktopInspectorLayout.panelClientHeight)
  expect(desktopInspectorLayout.nestedScrollOwnerCount).toBe(0)
  expect(desktopInspectorLayout.saveBarPosition).toBe('sticky')
  expect(desktopInspectorLayout.documentWidth).toBeLessThanOrEqual(desktopInspectorLayout.viewportWidth)

  await page.locator('.inspector-panel').evaluate(element => {
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event('scroll'))
  })
  await expect(page.locator('.lead-form-save-bar')).toBeVisible()
  await builder.getByLabel('Tiêu đề biểu mẫu').fill('Nhận tư vấn sản phẩm')
  await builder.getByLabel('Mô tả biểu mẫu').fill('Cho chúng tôi biết nhu cầu của bạn.')
  await builder.getByLabel('Nhãn nút gửi').fill('Gửi nhu cầu')
  await builder.getByRole('button', { name: 'Thêm trường' }).click()
  await builder.getByLabel('Trường 3').getByLabel('Khóa trường').fill('phone')
  await builder.getByLabel('Trường 3').getByLabel('Nhãn trường').fill('Số điện thoại')
  await builder.getByLabel('Trường 3').getByLabel('Loại trường').selectOption('tel')
  await builder.getByRole('button', { name: 'Đưa trường 3 lên' }).click()
  await builder.getByText('Hiển thị đồng ý liên hệ').click()
  await builder.getByLabel('Nội dung đồng ý').fill('Tôi đồng ý để chủ website liên hệ về nhu cầu này.')
  await builder.getByRole('button', { name: 'Lưu biểu mẫu' }).click()

  const form = page.getByRole('form', { name: 'Nhận tư vấn sản phẩm' })
  await expect(form).toContainText('Bản xem trước — chưa gửi dữ liệu')
  await expect(form.getByLabel('Số điện thoại')).toHaveAttribute('type', 'tel')
  await expect(form.getByLabel('Email')).toHaveAttribute('required', '')
  await expect.poll(async () => Object.values(
    (await projectDocument(page, projectId)).document.nodes,
  ).find(node => node.type === 'lead-form')?.props).toMatchObject({
    title: 'Nhận tư vấn sản phẩm',
    submitLabel: 'Gửi nhu cầu',
  })

  const formLayout = async () => form.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    const container = element.parentElement?.getBoundingClientRect()
    if (!container) throw new Error('Missing Lead Form layout container')
    return {
      width: bounds.width,
      leftSpace: bounds.left - container.left,
      rightSpace: container.right - bounds.right,
    }
  })
  const layoutControls = page.getByRole('group', { name: 'Bố cục biểu mẫu' })
  await layoutControls.getByRole('button', { name: 'Canh trái' }).click()
  await expect.poll(async () => (await formLayout()).leftSpace).toBeLessThanOrEqual(1)
  await layoutControls.getByRole('button', { name: 'Canh giữa' }).click()
  await expect.poll(async () => {
    const layout = await formLayout()
    return {
      bounded: layout.width <= 720,
      balanced: Math.abs(layout.leftSpace - layout.rightSpace) <= 1,
    }
  }).toEqual({ bounded: true, balanced: true })

  await page.getByRole('button', { name: 'Hoàn tác' }).click()
  await expect.poll(async () => (await formLayout()).leftSpace).toBeLessThanOrEqual(1)
  await page.getByRole('button', { name: 'Làm lại' }).click()
  await expect.poll(async () => {
    const layout = await formLayout()
    return Math.abs(layout.leftSpace - layout.rightSpace)
  }).toBeLessThanOrEqual(1)
  await expect.poll(async () => Object.values(
    (await projectDocument(page, projectId)).document.nodes,
  ).find(node => node.type === 'lead-form')?.style).toMatchObject({
    marginLeft: 'auto',
    marginRight: 'auto',
  })

  let submissionRequests = 0
  page.on('request', request => {
    if (request.method() === 'POST' && !request.url().includes('/api/v1/projects/')) submissionRequests += 1
  })
  await form.getByLabel('Họ và tên').fill('Nguyễn An')
  await form.getByLabel('Email').fill('an@example.com')
  await form.getByLabel('Số điện thoại').fill('+84 912 345 678')
  await form.getByLabel('Tôi đồng ý để chủ website liên hệ về nhu cầu này.').check()
  await form.getByRole('button', { name: 'Gửi nhu cầu' }).click()
  await expect(form).toContainText('Bản xem trước — chưa gửi dữ liệu')
  expect(submissionRequests).toBe(0)

  await page.reload()
  const reloadedForm = page.getByRole('form', { name: 'Nhận tư vấn sản phẩm' })
  await expect(reloadedForm).toBeVisible()
  await expect.poll(async () => reloadedForm.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    const container = element.parentElement?.getBoundingClientRect()
    if (!container) throw new Error('Missing reloaded Lead Form layout container')
    return {
      bounded: bounds.width <= 720,
      balanced: Math.abs(
        (bounds.left - container.left) - (container.right - bounds.right),
      ) <= 1,
    }
  })).toEqual({ bounded: true, balanced: true })
  const revisions = page.getByRole('region', { name: 'Phiên bản' })
  await revisions.getByLabel('Tên phiên bản').fill('Lead Form baseline')
  await revisions.getByRole('button', { name: 'Tạo phiên bản' }).click()
  await expect(revisions.getByText('Lead Form baseline')).toBeVisible({ timeout: 15_000 })

  const revisionResponse = await page.request.get(`/api/v1/projects/${projectId}/revisions?workspaceId=${workspaceId}`)
  expect(revisionResponse.status()).toBe(200)
  const revision = (await revisionResponse.json()).data[0] as { documentVersion: number; summary: string }
  expect(revision).toMatchObject({ summary: 'Lead Form baseline' })
  const persistedDocument = await projectDocument(page, projectId)
  expect(revision.documentVersion).toBe(persistedDocument.version)
  const persistedForms = Object.values(persistedDocument.document.nodes).filter(node => node.type === 'lead-form')
  expect(persistedForms).toHaveLength(1)
  expect(persistedForms[0]).toMatchObject({
    children: [],
    style: {
      width: 'full',
      maxWidth: 720,
      marginLeft: 'auto',
      marginRight: 'auto',
    },
    props: {
      title: 'Nhận tư vấn sản phẩm',
      submitLabel: 'Gửi nhu cầu',
      fields: [
        expect.objectContaining({ key: 'name' }),
        expect.objectContaining({ key: 'phone', type: 'tel' }),
        expect.objectContaining({ key: 'email' }),
      ],
    },
  })

  const accessibility = await new AxeBuilder({ page }).include('[data-node-type="lead-form"]').analyze()
  expect(accessibility.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([])

  await page.setViewportSize({ width: 390, height: 844 })
  await reloadedForm.click()
  await page.getByRole('button', { name: 'Chỉnh sửa', exact: true }).click()
  const editSheet = page.getByRole('dialog', { name: 'Chỉnh sửa trực tiếp' })
  await expect(editSheet.getByRole('region', { name: 'Trình tạo biểu mẫu khách hàng' })).toBeVisible()
  const mobileLayout = await editSheet.evaluate(element => {
    const saveBar = element.querySelector<HTMLElement>('.lead-form-save-bar')
    if (!saveBar) throw new Error('Missing Lead Form save bar in edit sheet')
    return {
      sheetOverflowY: getComputedStyle(element).overflowY,
      saveBarPosition: getComputedStyle(saveBar).position,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }
  })
  expect(mobileLayout.sheetOverflowY).toBe('auto')
  expect(mobileLayout.saveBarPosition).toBe('static')
  expect(mobileLayout.documentWidth).toBeLessThanOrEqual(mobileLayout.viewportWidth)
  const mobileAccessibility = await new AxeBuilder({ page }).include('.section-sheet').analyze()
  expect(mobileAccessibility.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([])
})

test('centers an exact Lead Form through a structured AI style proposal without changing copy', async ({ page }) => {
  const projectId = await createProject(page, 'Lead Form AI alignment')
  await page.goto(`/projects/${projectId}`)
  await openAdvancedEditor(page)
  await page.getByRole('treeitem', { name: /^Khung chứa: Khung chứa/ }).click()
  await page.getByRole('tab', { name: 'Thành phần' }).click()
  await page.getByRole('button', { name: 'Thêm Biểu mẫu khách hàng' }).click()

  const builder = page.getByRole('region', { name: 'Trình tạo biểu mẫu khách hàng' })
  await builder.getByLabel('Tiêu đề biểu mẫu').fill('Đăng ký tư vấn AI')
  await builder.getByRole('button', { name: 'Lưu biểu mẫu' }).click()
  await builder.getByRole('button', { name: 'Canh trái' }).click()
  await expect.poll(async () => {
    const stored = await projectDocument(page, projectId)
    const form = Object.values(stored.document.nodes).find(node => (
      node.type === 'lead-form'
      && 'title' in (node.props as Record<string, unknown>)
      && (node.props as { title?: string }).title === 'Đăng ký tư vấn AI'
    ))
    return form?.style
  }).toMatchObject({ marginLeft: 0, marginRight: 'auto' })

  const before = await projectDocument(page, projectId)
  const leadFormEntry = Object.entries(before.document.nodes).find(([, node]) => node.type === 'lead-form')
  expect(leadFormEntry).toBeDefined()
  const [leadFormId, acceptedLeadForm] = leadFormEntry!
  expect(acceptedLeadForm).toMatchObject({
    props: { title: 'Đăng ký tư vấn AI' },
    style: { marginLeft: 0, marginRight: 'auto' },
  })

  await page.getByLabel('Bạn muốn cải thiện điều gì?').fill('Căn giữa biểu mẫu')
  const proposalRequest = page.waitForRequest(request => (
    request.method() === 'POST' && request.url().endsWith(`/projects/${projectId}/ai-proposals`)
  ))
  await page.getByRole('button', { name: 'Đề xuất thay đổi' }).click()
  expect((await proposalRequest).postDataJSON()).toMatchObject({
    intent: 'standard',
    prompt: 'Căn giữa biểu mẫu',
    selectedNodeId: leadFormId,
  })
  await expect(page.getByRole('heading', { name: 'Kiểm tra thay đổi được đề xuất' })).toBeVisible({ timeout: 15_000 })

  const proposalResponse = await page.request.get(`/api/v1/projects/${projectId}/ai-proposals?workspaceId=${workspaceId}`)
  expect(proposalResponse.status()).toBe(200)
  const proposal = (await proposalResponse.json()).data[0] as {
    intent: string
    status: string
    proposedDocument: typeof before.document
  }
  expect(proposal).toMatchObject({ intent: 'style', status: 'ready' })
  expect(proposal.proposedDocument.nodes[leadFormId]).toMatchObject({
    props: acceptedLeadForm.props,
    style: {
      width: 'full',
      maxWidth: 720,
      marginLeft: 'auto',
      marginRight: 'auto',
    },
  })

  await page.getByRole('button', { name: 'Chấp nhận thay đổi' }).click()
  await expect.poll(async () => (await projectDocument(page, projectId)).version).toBe(before.version + 1)
  const accepted = await projectDocument(page, projectId)
  expect(accepted.document.nodes[leadFormId]).toMatchObject({
    props: acceptedLeadForm.props,
    style: {
      width: 'full',
      maxWidth: 720,
      marginLeft: 'auto',
      marginRight: 'auto',
    },
  })
  await expect(page.getByRole('form', { name: 'Đăng ký tư vấn AI' })).toBeVisible()
})

test('creates pages, edits navigation and switches active routes in Simple mode', async ({ page }) => {
  const projectId = await createProject(page, 'Multi-page flow')
  await page.goto(`/projects/${projectId}`)

  await page.getByRole('button', { name: 'Quản lý trang' }).click()
  const pageManager = page.getByRole('complementary', { name: 'Quản lý trang' })
  await pageManager.getByLabel('Tên trang mới').fill('About')
  await pageManager.getByLabel('Đường dẫn trang mới').fill('About Us')
  await pageManager.getByRole('button', { name: 'Thêm trang' }).click()
  await expect(page.getByRole('button', { name: /About \/about-us/ })).toHaveAttribute('aria-current', 'page')
  await expect.poll(async () => (await projectDocument(page, projectId)).document.pages).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: 'About', slug: '/about-us' })]),
  )

  await page.getByRole('button', { name: /Trang chủ \// }).click()
  await expect(page.getByRole('heading', { name: 'Biến ý tưởng thành website của riêng bạn' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'About' }).check()
  await page.getByLabel('Nhãn điều hướng About').fill('Về chúng tôi')
  await page.getByRole('button', { name: 'Lưu nhãn About' }).click()
  await expect.poll(async () => (await projectDocument(page, projectId)).document.navigation.items).toEqual(
    expect.arrayContaining([expect.objectContaining({ label: 'Về chúng tôi' })]),
  )

  await page.reload()
  await page.getByRole('button', { name: 'Quản lý trang' }).click()
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
    const manager = document.querySelector<HTMLElement>('.page-manager-pro')
    const center = document.querySelector<HTMLElement>('.editor-center-scroll')
    const assets = document.querySelector<HTMLElement>('.asset-brand-panel')
    if (!manager || !center || !assets) throw new Error('Missing Page Manager workspace')
    return {
      viewportHeight: document.documentElement.clientHeight,
      documentHeight: document.documentElement.scrollHeight,
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      shell: bounds('.editor-shell'),
      manager: bounds('.page-manager-pro'),
      managerClientHeight: manager.clientHeight,
      managerScrollHeight: manager.scrollHeight,
      managerOverflowY: getComputedStyle(manager).overflowY,
      story: bounds('.page-story-pro'),
      center: bounds('.editor-center-scroll'),
      canvas: bounds('.canvas-panel'),
      guide: bounds('.section-guide'),
      assets: bounds('.asset-brand-panel'),
      centerContainsAssets: center.contains(assets),
      centerClientHeight: center.clientHeight,
      centerScrollHeight: center.scrollHeight,
    }
  })
  expect(desktopLayout.documentHeight).toBeLessThanOrEqual(desktopLayout.viewportHeight)
  expect(desktopLayout.documentWidth).toBeLessThanOrEqual(desktopLayout.viewportWidth)
  expect(desktopLayout.managerScrollHeight).toBeLessThanOrEqual(desktopLayout.managerClientHeight)
  expect(desktopLayout.managerOverflowY).not.toBe('scroll')
  expect(desktopLayout.managerOverflowY).not.toBe('auto')
  expect(desktopLayout.manager.right).toBeLessThanOrEqual(desktopLayout.shell.right)
  expect(desktopLayout.center.right).toBeLessThanOrEqual(desktopLayout.shell.right)
  expect(desktopLayout.assets.right).toBeLessThanOrEqual(desktopLayout.center.right)
  expect(desktopLayout.centerContainsAssets).toBe(true)
  expect(desktopLayout.centerScrollHeight).toBeGreaterThan(desktopLayout.centerClientHeight)
  expect(desktopLayout.story.top).toBeCloseTo(desktopLayout.center.top, 0)
  expect(desktopLayout.guide.top).toBeCloseTo(desktopLayout.center.top, 0)
  expect(desktopLayout.assets.top).toBeGreaterThanOrEqual(desktopLayout.canvas.bottom)

  await page.locator('.editor-center-scroll').evaluate(element => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.getByRole('complementary', { name: 'Ảnh và thương hiệu' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('complementary', { name: 'Quản lý trang' })).toBeVisible()
  const narrowLayout = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    shellWidth: document.querySelector<HTMLElement>('.editor-shell')?.scrollWidth ?? 0,
  }))
  expect(narrowLayout.documentWidth).toBeLessThanOrEqual(narrowLayout.viewportWidth)
  expect(narrowLayout.shellWidth).toBeLessThanOrEqual(narrowLayout.viewportWidth)
  const accessibility = await new AxeBuilder({ page }).include('.page-manager-pro').analyze()
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

  const countPersistedSections = async () => Object.values(
    (await projectDocument(page, projectId)).document.nodes,
  ).filter(node => node.type === 'section').length
  const initialSectionCount = await countPersistedSections()
  await selectedToolbar.getByRole('button', { name: 'Nhân bản Nội dung' }).click()
  await expect(page.getByRole('button', { name: 'Hoàn tác' })).toBeEnabled()
  await expect.poll(countPersistedSections).toBe(initialSectionCount + 1)

  await page.getByRole('button', { name: 'Xóa Nội dung' }).click()
  await expect(page.getByRole('dialog', { name: 'Xóa section?' })).toBeVisible()
  await page.getByRole('button', { name: 'Xác nhận xóa section' }).click()
  await expect(page.getByRole('button', { name: /Chọn Nội dung — Giải thích giá trị/ })).toHaveCount(1)
  await expect.poll(countPersistedSections).toBe(initialSectionCount)

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
  const initialTextareaLayout = await contentInput.evaluate(element => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }))
  expect(initialTextareaLayout.clientHeight).toBeGreaterThanOrEqual(initialTextareaLayout.scrollHeight)
  expect(initialTextareaLayout.overflowY).toBe('hidden')
  await expect(page.getByRole('button', { name: 'Hoàn tác' })).toBeDisabled()

  await page.waitForTimeout(150)
  const before = await projectDocument(page, projectId)
  expect(JSON.stringify(before.document)).toContain('Biến ý tưởng thành website của riêng bạn')

  await contentInput.fill([
    'Dòng nội dung thứ nhất',
    'Dòng nội dung thứ hai',
    'Dòng nội dung thứ ba',
    'Dòng nội dung thứ tư',
  ].join('\n'))
  await expect.poll(() => contentInput.evaluate(element => element.clientHeight))
    .toBeGreaterThan(initialTextareaLayout.clientHeight)
  await expect.poll(() => contentInput.evaluate(element => getComputedStyle(element).overflowY))
    .toBe('hidden')

  await contentInput.fill('Sửa tay trong chế độ đơn giản')
  await expect(canvas.getByRole('heading', { name: 'Sửa tay trong chế độ đơn giản' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Hoàn tác' })).toBeEnabled()
  await expect.poll(async () => JSON.stringify((await projectDocument(page, projectId)).document)).toContain('Sửa tay trong chế độ đơn giản')

  await page.reload()
  await expect(canvas.getByRole('heading', { name: 'Sửa tay trong chế độ đơn giản' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Câu chuyện trang' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await canvas.getByRole('heading', { name: 'Sửa tay trong chế độ đơn giản' }).click()
  const editButton = page.getByRole('button', {
    name: 'Chỉnh sửa',
    exact: true,
  })
  await editButton.click()
  const editDialog = page.getByRole('dialog', { name: 'Chỉnh sửa trực tiếp' })
  await expect(editDialog.getByRole('textbox', { name: 'Nội dung' })).toHaveValue('Sửa tay trong chế độ đơn giản')
  const accessibility = await new AxeBuilder({ page }).include('.section-sheet').analyze()
  expect(accessibility.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([])
  await page.keyboard.press('Escape')
  await expect(editButton).toBeFocused()
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

  const countPersistedHeadings = async () => Object.values(
    (await projectDocument(page, projectId)).document.nodes,
  ).filter(node => node.type === 'heading').length
  const initialHeadingCount = await countPersistedHeadings()
  await advancedToolbar.getByRole('button', { name: 'Nhân bản Biến ý tưởng thành website của riêng bạn' }).click()
  await expect(page.getByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ })).toHaveCount(2)
  await expect.poll(countPersistedHeadings).toBe(initialHeadingCount + 1)
  await page.getByRole('button', { name: 'Xóa Biến ý tưởng thành website của riêng bạn' }).click()
  await expect(page.getByRole('dialog', { name: 'Xóa thành phần?' })).toBeVisible()
  await page.getByRole('button', { name: 'Xác nhận xóa thành phần' }).click()
  await expect(page.getByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ })).toHaveCount(1)
  await expect.poll(countPersistedHeadings).toBe(initialHeadingCount)
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
