import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createValidDesignFixture, migrateDesignDocumentV1ToV2 } from '@zenui/design-schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  browserAiProposalApi,
  ContextualAi,
  PROPOSAL_POLL_TIMEOUT_MS,
  type AiProposalApi,
  type AiProposalSummary,
} from '../app/editor/ai-proposal-review'
import { EditorApp, type EditorApi } from '../app/editor/editor-app'

import type { AssetLibraryApi } from '../app/editor/asset-library-panel'
import type { DesignDocument } from '@zenui/design-schema'

const projectId = '55555555-5555-4555-8555-555555555555'
const workspaceId = '22222222-2222-4222-8222-222222222222'

function sectionDocument(): DesignDocument {
  const document = createValidDesignFixture()
  document.projectId = projectId
  document.nodes['section-1']!.props = { label: 'Features' }
  document.nodes['cta-section'] = {
    id: 'cta-section',
    type: 'section',
    parentId: 'page-root',
    children: [],
    props: { label: 'Start today' },
    style: { paddingTop: 64, paddingBottom: 64 },
    responsive: {},
  }
  document.nodes['page-root']!.children.push('cta-section')
  return document
}

function heroSlotDocument(): DesignDocument {
  const document = sectionDocument()
  document.nodes['container-1']!.children = ['heading-1', 'paragraph-1', 'image-1', 'button-1', 'hero-product-card']
  document.nodes['hero-product-card'] = {
    id: 'hero-product-card',
    type: 'feature-card',
    parentId: 'container-1',
    children: [],
    props: { title: 'Thực hành 100%', description: 'Áp dụng AI vào dự án thực tế.', mediaSlot: 'hero-image' },
    style: { width: 'full', aspectRatio: 'wide', backgroundColor: '#eef2ff' },
    responsive: {},
  }
  return document
}

function api(overrides: Partial<EditorApi> = {}): EditorApi {
  return {
    saveCommands: (_projectId, _workspaceId, expectedVersion) => Promise.resolve({ accepted: true, version: expectedVersion + 1 }),
    loadDocument: () => Promise.resolve({ version: 1, document: sectionDocument() }),
    listRevisions: () => Promise.resolve([]),
    createRevision: (_projectId, _workspaceId, summary) => Promise.resolve({ id: 'revision-1', documentVersion: 1, summary, source: 'manual', createdAt: new Date().toISOString() }),
    restoreRevision: () => Promise.resolve({ accepted: true, version: 2, document: { ...sectionDocument(), version: 2 } }),
    ...overrides,
  }
}

const readyProposal: AiProposalSummary = {
  id: '77777777-7777-4777-8777-777777777777',
  projectId,
  expectedVersion: 1,
  status: 'ready',
  action: 'request',
  scope: { kind: 'section', rootNodeId: 'section-1', sectionNodeId: 'section-1', label: 'Phần Features' },
  summary: 'Làm tiêu đề rõ ràng hơn',
  proposedDocument: (() => {
    const value = sectionDocument()
    value.version = 2
    value.nodes['heading-1']!.props = { text: 'AI proposal heading', level: 1 }
    return value
  })(),
  errorCode: null,
}

function proposalApi(overrides: Partial<AiProposalApi> = {}): AiProposalApi {
  return {
    create: () => Promise.resolve({ ...readyProposal, status: 'preparing', proposedDocument: null, summary: null }),
    subscribe: (_projectId, _workspaceId, _proposalId, onEvent) => {
      queueMicrotask(() => onEvent(readyProposal))
      return () => undefined
    },
    accept: () => Promise.resolve({ version: 2, revisionId: 'revision-ai', document: readyProposal.proposedDocument! }),
    discard: () => Promise.resolve({ ...readyProposal, status: 'discarded' }),
    cancel: () => Promise.resolve({ ...readyProposal, status: 'cancelled' }),
    ...overrides,
  }
}

function renderSimple(options: {
  api?: EditorApi
  proposalApi?: AiProposalApi
  assetApi?: AssetLibraryApi
  role?: 'owner' | 'editor' | 'viewer'
  document?: DesignDocument
} = {}) {
  const document = options.document ?? sectionDocument()
  return render(
    <EditorApp
      projectId={projectId}
      workspaceId={workspaceId}
      role={options.role ?? 'owner'}
      initialDocument={document}
      initialVersion={document.version}
      api={options.api ?? api()}
      proposalApi={options.proposalApi ?? proposalApi()}
      assetApi={options.assetApi ?? {
        list: () => Promise.resolve([]),
        upload: vi.fn(), search: vi.fn(), importResult: vi.fn(), createDerivative: vi.fn(), poll: vi.fn(),
      }}
    />,
  )
}

describe('Stage 6 section-first editor', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('uses the browser proposal adapter and reports malformed status events safely', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: readyProposal }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { version: 2, revisionId: 'revision-ai', document: readyProposal.proposedDocument } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { ...readyProposal, status: 'discarded' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { ...readyProposal, status: 'cancelled' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'stale_document_version' } }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: readyProposal }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'status_unavailable' } }), { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await browserAiProposalApi.create(projectId, {
      workspaceId, requestId: crypto.randomUUID(), action: 'request', prompt: 'Improve it', expectedVersion: 1,
    })).toMatchObject({ id: readyProposal.id })
    expect(await browserAiProposalApi.accept(projectId, workspaceId, readyProposal.id)).toMatchObject({ version: 2 })
    expect(await browserAiProposalApi.discard(projectId, workspaceId, readyProposal.id)).toMatchObject({ status: 'discarded' })
    expect(await browserAiProposalApi.cancel(projectId, workspaceId, readyProposal.id)).toMatchObject({ status: 'cancelled' })
    await expect(browserAiProposalApi.create(projectId, {
      workspaceId, requestId: crypto.randomUUID(), action: 'request', prompt: 'Improve it', expectedVersion: 1,
    })).rejects.toMatchObject({ code: 'stale_document_version' })

    const onEvent = vi.fn()
    const onError = vi.fn()
    const unsubscribe = browserAiProposalApi.subscribe(projectId, workspaceId, readyProposal.id, onEvent, onError)
    await waitFor(() => expect(onEvent).toHaveBeenCalledWith(readyProposal))
    unsubscribe()

    const unsubscribeFailed = browserAiProposalApi.subscribe(projectId, workspaceId, readyProposal.id, onEvent, onError)
    await waitFor(() => expect(onError).toHaveBeenCalledWith('connection'), { timeout: 2_000 })
    unsubscribeFailed()
    vi.unstubAllGlobals()
  })

  it('bounds proposal polling and lets the owner retry with the same prompt after timeout', async () => {
    vi.useFakeTimers()
    const preparing = { ...readyProposal, status: 'preparing' as const, proposedDocument: null, summary: null }
    const onEvent = vi.fn()
    const onError = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify({ data: preparing }), { status: 200 }),
    )))

    const unsubscribe = browserAiProposalApi.subscribe(projectId, workspaceId, preparing.id, onEvent, onError)
    for (let elapsed = 0; elapsed <= PROPOSAL_POLL_TIMEOUT_MS; elapsed += 500) {
      await vi.advanceTimersByTimeAsync(500)
    }

    expect(onEvent).toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith('timeout')
    const callsAtTimeout = vi.mocked(fetch).mock.calls.length
    await vi.advanceTimersByTimeAsync(2_000)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(callsAtTimeout)
    unsubscribe()
  })

  it('resets a timed-out proposal when cancellation is already terminal', async () => {
    const preparing = { ...readyProposal, status: 'preparing' as const, proposedDocument: null, summary: null }
    const cancel = vi.fn<AiProposalApi['cancel']>().mockRejectedValue(Object.assign(new Error('missing'), { code: 'not_found' }))
    const user = userEvent.setup()
    render(<ContextualAi
      projectId={projectId}
      workspaceId={workspaceId}
      expectedVersion={1}
      selectedNodeId="section-1"
      scopeLabel="Phần Announcement"
      acceptedDocument={sectionDocument()}
      viewport="desktop"
      assetOrigin="http://127.0.0.1:3002"
      canSubmit
      api={proposalApi({
        create: vi.fn().mockResolvedValue(preparing), cancel,
        subscribe: (_projectId, _workspaceId, _proposalId, _onEvent, onError) => {
          queueMicrotask(() => onError?.('timeout'))
          return () => undefined
        },
      })}
      onAccepted={vi.fn()}
    />)

    await user.type(screen.getByLabelText('Bạn muốn cải thiện điều gì?'), 'Ngắn gọn hơn')
    await user.click(screen.getByRole('button', { name: 'Đề xuất thay đổi' }))
    expect(await screen.findByRole('button', { name: 'Hủy và thử lại' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Hủy và thử lại' }))
    await waitFor(() => expect(cancel).toHaveBeenCalled())
    expect(screen.getByLabelText('Bạn muốn cải thiện điều gì?')).toHaveValue('Ngắn gọn hơn')
    expect(screen.queryByText('Không thể hủy đề xuất lúc này.')).toBeNull()
  })

  it('shows an actionable terminal proposal failure without exposing an accept action', async () => {
    const failed = {
      ...readyProposal,
      status: 'failed' as const,
      proposedDocument: null,
      summary: null,
      errorCode: 'provider_timeout',
    }
    const cancel = vi.fn<AiProposalApi['cancel']>().mockResolvedValue({ ...failed, status: 'cancelled' })
    const create = vi.fn<AiProposalApi['create']>().mockResolvedValue({
      ...readyProposal, status: 'preparing', proposedDocument: null, summary: null,
    })
    const user = userEvent.setup()
    render(<ContextualAi
      projectId={projectId}
      workspaceId={workspaceId}
      expectedVersion={1}
      selectedNodeId="section-1"
      scopeLabel="Phần Announcement"
      acceptedDocument={sectionDocument()}
      viewport="desktop"
      assetOrigin="http://127.0.0.1:3002"
      canSubmit
      api={proposalApi({
        create,
        cancel,
        subscribe: (_projectId, _workspaceId, _proposalId, onEvent) => {
          queueMicrotask(() => onEvent(failed))
          return () => undefined
        },
      })}
      onAccepted={vi.fn()}
    />)

    await user.type(screen.getByLabelText('Bạn muốn cải thiện điều gì?'), 'Ngắn gọn hơn')
    await user.click(screen.getByRole('button', { name: 'Đề xuất thay đổi' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Dịch vụ AI tạm thời chưa sẵn sàng')
    expect(screen.queryByRole('button', { name: 'Chấp nhận thay đổi' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Thử lại yêu cầu' }))
    expect(screen.getByLabelText('Bạn muốn cải thiện điều gì?')).toHaveValue('Ngắn gọn hơn')
    expect(screen.getByText(/Đang chỉnh:/).closest('p')).toHaveTextContent('Phần Announcement')
  })

  it('opens accepted production projects in Simple mode with ordered Page Story', async () => {
    renderSimple()

    expect(await screen.findByRole('heading', { name: 'Câu chuyện trang' })).toBeVisible()
    const story = screen.getByRole('navigation', { name: 'Câu chuyện trang' })
    expect(story).toHaveTextContent('Giải thích giá trị')
    expect(story).toHaveTextContent('Features')
    expect(story).toHaveTextContent('Mời hành động')
    expect(story).toHaveTextContent('Start today')
    expect(screen.queryByRole('heading', { name: 'Thành phần' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Viết lại' })).toBeNull()
    expect(screen.getByText(/Đang chỉnh:/).closest('p')).toHaveTextContent('Đang chỉnh: Phần Features')
  })

  it('keeps section actions in the blue toolbar attached to the selected Canvas section', async () => {
    const user = userEvent.setup()
    renderSimple()

    await user.click(await screen.findByRole('button', { name: 'Chọn Start today — Mời hành động' }))

    const selectedSection = screen.getByLabelText('Khung thiết kế').querySelector<HTMLElement>('[data-node-id="cta-section"]')
    expect(selectedSection).not.toBeNull()
    const toolbar = selectedSection!.querySelector<HTMLElement>('.node-actions')
    expect(toolbar).not.toBeNull()
    expect(within(toolbar!).queryByRole('button', { name: 'Viết lại' })).toBeNull()
    expect(within(toolbar!).queryByRole('button', { name: 'Thử bố cục khác' })).toBeNull()
    expect(within(toolbar!).queryByRole('button', { name: 'Ẩn section' })).toBeNull()
    const controls = within(toolbar!).getAllByRole('button')
    expect(controls.map(control => control.getAttribute('aria-label'))).toEqual([
      'Chọn Start today',
      'Kéo Start today',
      'Di chuyển Start today lên',
      'Di chuyển Start today xuống',
      'Nhân bản Start today',
      'Xóa Start today',
    ])
    expect(within(toolbar!).getByRole('button', { name: 'Kéo Start today' })).toBeEnabled()
    expect(within(toolbar!).getByRole('button', { name: 'Di chuyển Start today lên' })).toBeEnabled()
    expect(within(toolbar!).getByRole('button', { name: 'Di chuyển Start today xuống' })).toBeDisabled()
    expect(within(toolbar!).getByRole('button', { name: 'Nhân bản Start today' })).toBeEnabled()
    expect(within(toolbar!).getByRole('button', { name: 'Xóa Start today' })).toBeEnabled()
    expect(within(toolbar!).getAllByText('Start today')).toHaveLength(1)
    expect(screen.queryByLabelText('Thao tác section')).toBeNull()
  })

  it('selects and edits a Canvas component directly in Simple mode without depending on AI', async () => {
    const saveCommands = vi.fn<EditorApi['saveCommands']>((_projectId, _workspaceId, expectedVersion) => (
      Promise.resolve({ accepted: true, version: expectedVersion + 1 })
    ))
    const user = userEvent.setup()
    renderSimple({ api: api({ saveCommands }) })

    const canvas = screen.getByLabelText('Khung thiết kế')
    await user.click(within(canvas).getByRole('heading', { name: 'Build your next product' }))

    const selectedHeading = canvas.querySelector<HTMLElement>('[data-node-id="heading-1"]')
    const toolbar = selectedHeading?.querySelector<HTMLElement>(':scope > .node-actions')
    expect(toolbar).not.toBeNull()
    expect(within(toolbar!).getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual([
      'Chọn Build your next product',
      'Kéo Build your next product',
      'Di chuyển Build your next product lên',
      'Di chuyển Build your next product xuống',
      'Nhân bản Build your next product',
      'Xóa Build your next product',
    ])

    const manualEditor = screen.getByRole('region', { name: 'Chỉnh sửa trực tiếp' })
    expect(within(manualEditor).getByRole('heading', { name: 'Thiết kế' })).toBeVisible()
    expect(within(manualEditor).getByRole('textbox', { name: 'Nội dung' })).toHaveValue('Build your next product')
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeDisabled()
    await new Promise(resolve => window.setTimeout(resolve, 150))
    expect(saveCommands).not.toHaveBeenCalled()

    fireEvent.change(within(manualEditor).getByRole('textbox', { name: 'Nội dung' }), {
      target: { value: 'Sửa tay khi AI không sẵn sàng' },
    })

    expect(within(canvas).getByRole('heading', { name: 'Sửa tay khi AI không sẵn sàng' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeEnabled()
    await waitFor(() => expect(saveCommands).toHaveBeenCalled())
    expect(saveCommands.mock.calls.at(-1)?.[3]).toEqual([
      expect.objectContaining({
        type: 'UPDATE_PROPS',
        nodeId: 'heading-1',
        patch: { text: 'Sửa tay khi AI không sẵn sàng' },
      }),
    ])
    expect(screen.getByText(/Đang chỉnh:/).closest('p')).toHaveTextContent('Phần Features')
  })

  it('keeps manual Simple editing available after an AI proposal fails', async () => {
    const failed = {
      ...readyProposal,
      status: 'failed' as const,
      proposedDocument: null,
      summary: null,
      errorCode: 'provider_timeout',
    }
    const saveCommands = vi.fn<EditorApi['saveCommands']>((_projectId, _workspaceId, expectedVersion) => (
      Promise.resolve({ accepted: true, version: expectedVersion + 1 })
    ))
    const user = userEvent.setup()
    renderSimple({
      api: api({ saveCommands }),
      proposalApi: proposalApi({
        subscribe: (_projectId, _workspaceId, _proposalId, onEvent) => {
          queueMicrotask(() => onEvent(failed))
          return () => undefined
        },
      }),
    })

    await user.type(await screen.findByLabelText('Bạn muốn cải thiện điều gì?'), 'Viết lại phần này ngắn gọn hơn')
    await user.click(screen.getByRole('button', { name: 'Đề xuất thay đổi' }))
    expect(await screen.findByText(/Dịch vụ AI tạm thời chưa sẵn sàng/)).toBeVisible()

    const canvas = screen.getByLabelText('Khung thiết kế')
    await user.click(within(canvas).getByRole('heading', { name: 'Build your next product' }))
    const manualEditor = screen.getByRole('region', { name: 'Chỉnh sửa trực tiếp' })
    fireEvent.change(within(manualEditor).getByRole('textbox', { name: 'Nội dung' }), {
      target: { value: 'Nội dung sửa tay sau lỗi AI' },
    })

    expect(within(canvas).getByRole('heading', { name: 'Nội dung sửa tay sau lỗi AI' })).toBeVisible()
    await waitFor(() => expect(saveCommands).toHaveBeenCalledTimes(1))
  })

  it('routes contextual image replacement from the exact Simple-mode image target', async () => {
    const create = vi.fn<AiProposalApi['create']>().mockResolvedValue({
      ...readyProposal,
      status: 'preparing',
      proposedDocument: null,
      summary: null,
      intent: 'replace-media',
      scope: { kind: 'element', rootNodeId: 'image-1', sectionNodeId: 'section-1', label: 'Hình ảnh trong Phần Features' },
    })
    const user = userEvent.setup()
    renderSimple({ proposalApi: proposalApi({ create }) })

    const canvas = await screen.findByLabelText('Khung thiết kế')
    await user.click(within(canvas).getByRole('button', { name: 'Chọn Hình ảnh' }))
    expect(screen.getByText(/Đang chỉnh:/).closest('p')).toHaveTextContent('Hình ảnh')
    expect(screen.getByRole('button', { name: 'Tạo ảnh phù hợp bằng AI' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Tạo ảnh phù hợp bằng AI' }))
    await user.click(screen.getByRole('button', { name: 'Đề xuất thay đổi' }))

    expect(create).toHaveBeenCalledWith(projectId, expect.objectContaining({
      intent: 'replace-media',
      selectedNodeId: 'image-1',
      prompt: expect.stringMatching(/ảnh/i),
    }))
  })

  it('renders current and proposed owned images in the comparison dialog', async () => {
    const currentAssetId = '33333333-3333-4333-8333-333333333333'
    const proposedAssetId = '44444444-4444-4444-8444-444444444444'
    const current = sectionDocument()
    current.nodes['image-1']!.props = { assetId: currentAssetId, alt: 'Current Hero', decorative: false }
    const proposed = structuredClone(current)
    proposed.version = 2
    proposed.nodes['image-1']!.props = { assetId: proposedAssetId, alt: 'Proposed Hero', decorative: false }
    const mediaProposal: AiProposalSummary = {
      ...readyProposal,
      intent: 'replace-media',
      scope: { kind: 'element', rootNodeId: 'image-1', sectionNodeId: 'section-1', label: 'Hình ảnh trong Phần Hero' },
      proposedDocument: proposed,
    }
    const user = userEvent.setup()
    renderSimple({
      document: current,
      proposalApi: proposalApi({
        subscribe: (_projectId, _workspaceId, _proposalId, onEvent) => {
          queueMicrotask(() => onEvent(mediaProposal))
          return () => undefined
        },
      }),
    })

    const canvas = await screen.findByLabelText('Khung thiết kế')
    await user.click(within(canvas).getByRole('button', { name: 'Chọn Hình ảnh' }))
    await user.click(screen.getByRole('button', { name: 'Tạo ảnh phù hợp bằng AI' }))
    await user.click(screen.getByRole('button', { name: 'Đề xuất thay đổi' }))
    await user.click(await screen.findByRole('button', { name: 'So sánh nội dung cũ và mới' }))

    const currentPreview = screen.getByRole('region', { name: 'Website hiện tại' })
    const proposedPreview = screen.getByRole('region', { name: 'Website được đề xuất' })
    expect(within(currentPreview).getByRole('img', { name: 'Current Hero' })).toHaveAttribute(
      'src', `http://127.0.0.1:3002/a/${currentAssetId}`,
    )
    expect(within(proposedPreview).getByRole('img', { name: 'Proposed Hero' })).toHaveAttribute(
      'src', `http://127.0.0.1:3002/a/${proposedAssetId}`,
    )
  })

  it('roots a replaced feature-card preview at its proposed image subtree', async () => {
    const proposedAssetId = '44444444-4444-4444-8444-444444444444'
    const current = heroSlotDocument()
    const proposed = structuredClone(current)
    proposed.version = 2
    proposed.nodes['container-1']!.children = proposed.nodes['container-1']!.children.map(nodeId => (
      nodeId === 'hero-product-card' ? 'generated-feature-image' : nodeId
    ))
    delete proposed.nodes['hero-product-card']
    proposed.nodes['generated-feature-image'] = {
      id: 'generated-feature-image',
      type: 'image',
      parentId: 'container-1',
      children: [],
      props: { assetId: proposedAssetId, alt: 'Generated course feature', decorative: false },
      style: { width: 'full', aspectRatio: 'wide', objectFit: 'cover' },
      responsive: {},
    }
    const mediaProposal: AiProposalSummary = {
      ...readyProposal,
      intent: 'replace-media',
      scope: {
        kind: 'element',
        rootNodeId: 'hero-product-card',
        sectionNodeId: 'section-1',
        label: 'Nội dung trong Phần Features',
      },
      proposedDocument: proposed,
    }
    const user = userEvent.setup()
    render(<ContextualAi
      projectId={projectId}
      workspaceId={workspaceId}
      expectedVersion={1}
      selectedNodeId="hero-product-card"
      scopeLabel="Thẻ tiện ích"
      acceptedDocument={current}
      viewport="desktop"
      assetOrigin="http://127.0.0.1:3002"
      canSubmit
      initialPrompt="Tạo ảnh phù hợp bằng AI"
      initialIntent="replace-media"
      api={proposalApi({
        subscribe: (_projectId, _workspaceId, _proposalId, onEvent) => {
          queueMicrotask(() => onEvent(mediaProposal))
          return () => undefined
        },
      })}
      onAccepted={vi.fn()}
    />)

    await user.click(screen.getByRole('button', { name: 'Đề xuất thay đổi' }))
    await user.click(await screen.findByRole('button', { name: 'So sánh nội dung cũ và mới' }))

    const proposedPreview = screen.getByRole('region', { name: 'Website được đề xuất' })
    expect(proposedPreview).toHaveAttribute('data-render-root-id', 'generated-feature-image')
    expect(within(proposedPreview).getByRole('img', { name: 'Generated course feature' })).toHaveAttribute(
      'src', `http://127.0.0.1:3002/a/${proposedAssetId}`,
    )
  })

  it('makes the Hero image slot discoverable and replaces only the explicitly selected target', async () => {
    const saveCommands = vi.fn<EditorApi['saveCommands']>((_projectId, _workspaceId, expectedVersion) => (
      Promise.resolve({ accepted: true, version: expectedVersion + 1 })
    ))
    const user = userEvent.setup()
    const readyAsset = {
      id: '33333333-3333-4333-8333-333333333333', scope: 'project' as const,
      status: 'ready' as const, source: 'upload' as const, width: 1200, height: 675,
      bytes: 1024, contentType: 'image/webp' as const, defaultAlt: 'Product dashboard',
      attribution: null, errorCode: null, archived: false,
      createdAt: '2026-07-31T00:00:00.000Z', updatedAt: '2026-07-31T00:00:00.000Z',
    }
    renderSimple({
      document: heroSlotDocument(),
      api: api({ saveCommands }),
      assetApi: {
        list: () => Promise.resolve([readyAsset]),
        upload: vi.fn(), search: vi.fn(), importResult: vi.fn(), createDerivative: vi.fn(), poll: vi.fn(),
      },
    })

    expect(await screen.findByRole('button', { name: 'Thêm ảnh Hero' })).toBeVisible()
    expect(screen.getByText('Chọn vùng Thêm ảnh hoặc Thay ảnh trên website trước.')).toBeVisible()
    expect(screen.getByText(/JPEG, PNG hoặc WebP/)).toHaveTextContent('1200×675')

    await user.click(screen.getByRole('button', { name: 'Thêm ảnh Hero' }))
    expect(screen.getByText('Đang thêm ảnh Hero')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeDisabled()
    expect(saveCommands).not.toHaveBeenCalled()

    const assetButton = await screen.findByRole('button', { name: /Product dashboard/ })
    await user.click(assetButton)
    await user.click(screen.getByRole('button', { name: 'Dùng ảnh đã chọn' }))

    expect(screen.getByLabelText('Khung thiết kế').querySelector('[data-node-type="image"]')).not.toBeNull()
    expect(within(screen.getByLabelText('Khung thiết kế')).getAllByRole('button', { name: 'Thay ảnh' })).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeEnabled()
    await waitFor(() => expect(saveCommands).toHaveBeenCalled())
    expect(saveCommands.mock.calls.at(-1)?.[3]).toEqual([
      expect.objectContaining({
        type: 'REPLACE_SUBTREE',
        nodeId: 'hero-product-card',
        rootNodeId: expect.stringMatching(/^hero-image-/),
        nodes: [expect.objectContaining({
          type: 'image',
          props: { assetId: expect.any(String), alt: 'Product dashboard', decorative: false },
        })],
      }),
    ])
  })

  it('does not silently target the first image and keeps image controls read-only for viewers', async () => {
    const user = userEvent.setup()
    renderSimple()

    expect(await screen.findByText('Chọn vùng Thêm ảnh hoặc Thay ảnh trên website trước.')).toBeVisible()
    const existingImage = screen.getByLabelText('Khung thiết kế').querySelector('[data-node-type="image"]')
    expect(existingImage).not.toBeNull()
    expect(screen.queryByText('Đang thay ảnh')).toBeNull()

    await user.click(existingImage!)
    expect(screen.getByText('Đang thay ảnh')).toBeVisible()

    cleanup()
    renderSimple({ role: 'viewer', document: heroSlotDocument() })
    expect(await screen.findByLabelText('Khung thiết kế')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Thêm ảnh Hero' })).toBeNull()
    expect(screen.queryByLabelText('Tải ảnh của bạn')).toBeNull()
  })

  it('keeps direct Simple editing read-only for viewers', async () => {
    const user = userEvent.setup()
    renderSimple({ role: 'viewer' })

    const canvas = screen.getByLabelText('Khung thiết kế')
    await user.click(within(canvas).getByRole('heading', { name: 'Build your next product' }))

    expect(screen.queryByRole('region', { name: 'Chỉnh sửa trực tiếp' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Nội dung' })).toBeNull()
    expect(screen.getByRole('complementary', { name: 'Chỉnh sửa section' })).toHaveTextContent('Bạn đang xem ở chế độ chỉ đọc.')
  })

  it('opens the Simple manual editor from the narrow toolbar and restores focus', async () => {
    const user = userEvent.setup()
    renderSimple()

    const canvas = screen.getByLabelText('Khung thiết kế')
    await user.click(within(canvas).getByRole('heading', { name: 'Build your next product' }))
    const editButton = screen.getByRole('button', { name: 'Chỉnh sửa' })
    editButton.focus()
    await user.click(editButton)

    const dialog = screen.getByRole('dialog', { name: 'Chỉnh sửa trực tiếp' })
    expect(within(dialog).getByRole('textbox', { name: 'Nội dung' })).toHaveValue('Build your next product')
    expect(screen.getByRole('button', { name: 'Đóng bảng' })).toHaveFocus()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(editButton).toHaveFocus())
    expect(screen.queryByRole('dialog', { name: 'Chỉnh sửa trực tiếp' })).toBeNull()
  })

  it('creates, switches and manages pages through autosaved commands', async () => {
    const document = migrateDesignDocumentV1ToV2(sectionDocument())
    const saveCommands = vi.fn<EditorApi['saveCommands']>((_projectId, _workspaceId, expectedVersion) => (
      Promise.resolve({ accepted: true, version: expectedVersion + 1 })
    ))
    const user = userEvent.setup()
    render(<EditorApp
      projectId={projectId}
      workspaceId={workspaceId}
      initialDocument={document}
      initialVersion={document.version}
      api={api({ saveCommands })}
    />)

    await user.click(screen.getByRole('button', { name: 'Quản lý trang' }))
    expect(await screen.findByRole('heading', { name: 'Quản lý Trang' })).toBeVisible()
    await user.type(screen.getByLabelText('Tên trang mới'), 'About')
    await user.type(screen.getByLabelText('Đường dẫn trang mới'), 'About Us')
    await user.click(screen.getByRole('button', { name: 'Thêm trang' }))

    await waitFor(() => expect(saveCommands).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: /About \/about-us/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByLabelText('Khung thiết kế')).not.toHaveTextContent('Build your next product')

    await user.click(screen.getByRole('button', { name: /Home \// }))
    expect(screen.getByLabelText('Khung thiết kế')).toHaveTextContent('Build your next product')
    expect(saveCommands).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Nhân bản About' }))
    await waitFor(() => expect(saveCommands).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('button', { name: /About bản sao \/about-us-copy-/ })).toBeVisible()
  })

  it('edits navigation labels and order with autosaved page commands', async () => {
    const document = migrateDesignDocumentV1ToV2(sectionDocument())
    document.nodes['about-root'] = { id: 'about-root', type: 'page', parentId: null, children: [], props: {}, style: {}, responsive: {} }
    document.pages.push({ id: 'about', name: 'About', slug: '/about', rootNodeId: 'about-root' })
    document.navigation.items.push({ pageId: 'about', label: 'About' })
    const saveCommands = vi.fn<EditorApi['saveCommands']>((_projectId, _workspaceId, expectedVersion) => (
      Promise.resolve({ accepted: true, version: expectedVersion + 1 })
    ))
    const user = userEvent.setup()
    render(<EditorApp
      projectId={projectId}
      workspaceId={workspaceId}
      initialDocument={document}
      initialVersion={document.version}
      api={api({ saveCommands })}
    />)

    await user.click(screen.getByRole('button', { name: 'Quản lý trang' }))
    await user.clear(await screen.findByLabelText('Nhãn điều hướng About'))
    await user.type(screen.getByLabelText('Nhãn điều hướng About'), 'Về chúng tôi')
    await user.click(screen.getByRole('button', { name: 'Lưu nhãn About' }))
    await waitFor(() => expect(saveCommands).toHaveBeenCalledTimes(1))
    expect(saveCommands.mock.calls[0]?.[3]).toEqual([
      expect.objectContaining({ type: 'UPDATE_NAVIGATION', items: expect.arrayContaining([
        { pageId: 'about', label: 'Về chúng tôi' },
      ]) }),
    ])

    await user.click(screen.getByRole('button', { name: 'Đưa About lên trong điều hướng' }))
    await waitFor(() => expect(saveCommands).toHaveBeenCalledTimes(2))
    expect(saveCommands.mock.calls[1]?.[3]).toEqual([
      expect.objectContaining({
        type: 'UPDATE_NAVIGATION',
        items: [
          { pageId: 'about', label: 'Về chúng tôi' },
          expect.objectContaining({ pageId: 'home' }),
        ],
      }),
    ])
  })

  it('shows exact scoped proposal changes without mutation and applies only after acceptance', async () => {
    const saveCommands = vi.fn<EditorApi['saveCommands']>()
    const accept = vi.fn<AiProposalApi['accept']>().mockResolvedValue({
      version: 2, revisionId: 'revision-ai', document: readyProposal.proposedDocument!,
    })
    const user = userEvent.setup()
    renderSimple({ api: api({ saveCommands }), proposalApi: proposalApi({ accept }) })

    await user.type(await screen.findByLabelText('Bạn muốn cải thiện điều gì?'), 'Viết lại phần này ngắn gọn hơn')
    await user.click(screen.getByRole('button', { name: 'Đề xuất thay đổi' }))
    expect(await screen.findByRole('heading', { name: 'Kiểm tra thay đổi được đề xuất' })).toBeVisible()

    const compareButton = screen.getByRole('button', { name: 'So sánh nội dung cũ và mới' })
    expect(screen.queryByRole('dialog', { name: 'So sánh nội dung cũ và mới' })).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Tóm tắt thay đổi' })).toHaveTextContent('Build your next product')
    expect(screen.getByRole('list', { name: 'Tóm tắt thay đổi' })).toHaveTextContent('AI proposal heading')

    await user.click(compareButton)
    const dialog = screen.getByRole('dialog', { name: 'So sánh nội dung cũ và mới' })
    expect(dialog).toBeVisible()
    const closeButton = screen.getByRole('button', { name: 'Đóng so sánh' })
    await waitFor(() => expect(closeButton).toHaveFocus())
    const currentTab = screen.getByRole('tab', { name: 'Xem hiện tại' })
    const proposedTab = screen.getByRole('tab', { name: 'Xem đề xuất' })
    expect(proposedTab).toHaveAttribute('aria-selected', 'true')
    expect(currentTab).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('region', { name: 'Website được đề xuất' })).toHaveAttribute('data-render-root-id', 'section-1')
    expect(screen.getByRole('region', { name: 'Website được đề xuất' })).toHaveTextContent('AI proposal heading')
    expect(screen.getByRole('list', { name: 'Chi tiết thay đổi' })).toHaveTextContent('Build your next product')
    expect(screen.getByRole('list', { name: 'Chi tiết thay đổi' })).toHaveTextContent('AI proposal heading')

    const lastDialogLink = dialog.querySelectorAll<HTMLAnchorElement>('a').item(
      dialog.querySelectorAll('a').length - 1,
    )
    lastDialogLink.focus()
    await user.keyboard('{Tab}')
    expect(closeButton).toHaveFocus()
    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(lastDialogLink).toHaveFocus()

    await user.click(currentTab)
    expect(currentTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('region', { name: 'Website hiện tại' })).toHaveTextContent('Build your next product')
    expect(accept).not.toHaveBeenCalled()
    expect(saveCommands).not.toHaveBeenCalled()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'So sánh nội dung cũ và mới' })).not.toBeInTheDocument()
    expect(compareButton).toHaveFocus()

    await user.click(compareButton)
    fireEvent.mouseDown(screen.getByTestId('comparison-backdrop'))
    expect(screen.queryByRole('dialog', { name: 'So sánh nội dung cũ và mới' })).not.toBeInTheDocument()
    expect(compareButton).toHaveFocus()

    await user.click(compareButton)
    await user.click(screen.getByRole('button', { name: 'Đóng so sánh' }))
    expect(screen.queryByRole('dialog', { name: 'So sánh nội dung cũ và mới' })).not.toBeInTheDocument()
    expect(compareButton).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Chấp nhận thay đổi' }))
    expect(accept).toHaveBeenCalledWith(projectId, workspaceId, readyProposal.id)
    expect(await screen.findByRole('heading', { name: 'AI proposal heading' })).toBeVisible()
    expect(saveCommands).not.toHaveBeenCalled()
  })

  it('discards and refines proposals without changing accepted history or autosave', async () => {
    const saveCommands = vi.fn<EditorApi['saveCommands']>()
    const discard = vi.fn<AiProposalApi['discard']>().mockResolvedValue({ ...readyProposal, status: 'discarded' })
    const create = vi.fn<AiProposalApi['create']>().mockResolvedValue({ ...readyProposal, status: 'preparing', proposedDocument: null, summary: null })
    const user = userEvent.setup()
    renderSimple({ api: api({ saveCommands }), proposalApi: proposalApi({ discard, create }) })

    await user.type(await screen.findByLabelText('Bạn muốn cải thiện điều gì?'), 'Viết lại phần này ngắn gọn hơn')
    await user.click(screen.getByRole('button', { name: 'Đề xuất thay đổi' }))
    await screen.findByRole('heading', { name: 'Kiểm tra thay đổi được đề xuất' })
    await user.click(screen.getByRole('button', { name: 'Tinh chỉnh' }))
    await user.type(screen.getByLabelText('Điều chỉnh đề xuất'), 'Ngắn hơn nữa')
    await user.click(screen.getByRole('button', { name: 'Tạo đề xuất tinh chỉnh' }))
    expect(create).toHaveBeenLastCalledWith(projectId, expect.objectContaining({
      action: 'refine', previousProposalId: readyProposal.id, prompt: 'Ngắn hơn nữa',
    }))
    expect(saveCommands).not.toHaveBeenCalled()
    await screen.findByRole('heading', { name: 'Kiểm tra thay đổi được đề xuất' })

    await user.click(screen.getByRole('button', { name: 'Bỏ đề xuất' }))
    expect(discard).toHaveBeenCalled()
    expect(screen.getAllByRole('heading', { name: 'Build your next product' })).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeDisabled()
    expect(saveCommands).not.toHaveBeenCalled()
  })

  it('round-trips Simple and Advanced without mutating history or autosaving', async () => {
    const saveCommands = vi.fn<EditorApi['saveCommands']>((_projectId, _workspaceId, expectedVersion) => (
      Promise.resolve({ accepted: true, version: expectedVersion + 1 })
    ))
    const user = userEvent.setup()
    renderSimple({ api: api({ saveCommands }) })

    await user.selectOptions(await screen.findByLabelText('Thiết bị xem trước'), 'mobile')
    await user.click(screen.getByRole('button', { name: 'Mở điều khiển nâng cao' }))
    expect(screen.getByRole('dialog', { name: 'Mở điều khiển nâng cao?' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Xác nhận mở nâng cao' }))

    expect(screen.getByRole('tab', { name: 'Lớp' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tree', { name: 'Lớp' })).toBeVisible()
    expect(screen.getByLabelText('Thiết bị xem trước')).toHaveValue('mobile')
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Quay lại chế độ đơn giản' }))
    expect(screen.getByRole('heading', { name: 'Câu chuyện trang' })).toBeVisible()
    expect(screen.getByLabelText('Thiết bị xem trước')).toHaveValue('mobile')
    expect(saveCommands).not.toHaveBeenCalled()
  })

  it('reorders and duplicates a section through autosaved commands', async () => {
    const saveCommands = vi.fn<EditorApi['saveCommands']>((_projectId, _workspaceId, expectedVersion) => (
      Promise.resolve({ accepted: true, version: expectedVersion + 1 })
    ))
    const user = userEvent.setup()
    renderSimple({ api: api({ saveCommands }) })

    await user.click(await screen.findByRole('button', { name: 'Chọn Start today — Mời hành động' }))
    await user.click(screen.getByRole('button', { name: 'Di chuyển Start today lên' }))
    await waitFor(() => expect(saveCommands).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: 'Nhân bản Start today' }))
    await waitFor(() => expect(saveCommands).toHaveBeenCalledTimes(2))
    expect(screen.getAllByRole('button', { name: 'Chọn Start today — Mời hành động' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Ẩn section' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Thử bố cục khác' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeEnabled()
  })

  it('opens mutually exclusive narrow sheets and restores focus on Escape', async () => {
    const user = userEvent.setup()
    renderSimple()

    const storyButton = await screen.findByRole('button', { name: 'Câu chuyện' })
    storyButton.focus()
    await user.click(storyButton)
    expect(screen.getByRole('dialog', { name: 'Câu chuyện trang' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Đóng bảng' })).toHaveFocus()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(storyButton).toHaveFocus())
    expect(screen.queryByRole('dialog', { name: 'Câu chuyện trang' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Thêm thao tác' }))
    expect(screen.getByRole('dialog', { name: 'Thêm thao tác' })).toBeVisible()
    expect(screen.queryByRole('dialog', { name: 'Câu chuyện trang' })).toBeNull()
  })

  it('confirms deletion, protects the last section and keeps viewers read-only', async () => {
    const user = userEvent.setup()
    renderSimple()

    await user.click(await screen.findByRole('button', { name: 'Chọn Start today — Mời hành động' }))
    await user.click(screen.getByRole('button', { name: 'Xóa Start today' }))
    expect(screen.getByRole('dialog', { name: 'Xóa section?' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Xác nhận xóa section' }))
    expect(screen.queryByRole('button', { name: 'Chọn Start today — Mời hành động' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Xóa Features' })).toBeDisabled()

    cleanup()
    renderSimple({ role: 'viewer' })
    expect(await screen.findByRole('button', { name: 'Kéo Features' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Thử bố cục khác' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Nhân bản Features' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Xóa Features' })).toBeDisabled()
  })
})
