import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  GuidedOnboarding,
  type GuidedOnboardingApi,
  type GuidedOnboardingRun,
} from '../app/projects/[projectId]/onboarding/guided-onboarding'

import type { DesignDocument } from '@zenui/design-schema'

const workspaceId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const runId = '44444444-4444-4444-8444-444444444444'

function documentFor(color: string, heading: string): DesignDocument {
  return {
    schemaVersion: 1 as const,
    projectId,
    version: 1,
    theme: { colors: { primary: color, background: '#ffffff', text: '#111827' }, fonts: { heading: 'Manrope' as const, body: 'Manrope' as const }, radius: { sm: 8, md: 16, lg: 24 } },
    pages: [{ id: 'home', name: 'NovaFlow', slug: '/' as const, rootNodeId: 'page-root' }],
    nodes: {
      'page-root': { id: 'page-root', type: 'page' as const, parentId: null, children: ['hero-section'], props: {}, style: {}, responsive: {} },
      'hero-section': { id: 'hero-section', type: 'section' as const, parentId: 'page-root', children: ['hero-heading'], props: {}, style: { paddingTop: 64, paddingBottom: 64 }, responsive: {} },
      'hero-heading': { id: 'hero-heading', type: 'heading' as const, parentId: 'hero-section', children: [], props: { text: heading, level: 1 }, style: { color }, responsive: {} },
    },
  }
}

function documentWithOwnedHero(color: string, heading: string, assetId: string): DesignDocument {
  const document = documentFor(color, heading)
  document.nodes['hero-section']!.children.push('hero-image')
  document.nodes['hero-image'] = {
    id: 'hero-image',
    type: 'image',
    parentId: 'hero-section',
    children: [],
    props: {
      assetId,
      alt: 'Nhóm học viên thực hành AI',
      decorative: false,
    },
    style: {
      width: 'full',
      aspectRatio: 'wide',
      objectFit: 'cover',
    },
    responsive: {},
  }
  return document
}

const contracts = [
  { themePreset: 'indigo', mood: 'confident', density: 'balanced', navbarVariant: 'compact', heroVariant: 'split', featuresVariant: 'grid', testimonialsVariant: 'cards', faqVariant: 'stacked', finalCtaVariant: 'panel', footerVariant: 'simple' },
  { themePreset: 'emerald', mood: 'friendly', density: 'airy', navbarVariant: 'centered', heroVariant: 'centered', featuresVariant: 'alternating', testimonialsVariant: 'spotlight', faqVariant: 'two-column', finalCtaVariant: 'split', footerVariant: 'columns' },
  { themePreset: 'coral', mood: 'bold', density: 'compact', navbarVariant: 'announcement', heroVariant: 'product-shot', featuresVariant: 'bento', testimonialsVariant: 'cards', faqVariant: 'two-column', finalCtaVariant: 'panel', footerVariant: 'columns' },
] as const

const directions = [
  { id: 'clear', name: 'Đà tiến rõ ràng', character: 'Trực tiếp', rationale: 'Làm hành động chính dễ hiểu.', contract: contracts[0], document: documentFor('#4f46e5', 'Lập kế hoạch rõ ràng') },
  { id: 'trusted', name: 'Người bạn đáng tin', character: 'Bằng chứng', rationale: 'Xây dựng niềm tin trước hành động.', contract: contracts[1], document: documentFor('#059669', 'Một kế hoạch đáng tin') },
  { id: 'bold', name: 'Khởi động nổi bật', character: 'Năng động', rationale: 'Tạo năng lượng với mở đầu mạnh.', contract: contracts[2], document: documentFor('#e85d4a', 'Sẵn sàng ra mắt') },
]

function completedRun(round = 0): GuidedOnboardingRun {
  return {
    id: runId,
    status: 'completed',
    round,
    errorCode: null,
    directions,
  }
}

function api(overrides: Partial<GuidedOnboardingApi> = {}): GuidedOnboardingApi {
  return {
    loadBrief: () => Promise.resolve(null),
    saveBrief: brief => Promise.resolve(brief),
    createRun: () => Promise.resolve({ id: runId, status: 'queued', round: 0, errorCode: null, directions: null }),
    subscribe: (_runId, onEvent) => {
      queueMicrotask(() => onEvent(completedRun()))
      return () => undefined
    },
    cancelRun: () => Promise.resolve(),
    chooseDirection: (_runId, directionId) => Promise.resolve({
      version: 2, directionId, document: directions.find(direction => direction.id === directionId)!.document,
    }),
    ...overrides,
  }
}

afterEach(() => cleanup())

describe('production Guided Brief and Design Direction Gallery', () => {
  it('keeps direct fields editable after deterministic ordinary-language prefill', async () => {
    render(<GuidedOnboarding projectId={projectId} workspaceId={workspaceId} expectedVersion={1} assetOrigin="http://127.0.0.1:3002" api={api()} onAccepted={vi.fn()} />)
    const user = userEvent.setup()
    await screen.findByRole('heading', { name: 'Hãy cho chúng tôi biết website bạn muốn tạo' })

    await user.type(screen.getByLabelText('Mô tả doanh nghiệp hoặc ý tưởng'), 'NovaFlow giúp nhóm sản phẩm nhỏ lên kế hoạch ra mắt. Mục tiêu là nhận lịch tư vấn. Hành động chính: Đặt lịch tư vấn.')
    await user.click(screen.getByRole('button', { name: 'Dùng mô tả của tôi' }))
    expect(screen.getByLabelText('Bạn cung cấp sản phẩm hoặc dịch vụ gì?')).toHaveValue('NovaFlow giúp nhóm sản phẩm nhỏ lên kế hoạch ra mắt')

    await user.clear(screen.getByLabelText('Bạn cung cấp sản phẩm hoặc dịch vụ gì?'))
    await user.type(screen.getByLabelText('Bạn cung cấp sản phẩm hoặc dịch vụ gì?'), 'Nền tảng lập kế hoạch mới')
    expect(screen.getByLabelText('Bạn cung cấp sản phẩm hoặc dịch vụ gì?')).toHaveValue('Nền tảng lập kế hoạch mới')
  })

  it('shows field errors without erasing entered values', async () => {
    render(<GuidedOnboarding projectId={projectId} workspaceId={workspaceId} expectedVersion={1} assetOrigin="http://127.0.0.1:3002" api={api()} onAccepted={vi.fn()} />)
    const user = userEvent.setup()
    await screen.findByRole('heading', { name: 'Hãy cho chúng tôi biết website bạn muốn tạo' })
    await user.type(screen.getByLabelText('Bạn cung cấp sản phẩm hoặc dịch vụ gì?'), 'NovaFlow')
    await user.click(screen.getByRole('button', { name: 'Tạo 3 hướng thiết kế' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Hãy kiểm tra các chi tiết còn thiếu')
    expect(screen.getByLabelText('Bạn cung cấp sản phẩm hoặc dịch vụ gì?')).toHaveValue('NovaFlow')
    expect(screen.getByText('Hãy cho biết website này dành cho ai')).toBeVisible()
  })

  it('keeps preparation status and cancellation inside the gallery content width', async () => {
    let onStatus: ((run: GuidedOnboardingRun) => void) | undefined
    render(<GuidedOnboarding projectId={projectId} workspaceId={workspaceId} expectedVersion={1} assetOrigin="http://127.0.0.1:3002" api={api({
      loadBrief: () => Promise.resolve({
        description: '', offer: 'NovaFlow', audience: 'Nhóm sản phẩm nhỏ', primaryGoal: 'Nhận lịch tư vấn',
        cta: 'Đặt lịch tư vấn', tone: 'Rõ ràng và hiện đại', brandDetails: '',
        mustHaveSections: ['introduction', 'benefits', 'contact'],
      }),
      subscribe: (_runId, onEvent) => {
        onStatus = onEvent
        return () => undefined
      },
    })} onAccepted={vi.fn()} />)
    const user = userEvent.setup()
    await screen.findByDisplayValue('NovaFlow')
    await user.click(screen.getByRole('button', { name: 'Tạo 3 hướng thiết kế' }))

    const preparation = screen.getByRole('group', { name: 'Đang chuẩn bị hướng thiết kế' })
    expect(preparation).toHaveClass('guided-preparation-panel')
    expect(preparation).toContainElement(screen.getByRole('status'))
    expect(preparation).toContainElement(screen.getByRole('button', { name: 'Hủy chuẩn bị' }))

    onStatus?.(completedRun())
  })

  it('prepares exactly three directions, switches mobile preview and chooses one', async () => {
    const onAccepted = vi.fn()
    render(<GuidedOnboarding projectId={projectId} workspaceId={workspaceId} expectedVersion={1} assetOrigin="http://127.0.0.1:3002" api={api({
      loadBrief: () => Promise.resolve({
        description: '', offer: 'NovaFlow', audience: 'Nhóm sản phẩm nhỏ', primaryGoal: 'Nhận lịch tư vấn',
        cta: 'Đặt lịch tư vấn', tone: 'Rõ ràng và hiện đại', brandDetails: '',
        mustHaveSections: ['introduction', 'benefits', 'contact'],
      }),
    })} onAccepted={onAccepted} />)
    const user = userEvent.setup()
    await screen.findByDisplayValue('NovaFlow')
    await user.click(screen.getByRole('button', { name: 'Tạo 3 hướng thiết kế' }))

    const cards = await screen.findAllByTestId('production-direction-card')
    expect(cards).toHaveLength(3)
    expect(cards[0]!.querySelector('.design-document-renderer')).toHaveTextContent('Lập kế hoạch rõ ràng')
    expect(cards[1]!.querySelector('.design-document-renderer')).toHaveTextContent('Một kế hoạch đáng tin')
    expect(cards[2]!.querySelector('.design-document-renderer')).toHaveTextContent('Sẵn sàng ra mắt')
    await user.click(screen.getByRole('button', { name: 'Điện thoại' }))
    expect(screen.getAllByLabelText(/Bản xem trước/)[0]).toHaveAttribute('data-viewport', 'mobile')
    await user.click(screen.getAllByRole('button', { name: 'Chọn hướng này' })[1]!)
    await waitFor(() => expect(onAccepted).toHaveBeenCalledWith(expect.objectContaining({
      version: 2,
      brief: expect.objectContaining({
        offer: 'NovaFlow',
        audience: 'Nhóm sản phẩm nhỏ',
        primaryGoal: 'Nhận lịch tư vấn',
      }),
    })))
  })

  it('renders owned images in Gallery thumbnails and the large preview', async () => {
    const assetId = '55555555-5555-4555-8555-555555555555'
    const mediaDirections = directions.map(direction => {
      const heading = direction.document.nodes['hero-heading']
      if (!heading || !('text' in heading.props)) throw new Error('Missing direction heading')
      return {
        ...direction,
        document: documentWithOwnedHero(
          direction.document.theme.colors.primary,
          heading.props.text,
          assetId,
        ),
      }
    })
    const completedWithMedia: GuidedOnboardingRun = {
      ...completedRun(),
      directions: mediaDirections,
    }
    render(
      <GuidedOnboarding
        projectId={projectId}
        workspaceId={workspaceId}
        expectedVersion={1}
        assetOrigin="http://127.0.0.1:3002"
        api={api({
          subscribe: (_runId, onEvent) => {
            queueMicrotask(() => onEvent(completedWithMedia))
            return () => undefined
          },
        })}
        onAccepted={vi.fn()}
      />,
    )
    const user = userEvent.setup()
    await screen.findByRole('heading', { name: 'Hãy cho chúng tôi biết website bạn muốn tạo' })
    await user.type(screen.getByLabelText('Bạn cung cấp sản phẩm hoặc dịch vụ gì?'), 'Khóa học AI')
    await user.type(screen.getByLabelText('Website này dành cho ai?'), 'Người mới học AI')
    await user.type(screen.getByLabelText('Website này cần đạt được điều gì?'), 'Đăng ký khóa học')
    await user.type(screen.getByLabelText('Khách truy cập nên làm gì tiếp theo?'), 'Đăng ký ngay')
    await user.type(screen.getByLabelText('Website nên mang lại cảm giác như thế nào?'), 'Tin cậy và hiện đại')
    await user.click(screen.getByRole('button', { name: 'Tạo 3 hướng thiết kế' }))

    const firstCard = (await screen.findAllByTestId('production-direction-card'))[0]!
    expect(firstCard.querySelector('img')).toHaveAttribute(
      'src',
      `http://127.0.0.1:3002/a/${assetId}`,
    )
    expect(screen.queryByText('Chưa tìm được ảnh phù hợp — bạn có thể thêm ảnh của mình sau.')).not.toBeInTheDocument()

    await user.click(within(firstCard).getByRole('button', { name: 'Xem lớn hơn' }))
    const dialog = screen.getByRole('dialog', { name: /Bản xem trước lớn/ })
    expect(within(dialog).getByRole('img', { name: 'Nhóm học viên thực hành AI' })).toHaveAttribute(
      'src',
      `http://127.0.0.1:3002/a/${assetId}`,
    )
  })

  it('keeps current cards while replacing and preserves the brief on failure', async () => {
    let round = 0
    const createRun = vi.fn().mockImplementation(() => Promise.resolve({
      id: `${runId.slice(0, -1)}${round++}`,
      status: 'queued',
      round,
      errorCode: null,
      directions: null,
    }))
    const subscribe = vi.fn().mockImplementation((_id, onEvent: (run: GuidedOnboardingRun) => void) => {
      queueMicrotask(() => onEvent(round === 1 ? completedRun(0) : {
        id: runId, status: 'failed', round: 1, errorCode: 'provider_error', directions: null,
      }))
      return () => undefined
    })
    render(<GuidedOnboarding projectId={projectId} workspaceId={workspaceId} expectedVersion={1} assetOrigin="http://127.0.0.1:3002" api={api({
      loadBrief: () => Promise.resolve({
        description: '', offer: 'NovaFlow', audience: 'Nhóm sản phẩm nhỏ', primaryGoal: 'Nhận lịch tư vấn',
        cta: 'Đặt lịch tư vấn', tone: 'Rõ ràng và hiện đại', brandDetails: '',
        mustHaveSections: ['introduction', 'benefits', 'contact'],
      }),
      createRun,
      subscribe,
    })} onAccepted={vi.fn()} />)
    const user = userEvent.setup()
    await screen.findByDisplayValue('NovaFlow')
    await user.click(screen.getByRole('button', { name: 'Tạo 3 hướng thiết kế' }))
    await screen.findAllByTestId('production-direction-card')
    await user.click(screen.getByRole('button', { name: 'Thử 3 hướng khác' }))
    await user.click(screen.getByRole('button', { name: 'Xác nhận thay 3 hướng' }))

    expect(screen.getAllByTestId('production-direction-card')).toHaveLength(3)
    expect(await screen.findByRole('alert')).toHaveTextContent('Bản mô tả của bạn vẫn an toàn')
    await user.click(screen.getAllByRole('button', { name: 'Điều chỉnh bản mô tả' })[0]!)
    expect(await screen.findByDisplayValue('NovaFlow')).toBeVisible()
  })
})
