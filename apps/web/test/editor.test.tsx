import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createValidDesignFixture, DESIGN_LIMITS } from '@zenui/design-schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EditorApp } from '../app/editor/editor-app'

import type { EditorApi } from '../app/editor/editor-app'

const projectId = '55555555-5555-4555-8555-555555555555'
const workspaceId = '22222222-2222-4222-8222-222222222222'

function serverEditor(api: EditorApi, document = createValidDesignFixture()) {
  document.projectId = projectId
  return <EditorApp projectId={projectId} workspaceId={workspaceId} initialDocument={document} initialVersion={document.version} api={api} initialMode="advanced" />
}

function leadFormDocument() {
  const document = createValidDesignFixture()
  document.nodes['lead-form-1'] = {
    id: 'lead-form-1',
    type: 'lead-form',
    parentId: 'container-1',
    children: [],
    props: {
      title: 'Request a consultation',
      description: 'Tell us how we can help.',
      submitLabel: 'Send request',
      successCopy: 'Thank you. We will be in touch.',
      fields: [
        { key: 'name', type: 'text', label: 'Name', required: true, placeholder: 'Your name' },
        { key: 'email', type: 'email', label: 'Email', required: true, placeholder: 'you@example.com' },
      ],
    },
    style: {},
    responsive: {},
  }
  document.nodes['container-1']!.children.push('lead-form-1')
  return document
}

function gapLayoutDocument() {
  const document = createValidDesignFixture()
  document.nodes['stack-1'] = {
    id: 'stack-1',
    type: 'stack',
    parentId: 'container-1',
    children: ['heading-1', 'paragraph-1'],
    props: {},
    style: { display: 'flex', flexDirection: 'column', gap: 16 },
    responsive: {},
  }
  document.nodes['container-1']!.children = ['stack-1', 'image-1', 'button-1']
  document.nodes['heading-1']!.parentId = 'stack-1'
  document.nodes['paragraph-1']!.parentId = 'stack-1'
  return document
}

function leadFormAtEditorLimits() {
  const document = leadFormDocument()
  document.nodes['lead-form-1']!.props = {
    title: 'Bounded form',
    description: 'Every bounded control is occupied.',
    submitLabel: 'Continue',
    successCopy: 'Thank you.',
    fields: Array.from({ length: DESIGN_LIMITS.maxLeadFormFields }, (_, index) => index === 0
      ? {
          key: 'choice',
          type: 'select' as const,
          label: 'Choice',
          required: true,
          options: Array.from({ length: DESIGN_LIMITS.maxLeadSelectOptions }, (_option, optionIndex) => ({
            label: `Option ${optionIndex + 1}`,
            value: `option-${optionIndex + 1}`,
          })),
        }
      : {
          key: `field${index + 1}`,
          type: 'text' as const,
          label: `Field ${index + 1}`,
          required: false,
        }),
  }
  return document
}

const canonicalActionCases = [
  {
    type: 'internal_page',
    field: undefined,
    value: undefined,
    expected: { type: 'internal_page', pageId: 'home' },
  },
  {
    type: 'external_url',
    field: 'Liên kết ngoài',
    value: 'https://example.com/contact',
    expected: { type: 'external_url', url: 'https://example.com/contact' },
  },
  {
    type: 'email',
    field: 'Địa chỉ email',
    value: 'sales@example.com',
    expected: { type: 'email', address: 'sales@example.com' },
  },
  {
    type: 'phone',
    field: 'Số điện thoại',
    value: '+84 912 345 678',
    expected: { type: 'phone', number: '+84 912 345 678' },
  },
] as const

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
  })

  it('only offers visible child spacing for a supported multi-item layout', async () => {
    const saveCommands = vi.fn<EditorApi['saveCommands']>((_projectId, _workspaceId, expectedVersion) => (
      Promise.resolve({ accepted: true, version: expectedVersion + 1 })
    ))
    const user = userEvent.setup()
    render(serverEditor(api({ saveCommands }), gapLayoutDocument()))

    await user.click(screen.getByRole('treeitem', { name: /^Khung chứa: Khung chứa/ }))
    expect(screen.queryByLabelText('Khoảng cách giữa các phần tử')).not.toBeInTheDocument()
    await user.click(screen.getByRole('treeitem', { name: /^Tiêu đề: Build your next product/ }))
    expect(screen.queryByLabelText('Khoảng cách giữa các phần tử')).not.toBeInTheDocument()

    await user.click(screen.getByRole('treeitem', { name: /^Nhóm xếp chồng: Nhóm xếp chồng/ }))
    const spacing = screen.getByLabelText('Khoảng cách giữa các phần tử')
    const spacingSlider = screen.getByRole('slider', { name: 'Điều chỉnh khoảng cách giữa các phần tử' })
    const stack = screen.getByLabelText('Khung thiết kế').querySelector<HTMLElement>('[data-node-id="stack-1"] .node-visual > [data-node-type="stack"]')
    expect(stack).not.toBeNull()
    expect(stack).toHaveStyle({ gap: '16px' })

    fireEvent.change(spacingSlider, { target: { value: '48' } })
    expect(spacing).toHaveValue('48')
    expect(stack).toHaveStyle({ gap: '48px' })
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Hoàn tác' }))
    expect(stack).toHaveStyle({ gap: '16px' })
    await user.click(screen.getByRole('button', { name: 'Làm lại' }))
    expect(stack).toHaveStyle({ gap: '48px' })

    await user.selectOptions(screen.getByLabelText('Thiết bị xem trước'), 'mobile')
    fireEvent.change(screen.getByRole('slider', { name: 'Điều chỉnh khoảng cách giữa các phần tử' }), { target: { value: '24' } })
    expect(stack).toHaveStyle({ gap: '24px' })
    await waitFor(() => expect(saveCommands.mock.calls.flatMap(call => call[3])).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'UPDATE_STYLE', nodeId: 'stack-1', patch: { gap: 48 } }),
      expect.objectContaining({ type: 'UPDATE_RESPONSIVE_STYLE', breakpoint: 'mobile', nodeId: 'stack-1', patch: { gap: 24 } }),
    ])))
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

  it('adds a visual-only Lead Form with canonical defaults from the component library', async () => {
    const user = userEvent.setup()
    render(<EditorApp />)

    await user.click(screen.getByRole('treeitem', { name: /^Khung chứa: Khung chứa/ }))
    await user.click(screen.getByRole('tab', { name: 'Thành phần' }))
    await user.click(screen.getByRole('button', { name: 'Thêm Biểu mẫu khách hàng' }))

    const canvas = screen.getByLabelText('Khung thiết kế')
    const form = within(canvas).getByRole('form', { name: 'Yêu cầu tư vấn' })
    expect(within(form).getByLabelText('Họ và tên')).toHaveAttribute('name', 'name')
    expect(within(form).getByLabelText('Email')).toHaveAttribute('type', 'email')
    expect(within(form).getByText('Bản xem trước — chưa gửi dữ liệu')).toBeVisible()
    expect(form).not.toHaveAttribute('action')
    expect(form).not.toHaveAttribute('method')
    expect(fireEvent.submit(form)).toBe(false)
  })

  it('aligns a Lead Form with one bounded style command and supports history', async () => {
    const saveCommands = vi.fn<EditorApi['saveCommands']>((_projectId, _workspaceId, expectedVersion) => (
      Promise.resolve({ accepted: true, version: expectedVersion + 1 })
    ))
    const user = userEvent.setup()
    render(serverEditor(api({ saveCommands }), leadFormDocument()))

    await user.click(screen.getByRole('treeitem', { name: /^Biểu mẫu khách hàng: Request a consultation/ }))
    const layout = screen.getByRole('group', { name: 'Bố cục biểu mẫu' })
    expect(within(layout).queryByRole('textbox')).toBeNull()
    expect(layout).toHaveTextContent('Kéo chỉ dùng để đổi thứ tự')

    await user.click(within(layout).getByRole('button', { name: 'Canh giữa' }))

    const form = within(screen.getByLabelText('Khung thiết kế')).getByRole('form', { name: 'Request a consultation' })
    expect(form).toHaveStyle({
      width: '100%', maxWidth: '720px', marginLeft: 'auto', marginRight: 'auto',
    })
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Hoàn tác' }))
    expect(form).not.toHaveStyle({ maxWidth: '720px' })
    await user.click(screen.getByRole('button', { name: 'Làm lại' }))
    expect(form).toHaveStyle({ maxWidth: '720px', marginLeft: 'auto', marginRight: 'auto' })

    await waitFor(() => expect(saveCommands).toHaveBeenCalled())
    expect(saveCommands.mock.calls[0]?.[3]).toEqual([expect.objectContaining({
      type: 'UPDATE_STYLE',
      nodeId: 'lead-form-1',
      patch: {
        width: 'full', maxWidth: 720, marginLeft: 'auto', marginRight: 'auto',
      },
    })])
  })

  it('applies all bounded Lead Form layouts to the selected viewport', async () => {
    const saveCommands = vi.fn<EditorApi['saveCommands']>((_projectId, _workspaceId, expectedVersion) => (
      Promise.resolve({ accepted: true, version: expectedVersion + 1 })
    ))
    const user = userEvent.setup()
    render(serverEditor(api({ saveCommands }), leadFormDocument()))

    await user.click(screen.getByRole('treeitem', { name: /^Biểu mẫu khách hàng: Request a consultation/ }))
    await user.selectOptions(screen.getByLabelText('Thiết bị xem trước'), 'mobile')
    const layout = screen.getByRole('group', { name: 'Bố cục biểu mẫu' })
    const form = within(screen.getByLabelText('Khung thiết kế')).getByRole('form', { name: 'Request a consultation' })

    await user.click(within(layout).getByRole('button', { name: 'Canh trái' }))
    expect(form).toHaveStyle({ maxWidth: '720px', marginLeft: '0px', marginRight: 'auto' })
    await user.click(within(layout).getByRole('button', { name: 'Canh phải' }))
    expect(form).toHaveStyle({ maxWidth: '720px', marginLeft: 'auto', marginRight: '0px' })
    await user.click(within(layout).getByRole('button', { name: 'Toàn chiều rộng' }))
    expect(form).toHaveStyle({ width: '100%', marginLeft: '0px', marginRight: '0px' })
    expect(form.style.maxWidth).toBe('')

    await waitFor(() => expect(saveCommands).toHaveBeenCalled())
    expect(saveCommands.mock.calls[0]?.[3][0]).toMatchObject({
      type: 'UPDATE_RESPONSIVE_STYLE', breakpoint: 'mobile', nodeId: 'lead-form-1',
    })
  })

  it('edits bounded Lead Form fields and sends one canonical UPDATE_PROPS command', async () => {
    const saveCommands = vi.fn<EditorApi['saveCommands']>((_projectId, _workspaceId, expectedVersion) => (
      Promise.resolve({ accepted: true, version: expectedVersion + 1 })
    ))
    const user = userEvent.setup()
    render(serverEditor(api({ saveCommands }), leadFormDocument()))

    await user.click(screen.getByRole('treeitem', { name: /^Biểu mẫu khách hàng: Request a consultation/ }))
    expect(screen.getByRole('heading', { name: 'Biểu mẫu khách hàng' })).toBeVisible()
    const builder = screen.getByRole('region', { name: 'Trình tạo biểu mẫu khách hàng' })
    expect(within(builder).getByRole('region', { name: 'Nội dung biểu mẫu' })).toBeVisible()
    expect(within(builder).getByRole('region', { name: 'Các trường thông tin' })).toBeVisible()
    expect(within(builder).getByRole('region', { name: 'Đồng ý liên hệ' })).toBeVisible()
    expect(within(builder).getByRole('group', { name: 'Hành động biểu mẫu' })).toContainElement(
      within(builder).getByRole('button', { name: 'Lưu biểu mẫu' }),
    )
    await user.clear(screen.getByLabelText('Tiêu đề biểu mẫu'))
    await user.type(screen.getByLabelText('Tiêu đề biểu mẫu'), 'Đăng ký tư vấn')
    await user.click(screen.getByRole('button', { name: 'Thêm trường' }))
    const fieldGroups = screen.getAllByRole('group', { name: /Trường / })
    const addedField = fieldGroups.at(-1)!
    await user.clear(within(addedField).getByLabelText('Khóa trường'))
    await user.type(within(addedField).getByLabelText('Khóa trường'), 'need')
    await user.clear(within(addedField).getByLabelText('Nhãn trường'))
    await user.type(within(addedField).getByLabelText('Nhãn trường'), 'Bạn cần gì?')
    await user.selectOptions(within(addedField).getByLabelText('Loại trường'), 'select')
    await user.click(within(addedField).getByRole('button', { name: 'Thêm lựa chọn' }))
    await user.clear(within(addedField).getByLabelText('Nhãn lựa chọn 2'))
    await user.type(within(addedField).getByLabelText('Nhãn lựa chọn 2'), 'Thiết kế website')
    await user.clear(within(addedField).getByLabelText('Giá trị lựa chọn 2'))
    await user.type(within(addedField).getByLabelText('Giá trị lựa chọn 2'), 'website')
    await user.click(screen.getByRole('checkbox', { name: 'Hiển thị đồng ý liên hệ' }))
    await user.click(screen.getByRole('button', { name: 'Lưu biểu mẫu' }))

    const canvas = screen.getByLabelText('Khung thiết kế')
    expect(within(canvas).getByRole('form', { name: 'Đăng ký tư vấn' })).toBeVisible()
    expect(within(canvas).getByRole('combobox', { name: 'Bạn cần gì?' })).toHaveTextContent('Thiết kế website')
    const consent = within(canvas).getByLabelText('Tôi đồng ý để ZenUI liên hệ')
    expect(consent).toBeVisible()
    await user.click(consent)
    expect(consent).toBeChecked()
    await waitFor(() => expect(saveCommands).toHaveBeenCalledTimes(1))
    expect(saveCommands.mock.calls[0]?.[3]).toEqual([
      expect.objectContaining({
        type: 'UPDATE_PROPS',
        nodeId: 'lead-form-1',
        patch: expect.objectContaining({
          title: 'Đăng ký tư vấn',
          fields: expect.arrayContaining([
            expect.objectContaining({ key: 'need', type: 'select', label: 'Bạn cần gì?' }),
          ]),
        }),
      }),
    ])
  })

  it('renders textarea, select and description-free Lead Form variants on Canvas', () => {
    const document = leadFormDocument()
    document.nodes['lead-form-1']!.props = {
      title: 'Tell us what you need',
      description: '',
      submitLabel: 'Continue',
      successCopy: 'Thank you.',
      fields: [
        { key: 'details', type: 'textarea', label: 'Details', required: false },
        {
          key: 'service', type: 'select', label: 'Service', required: true,
          options: [{ label: 'Website', value: 'website' }],
        },
      ],
    }

    render(serverEditor(api(), document))

    const canvas = screen.getByLabelText('Khung thiết kế')
    const form = within(canvas).getByRole('form', { name: 'Tell us what you need' })
    expect(within(form).getByRole('textbox', { name: 'Details' }).tagName).toBe('TEXTAREA')
    expect(within(form).getByRole('combobox', { name: 'Service' })).toHaveValue('website')
    expect(form).toHaveAttribute('aria-describedby', 'lead-form-1-preview-notice')
    expect(within(form).queryByText('Tell us how we can help.')).toBeNull()
  })

  it('rejects an invalid Lead Form draft without history or autosave changes', async () => {
    const saveCommands = vi.fn<EditorApi['saveCommands']>()
    const user = userEvent.setup()
    render(serverEditor(api({ saveCommands }), leadFormDocument()))

    await user.click(screen.getByRole('treeitem', { name: /^Biểu mẫu khách hàng: Request a consultation/ }))
    const firstField = screen.getAllByRole('group', { name: /Trường / })[0]!
    await user.clear(within(firstField).getByLabelText('Khóa trường'))
    await user.type(within(firstField).getByLabelText('Khóa trường'), 'tên khách')
    await user.click(screen.getByRole('button', { name: 'Lưu biểu mẫu' }))

    expect(screen.getByText(/Khóa trường chỉ dùng chữ cái ASCII/)).toHaveAttribute('role', 'alert')
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeDisabled()
    await new Promise(resolve => window.setTimeout(resolve, 150))
    expect(saveCommands).not.toHaveBeenCalled()
    expect(within(screen.getByLabelText('Khung thiết kế')).getByLabelText('Name')).toHaveAttribute('name', 'name')
  })

  it('keeps Lead Form field and select-option authoring at the public bounds', async () => {
    const user = userEvent.setup()
    render(serverEditor(api(), leadFormAtEditorLimits()))

    await user.click(screen.getByRole('treeitem', { name: /^Biểu mẫu khách hàng: Bounded form/ }))
    const builder = screen.getByRole('region', { name: 'Trình tạo biểu mẫu khách hàng' })
    expect(within(builder).getAllByRole('group', { name: /Trường / })).toHaveLength(DESIGN_LIMITS.maxLeadFormFields)
    expect(within(builder).getByRole('button', { name: 'Thêm trường' })).toBeDisabled()

    const selectField = within(builder).getByRole('group', { name: 'Trường 1' })
    expect(within(selectField).getAllByRole('textbox', { name: /Nhãn lựa chọn / })).toHaveLength(DESIGN_LIMITS.maxLeadSelectOptions)
    expect(within(selectField).getByRole('button', { name: 'Thêm lựa chọn' })).toBeDisabled()
  })

  it('edits textarea/select variants, consent requirements and option removal', async () => {
    const saveCommands = vi.fn<EditorApi['saveCommands']>((_projectId, _workspaceId, expectedVersion) => (
      Promise.resolve({ accepted: true, version: expectedVersion + 1 })
    ))
    const user = userEvent.setup()
    render(serverEditor(api({ saveCommands }), leadFormDocument()))

    await user.click(screen.getByRole('treeitem', { name: /^Biểu mẫu khách hàng: Request a consultation/ }))
    const firstField = screen.getByRole('group', { name: 'Trường 1' })
    await user.selectOptions(within(firstField).getByLabelText('Loại trường'), 'textarea')
    await user.selectOptions(within(firstField).getByLabelText('Loại trường'), 'select')
    await user.click(within(firstField).getByRole('button', { name: 'Thêm lựa chọn' }))
    await user.click(within(firstField).getByRole('button', { name: 'Xóa lựa chọn 2' }))
    await user.click(within(firstField).getByRole('checkbox', { name: 'Bắt buộc' }))

    await user.click(screen.getByRole('checkbox', { name: 'Hiển thị đồng ý liên hệ' }))
    await user.clear(screen.getByLabelText('Nội dung đồng ý'))
    await user.type(screen.getByLabelText('Nội dung đồng ý'), 'Tôi đồng ý nhận liên hệ')
    await user.click(screen.getByRole('checkbox', { name: 'Bắt buộc đồng ý' }))
    await user.click(screen.getByRole('button', { name: 'Lưu biểu mẫu' }))

    await waitFor(() => expect(saveCommands).toHaveBeenCalledTimes(1))
    const command = saveCommands.mock.calls[0]?.[3][0]
    expect(command).toMatchObject({
      type: 'UPDATE_PROPS',
      patch: expect.objectContaining({
        fields: expect.arrayContaining([
          expect.objectContaining({ key: 'name', type: 'select', required: false }),
        ]),
        consent: { label: 'Tôi đồng ý nhận liên hệ', required: true },
      }),
    })

    await user.click(screen.getByRole('checkbox', { name: 'Hiển thị đồng ý liên hệ' }))
    expect(screen.queryByLabelText('Nội dung đồng ý')).not.toBeInTheDocument()
  })

  it('reorders and deletes Lead Form fields before one bounded save', async () => {
    const saveCommands = vi.fn<EditorApi['saveCommands']>((_projectId, _workspaceId, expectedVersion) => (
      Promise.resolve({ accepted: true, version: expectedVersion + 1 })
    ))
    const user = userEvent.setup()
    render(serverEditor(api({ saveCommands }), leadFormDocument()))

    await user.click(screen.getByRole('treeitem', { name: /^Biểu mẫu khách hàng: Request a consultation/ }))
    await user.click(screen.getByRole('button', { name: 'Đưa trường 2 lên' }))
    expect(screen.getAllByRole('group', { name: /Trường / }).map(group => within(group).getByLabelText('Khóa trường'))[0]).toHaveValue('email')
    await user.click(screen.getByRole('button', { name: 'Xóa trường 2' }))
    await user.click(screen.getByRole('button', { name: 'Lưu biểu mẫu' }))

    await waitFor(() => expect(saveCommands).toHaveBeenCalledTimes(1))
    expect(saveCommands.mock.calls[0]?.[3]).toEqual([
      expect.objectContaining({
        type: 'UPDATE_PROPS',
        nodeId: 'lead-form-1',
        patch: expect.objectContaining({
          fields: [{ key: 'email', type: 'email', label: 'Email', required: true, placeholder: 'you@example.com' }],
        }),
      }),
    ])
    expect(within(screen.getByLabelText('Khung thiết kế')).queryByLabelText('Name')).toBeNull()
    expect(within(screen.getByLabelText('Khung thiết kế')).getByLabelText('Email')).toBeVisible()
  })

  it('duplicates, deletes, undoes and redoes a Lead Form without losing nested configuration', async () => {
    const user = userEvent.setup()
    render(serverEditor(api(), leadFormDocument()))

    await user.click(screen.getByRole('treeitem', { name: /^Biểu mẫu khách hàng: Request a consultation/ }))
    await user.click(screen.getByRole('button', { name: 'Nhân bản Biểu mẫu khách hàng' }))
    expect(screen.getAllByRole('form', { name: 'Request a consultation' })).toHaveLength(2)
    expect(screen.getAllByLabelText('Email')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Xóa Biểu mẫu khách hàng' }))
    await user.click(screen.getByRole('button', { name: 'Xác nhận xóa thành phần' }))
    expect(screen.getAllByRole('form', { name: 'Request a consultation' })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Hoàn tác' }))
    expect(screen.getAllByRole('form', { name: 'Request a consultation' })).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Làm lại' }))
    expect(screen.getAllByRole('form', { name: 'Request a consultation' })).toHaveLength(1)
  })

  it('authors typed external and Lead Form actions while keeping legacy nodes editable', async () => {
    const document = leadFormDocument()
    document.nodes['button-1']!.props = { text: 'Legacy button', href: '#legacy' }
    const saveCommands = vi.fn<EditorApi['saveCommands']>((_projectId, _workspaceId, expectedVersion) => (
      Promise.resolve({ accepted: true, version: expectedVersion + 1 })
    ))
    const user = userEvent.setup()
    render(serverEditor(api({ saveCommands }), document))

    await user.click(screen.getByRole('treeitem', { name: /^Nút: Legacy button/ }))
    expect(screen.getByLabelText('Loại hành động')).toHaveValue('external_url')
    expect(screen.getByLabelText('Liên kết ngoài')).toHaveValue('#legacy')
    await user.selectOptions(screen.getByLabelText('Loại hành động'), 'lead_form')
    expect(screen.getByLabelText('Biểu mẫu đích')).toHaveValue('lead-form-1')
    await user.click(screen.getByRole('button', { name: 'Lưu hành động' }))

    await waitFor(() => expect(saveCommands).toHaveBeenCalledTimes(1))
    expect(saveCommands.mock.calls[0]?.[3]).toEqual([
      expect.objectContaining({
        type: 'UPDATE_PROPS',
        nodeId: 'button-1',
        patch: {
          text: 'Legacy button',
          href: null,
          pageId: null,
          fragment: null,
          action: { type: 'lead_form', formNodeId: 'lead-form-1' },
        },
      }),
    ])
    expect(within(screen.getByLabelText('Khung thiết kế')).getByRole('link', { name: 'Legacy button' })).toHaveAttribute('href', '#lead-form-1')
  })

  it.each(canonicalActionCases)('authors the canonical $type action', async ({ type, field, value, expected }) => {
    const document = leadFormDocument()
    document.nodes['button-1']!.props = { text: 'Legacy button', href: '#legacy' }
    const saveCommands = vi.fn<EditorApi['saveCommands']>((_projectId, _workspaceId, expectedVersion) => (
      Promise.resolve({ accepted: true, version: expectedVersion + 1 })
    ))
    const user = userEvent.setup()
    render(serverEditor(api({ saveCommands }), document))

    await user.click(screen.getByRole('treeitem', { name: /^Nút: Legacy button/ }))
    await user.selectOptions(screen.getByLabelText('Loại hành động'), type)
    if (field && value) {
      await user.clear(screen.getByLabelText(field))
      await user.type(screen.getByLabelText(field), value)
    }
    await user.click(screen.getByRole('button', { name: 'Lưu hành động' }))

    await waitFor(() => expect(saveCommands).toHaveBeenCalledTimes(1))
    expect(saveCommands.mock.calls[0]?.[3]).toEqual([
      expect.objectContaining({
        type: 'UPDATE_PROPS',
        nodeId: 'button-1',
        patch: {
          text: 'Legacy button',
          href: null,
          pageId: null,
          fragment: null,
          action: expected,
        },
      }),
    ])
  })

  it('rejects an invalid typed action without changing history or autosave', async () => {
    const saveCommands = vi.fn<EditorApi['saveCommands']>()
    const document = leadFormDocument()
    document.nodes['button-1']!.props = { text: 'Legacy button', href: '#legacy' }
    const user = userEvent.setup()
    render(serverEditor(api({ saveCommands }), document))

    await user.click(screen.getByRole('treeitem', { name: /^Nút: Legacy button/ }))
    await user.selectOptions(screen.getByLabelText('Loại hành động'), 'email')
    await user.clear(screen.getByLabelText('Địa chỉ email'))
    await user.type(screen.getByLabelText('Địa chỉ email'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Lưu hành động' }))

    expect(screen.getByText(/Hành động chưa hợp lệ/)).toHaveAttribute('role', 'alert')
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeDisabled()
    await new Promise(resolve => window.setTimeout(resolve, 150))
    expect(saveCommands).not.toHaveBeenCalled()
    expect(within(screen.getByLabelText('Khung thiết kế')).getByRole('link', { name: 'Legacy button' })).toHaveAttribute('href', '#legacy')
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
