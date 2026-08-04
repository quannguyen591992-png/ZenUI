import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createValidDesignFixture } from '@zenui/design-schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EditorApp } from '../app/editor/editor-app'

import type { EditorApi } from '../app/editor/editor-app'

const projectId = '55555555-5555-4555-8555-555555555555'
const workspaceId = '22222222-2222-4222-8222-222222222222'

function serverEditor(api: EditorApi) {
  const document = createValidDesignFixture()
  document.projectId = projectId
  return <EditorApp projectId={projectId} workspaceId={workspaceId} initialDocument={document} initialVersion={1} api={api} initialMode="advanced" />
}

function api(overrides: Partial<EditorApi> = {}): EditorApi {
  return {
    saveCommands: (_projectId, _workspaceId, expectedVersion) => Promise.resolve({ accepted: true, version: expectedVersion + 1 }),
    loadDocument: () => Promise.resolve({ version: 1, document: { ...createValidDesignFixture(), projectId } }),
    listRevisions: () => Promise.resolve([]),
    createRevision: (_projectId, _workspaceId, summary) => Promise.resolve({ id: 'revision-1', documentVersion: 1, summary, source: 'manual', createdAt: new Date().toISOString() }),
    restoreRevision: () => Promise.resolve({ accepted: true, version: 2, document: { ...createValidDesignFixture(), projectId, version: 2 } }),
    ...overrides,
  }
}

describe('ZenUI editor', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('keeps only proposal-first AI controls in Advanced mode', () => {
    render(serverEditor(api()))

    expect(screen.queryByRole('heading', { name: 'Trợ lý AI' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Trợ lý thiết kế AI' })).toBeVisible()
  })

  it('renders the Advanced sidebar tabs and selects a canvas node directly', async () => {
    const user = userEvent.setup()
    render(<EditorApp />)

    expect(screen.getByRole('tab', { name: 'Lớp' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tree', { name: 'Lớp' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /thêm tiêu đề/i })).toBeNull()

    const canvas = screen.getByLabelText('Khung thiết kế')
    await user.click(within(canvas).getByRole('heading', { name: 'Biến ý tưởng thành website của riêng bạn' }))

    expect(screen.getByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ })).toHaveAttribute('aria-selected', 'true')
    const selectedNode = canvas.querySelector<HTMLElement>('[data-node-id="heading-1"]')
    const toolbar = selectedNode?.querySelector<HTMLElement>(':scope > .node-actions')
    expect(toolbar).not.toBeNull()
    const controls = within(toolbar!).getAllByRole('button')
    expect(controls.map(control => control.getAttribute('aria-label'))).toEqual([
      'Chọn Biến ý tưởng thành website của riêng bạn',
      'Kéo Biến ý tưởng thành website của riêng bạn',
      'Di chuyển Biến ý tưởng thành website của riêng bạn lên',
      'Di chuyển Biến ý tưởng thành website của riêng bạn xuống',
      'Nhân bản Biến ý tưởng thành website của riêng bạn',
      'Xóa Biến ý tưởng thành website của riêng bạn',
    ])
    expect(screen.getByRole('complementary', { name: 'Thuộc tính' })).toHaveTextContent('Tiêu đề')
    expect(screen.getByLabelText('Nội dung')).toHaveValue('Biến ý tưởng thành website của riêng bạn')
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeDisabled()

    await user.click(screen.getByRole('tab', { name: 'Thành phần' }))
    expect(screen.getByRole('tab', { name: 'Thành phần' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('button', { name: /thêm tiêu đề/i })).toHaveLength(1)
    expect(screen.queryByRole('tree', { name: 'Lớp' })).toBeNull()
  })

  it('adds a heading, edits text and color, then undoes and redoes', async () => {
    const user = userEvent.setup()
    render(<EditorApp />)

    await user.click(screen.getByRole('treeitem', { name: /^Phần nội dung: Phần nội dung/ }))
    await user.click(screen.getByRole('tab', { name: 'Thành phần' }))
    await user.click(screen.getByRole('button', { name: /thêm tiêu đề/i }))
    const text = screen.getByLabelText('Nội dung')
    await user.clear(text)
    await user.type(text, 'Phase 1 heading')
    fireEvent.change(screen.getByLabelText('Tùy chỉnh màu chữ'), { target: { value: '#112233' } })

    const canvas = screen.getByLabelText('Khung thiết kế')
    expect(within(canvas).getByRole('heading', { name: 'Phase 1 heading' })).toHaveStyle({ color: '#112233' })
    await user.click(screen.getByRole('button', { name: 'Hoàn tác' }))
    expect(within(canvas).getByRole('heading', { name: 'Phase 1 heading' })).not.toHaveStyle({ color: '#112233' })
    await user.click(screen.getByRole('button', { name: 'Làm lại' }))
    expect(within(canvas).getByRole('heading', { name: 'Phase 1 heading' })).toHaveStyle({ color: '#112233' })
  })

  it('rejects an invalid add with an accessible explanation', async () => {
    const user = userEvent.setup()
    render(<EditorApp />)

    await user.click(screen.getByRole('treeitem', { name: 'Trang: Trang' }))
    await user.click(screen.getByRole('tab', { name: 'Thành phần' }))
    await user.click(screen.getByRole('button', { name: /thêm nút/i }))

    expect(screen.getByText('Không thể đặt thành phần vào vị trí này.')).toBeVisible()
  })

  it('persists accepted edits and restores them after remount', async () => {
    const user = userEvent.setup()
    const rendered = render(<EditorApp />)
    await user.click(screen.getByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ }))
    const text = screen.getByLabelText('Nội dung')
    await user.clear(text)
    await user.type(text, 'Đã lưu heading')
    rendered.unmount()

    render(<EditorApp />)
    expect(screen.getByLabelText('Khung thiết kế')).toHaveTextContent('Đã lưu heading')
  })

  it('keeps the accessible Lớp tree synchronized with Khung thiết kế selection and reorder', async () => {
    const user = userEvent.setup()
    render(<EditorApp />)

    const tree = screen.getByRole('tree', { name: 'Lớp' })
    expect(tree).toBeVisible()
    expect(screen.getByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ })).toHaveAttribute('aria-selected', 'false')

    await user.click(screen.getByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ }))
    expect(screen.getByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Nội dung')).toBeVisible()

    await user.click(screen.getByRole('treeitem', { name: /^Đoạn văn: Bắt đầu với một trang có cấu trúc rõ ràng/ }))
    expect(screen.getByRole('button', { name: /chọn bắt đầu với một trang có cấu trúc rõ ràng/i })).toHaveAttribute('data-selected', 'true')

    await user.click(screen.getByRole('button', { name: 'Di chuyển Bắt đầu với một trang có cấu trúc rõ ràng và dễ chỉnh sửa. lên' }))
    expect(screen.getByText('Đã áp dụng thay đổi')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeEnabled()
    const items = screen.getAllByRole('treeitem')
    expect(items.findIndex(item => item.getAttribute('aria-label')?.startsWith('Đoạn văn'))).toBeLessThan(
      items.findIndex(item => item.getAttribute('aria-label')?.startsWith('Tiêu đề')),
    )
  })

  it('supports collapsible keyboard navigation through visible Layers', async () => {
    const user = userEvent.setup()
    render(<EditorApp />)

    const page = screen.getByRole('treeitem', { name: 'Trang: Trang' })
    const section = screen.getByRole('treeitem', { name: /^Phần nội dung: Phần nội dung/ })
    expect(page).toHaveAttribute('aria-expanded', 'true')
    expect(section).toHaveAttribute('aria-expanded', 'true')

    section.focus()
    await user.keyboard('{ArrowLeft}')
    expect(section).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('treeitem', { name: 'Khung chứa: Khung chứa' })).toBeNull()

    await user.keyboard('{ArrowDown}')
    expect(section).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(section).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('treeitem', { name: /^Khung chứa: Khung chứa/ })).toHaveFocus()

    const heading = screen.getByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ })
    heading.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByLabelText('Nội dung')).toBeVisible()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('treeitem', { name: /^Đoạn văn: Bắt đầu với một trang có cấu trúc rõ ràng/ })).toHaveFocus()
  })

  it('duplicates and deletes the exact Advanced Canvas node through history', async () => {
    const user = userEvent.setup()
    render(<EditorApp />)

    await user.click(screen.getByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ }))
    await user.click(screen.getByRole('button', { name: 'Nhân bản Biến ý tưởng thành website của riêng bạn' }))
    expect(screen.getAllByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Xóa Biến ý tưởng thành website của riêng bạn' }))
    expect(screen.getByRole('dialog', { name: 'Xóa thành phần?' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Xác nhận xóa thành phần' }))
    expect(screen.getAllByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ })).toHaveLength(1)
  })

  it('keeps selection and drag controls as separate interactive elements', () => {
    const { container } = render(<EditorApp />)

    expect(container.querySelector(
      'button button, button [role="button"], [role="button"] button, [role="button"] [role="button"]',
    )).toBeNull()
  })

  it('renders owned image and brand-logo assets from the environment asset origin', () => {
    const document = createValidDesignFixture()
    document.projectId = projectId
    document.nodes['image-1']!.props = {
      assetId: '77777777-7777-4777-8777-777777777777', alt: 'Product dashboard', decorative: false,
    }
    document.nodes['brand-link'] = {
      id: 'brand-link', type: 'link', parentId: 'container-1', children: [],
      props: {
        text: 'NovaFlow', href: '#top', brandSlot: true,
        logoAssetId: '88888888-8888-4888-8888-888888888888', logoAlt: 'NovaFlow',
      }, style: {}, responsive: {},
    }
    document.nodes['container-1']!.children.push('brand-link')

    render(<EditorApp
      projectId={projectId}
      workspaceId={workspaceId}
      initialDocument={document}
      initialVersion={1}
      api={api()}
      assetOrigin="https://assets.example.com"
      initialMode="advanced"
    />)

    expect(screen.getByAltText('Product dashboard')).toHaveAttribute(
      'src', 'https://assets.example.com/a/77777777-7777-4777-8777-777777777777',
    )
    expect(screen.getByAltText('NovaFlow')).toHaveAttribute(
      'src', 'https://assets.example.com/a/88888888-8888-4888-8888-888888888888',
    )
  })

  it('previews the selected viewport at a bounded Khung thiết kế width', async () => {
    const user = userEvent.setup()
    render(<EditorApp />)

    const canvas = screen.getByLabelText('Khung thiết kế')
    expect(canvas).toHaveAttribute('data-viewport', 'desktop')
    expect(canvas.firstElementChild).toHaveStyle({ width: '100%' })

    await user.selectOptions(screen.getByLabelText('Thiết bị xem trước'), 'tablet')
    expect(canvas).toHaveAttribute('data-viewport', 'tablet')
    expect(canvas.firstElementChild).toHaveStyle({ width: '768px' })

    await user.selectOptions(screen.getByLabelText('Thiết bị xem trước'), 'mobile')
    expect(canvas).toHaveAttribute('data-viewport', 'mobile')
    expect(canvas.firstElementChild).toHaveStyle({ width: '390px' })
  })

  it('edits allowlisted layout and responsive styles per viewport', async () => {
    const user = userEvent.setup()
    render(<EditorApp />)

    await user.click(screen.getByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ }))
    await user.selectOptions(screen.getByLabelText('Thiết bị xem trước'), 'mobile')
    await user.clear(screen.getByLabelText('Cỡ chữ'))
    await user.type(screen.getByLabelText('Cỡ chữ'), '24')
    await user.tab()

    const canvas = screen.getByLabelText('Khung thiết kế')
    expect(within(canvas).getByRole('heading', { name: 'Biến ý tưởng thành website của riêng bạn' })).toHaveStyle({ fontSize: '24px' })
    await user.selectOptions(screen.getByLabelText('Thiết bị xem trước'), 'desktop')
    expect(within(canvas).getByRole('heading', { name: 'Biến ý tưởng thành website của riêng bạn' })).not.toHaveStyle({ fontSize: '24px' })

    await user.click(screen.getByRole('treeitem', { name: /^Khung chứa: Khung chứa/ }))
    await user.clear(screen.getByLabelText('Khoảng cách'))
    await user.type(screen.getByLabelText('Khoảng cách'), '32')
    await user.tab()
    expect(screen.getByText('Đã áp dụng thay đổi')).toBeVisible()
  })

  it('rejects invalid Inspector input without changing document history', async () => {
    const user = userEvent.setup()
    render(<EditorApp />)

    await user.click(screen.getByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ }))
    await user.clear(screen.getByLabelText('Cỡ chữ'))
    await user.type(screen.getByLabelText('Cỡ chữ'), '999')
    await user.tab()

    expect(screen.getByText('Cỡ chữ phải từ 10 đến 160')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeDisabled()
  })

  it('supports global undo shortcuts outside form controls', async () => {
    const user = userEvent.setup()
    render(<EditorApp />)

    await user.click(screen.getByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ }))
    fireEvent.change(screen.getByLabelText('Tùy chỉnh màu chữ'), { target: { value: '#112233' } })
    const canvas = screen.getByLabelText('Khung thiết kế')
    expect(within(canvas).getByRole('heading', { name: 'Biến ý tưởng thành website của riêng bạn' })).toHaveStyle({ color: '#112233' })

    screen.getByRole('tab', { name: 'Lớp' }).focus()
    await user.keyboard('{Control>}z{/Control}')
    expect(within(canvas).getByRole('heading', { name: 'Biến ý tưởng thành website của riêng bạn' })).not.toHaveStyle({ color: '#112233' })
  })

  it('requires an explicit reset before replacing a corrupt local draft', async () => {
    localStorage.setItem('zenui:draft:project-1', '{not-json')
    const user = userEvent.setup()
    render(<EditorApp />)

    expect(screen.getByText('Bản nháp cục bộ cần được khôi phục')).toBeVisible()
    expect(localStorage.getItem('zenui:draft:project-1')).toBe('{not-json')

    await user.click(screen.getByRole('button', { name: 'Đặt lại bản nháp cục bộ' }))

    expect(screen.getByText('Đã đặt lại bản nháp cục bộ')).toBeVisible()
    expect(localStorage.getItem('zenui:draft:project-1')).not.toBe('{not-json')
  })

  it('selects directly on the production Canvas without mutating or autosaving', async () => {
    const saveCommands = vi.fn<EditorApi['saveCommands']>()
    const user = userEvent.setup()
    render(serverEditor(api({ saveCommands })))

    const canvas = screen.getByLabelText('Khung thiết kế')
    await user.click(within(canvas).getByRole('heading', { name: 'Build your next product' }))

    expect(screen.getByRole('treeitem', { name: /^Tiêu đề: Build your next product/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Nội dung')).toHaveValue('Build your next product')
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeDisabled()
    await new Promise(resolve => window.setTimeout(resolve, 150))
    expect(saveCommands).not.toHaveBeenCalled()
  })

  it('autosaves accepted commands sequentially and exposes saved state', async () => {
    const saveCommands = vi.fn<EditorApi['saveCommands']>((_projectId, _workspaceId, expectedVersion) => (
      Promise.resolve({ accepted: true, version: expectedVersion + 1 })
    ))
    const user = userEvent.setup()
    render(serverEditor(api({ saveCommands })))

    await user.click(screen.getByRole('treeitem', { name: /^Tiêu đề: Build your next product/ }))
    fireEvent.change(screen.getByLabelText('Tùy chỉnh màu chữ'), { target: { value: '#112233' } })

    expect(await screen.findByText('Đã lưu')).toBeVisible()
    expect(saveCommands).toHaveBeenCalledTimes(1)
    expect(saveCommands.mock.calls[0]?.[2]).toBe(1)
    expect(saveCommands.mock.calls[0]?.[3]).toHaveLength(1)
  })

  it('preserves recovery state for offline autosave failures', async () => {
    render(serverEditor(api({
      saveCommands: () => Promise.resolve({ accepted: false, code: 'offline' }),
    })))

    await userEvent.setup().click(screen.getByRole('treeitem', { name: /^Tiêu đề: Build your next product/ }))
    fireEvent.change(screen.getByLabelText('Tùy chỉnh màu chữ'), { target: { value: '#112233' } })

    expect(await screen.findByText('Đang ngoại tuyến: bản khôi phục cục bộ vẫn được giữ')).toBeVisible()
    expect(localStorage.getItem(`zenui:recovery:${projectId}`)).not.toBeNull()
  })

  it('keeps local work on conflict and can reload the canonical server document', async () => {
    const serverDocument = { ...createValidDesignFixture(), projectId, version: 2 }
    serverDocument.nodes['heading-1']!.props = { text: 'Server heading', level: 1 }
    const user = userEvent.setup()
    render(serverEditor(api({
      saveCommands: () => Promise.resolve({ accepted: false, code: 'stale_document_version', currentVersion: 2 }),
      loadDocument: () => Promise.resolve({ version: 2, document: serverDocument }),
    })))

    await user.click(screen.getByRole('treeitem', { name: /^Tiêu đề: Build your next product/ }))
    fireEvent.change(screen.getByLabelText('Nội dung'), { target: { value: 'Unsynced local heading' } })

    expect(await screen.findByText('Có xung đột: thay đổi cục bộ vẫn được giữ')).toBeVisible()
    expect(screen.getAllByText('Unsynced local heading')).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Tải bản sao khôi phục' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Tải lại phiên bản máy chủ' }))
    expect(await within(screen.getByLabelText('Khung thiết kế')).findByRole('heading', { name: 'Server heading' })).toBeVisible()
    expect(within(screen.getByLabelText('Khung thiết kế')).queryByText('Unsynced local heading')).toBeNull()
  })

  it('creates and restores revisions from the current saved version', async () => {
    const createRevision = vi.fn<EditorApi['createRevision']>((_projectId, _workspaceId, summary) => (
      Promise.resolve({ id: 'revision-2', documentVersion: 1, summary, source: 'manual', createdAt: new Date().toISOString() })
    ))
    const restoredDocument = { ...createValidDesignFixture(), projectId, version: 3 }
    restoredDocument.nodes['heading-1']!.props = { text: 'Restored heading', level: 1 }
    const restoreRevision = vi.fn<EditorApi['restoreRevision']>(() => Promise.resolve({
      accepted: true, version: 3, document: restoredDocument,
    }))
    const user = userEvent.setup()
    render(serverEditor(api({
      listRevisions: () => Promise.resolve([{ id: 'revision-1', documentVersion: 1, summary: 'Initial', source: 'manual', createdAt: new Date().toISOString() }]),
      createRevision,
      restoreRevision,
    })))

    expect(await screen.findByText('Initial')).toBeVisible()
    await user.type(screen.getByLabelText('Tên phiên bản'), 'Before redesign')
    await user.click(screen.getByRole('button', { name: 'Tạo phiên bản' }))
    expect(await screen.findByText('Before redesign')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Khôi phục Initial' }))
    expect(await within(screen.getByLabelText('Khung thiết kế')).findByRole('heading', { name: 'Restored heading' })).toBeVisible()
    await waitFor(() => expect(restoreRevision).toHaveBeenCalledWith(projectId, workspaceId, 'revision-1', 1))
  })

  it('requires the server export boundary for fixture documents', () => {
    render(<EditorApp />)

    expect(screen.getByText('Cần xuất tệp từ máy chủ')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Xuất website' })).toBeNull()
  })
})
