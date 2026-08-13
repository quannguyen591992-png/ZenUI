import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createValidDesignFixture } from '@zenui/design-schema'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProjectEditor } from '../app/projects/[projectId]/project-editor'

import type { WebsiteBrief } from '@zenui/ai-core'

const projectId = '55555555-5555-4555-8555-555555555555'
const workspaceId = '22222222-2222-4222-8222-222222222222'
const document = { ...createValidDesignFixture(), projectId }
const acceptedBrief: WebsiteBrief = {
  description: 'NovaFlow giúp nhóm nhỏ lên kế hoạch.',
  offer: 'Công cụ lập kế hoạch',
  audience: 'Nhóm sản phẩm nhỏ',
  primaryGoal: 'Nhận lịch tư vấn',
  cta: 'Đặt lịch tư vấn',
  tone: 'Rõ ràng',
  brandDetails: 'NovaFlow',
  mustHaveSections: ['introduction', 'benefits', 'contact'],
}

vi.mock('../app/editor/editor-app', () => ({
  EditorApp: ({ initialVersion, projectName, brief }: { initialVersion: number; projectName: string; brief: WebsiteBrief | null }) => (
    <main>
      <h1>Trình chỉnh sửa production</h1>
      <span>Dự án {projectName}</span>
      <span>Phiên bản {initialVersion}</span>
      {brief && <span>Mục tiêu {brief.primaryGoal}</span>}
    </main>
  ),
}))

vi.mock('../app/projects/[projectId]/customer-leads-inbox', () => ({
  CustomerLeadsInbox: ({ onLeadContacted }: {
    onLeadContacted: () => void
  }) => (
    <main>
      <h1>Hộp thư khách hàng production</h1>
      <button type="button" onClick={onLeadContacted}>
        Đánh dấu mô phỏng
      </button>
    </main>
  ),
}))

vi.mock('../app/projects/[projectId]/onboarding/guided-onboarding', () => ({
  GuidedOnboarding: ({ assetOrigin, onAccepted }: {
    assetOrigin?: string
    onAccepted: (result: {
      version: number
      directionId: string
      document: typeof document
      brief: WebsiteBrief
    }) => void
  }) => (
    <main>
      <h1>Guided Brief production</h1>
      <span>Asset origin {assetOrigin ?? 'missing'}</span>
      <button type="button" onClick={() => onAccepted({
        version: 2,
        directionId: 'clear',
        document: { ...document, version: 2 },
        brief: acceptedBrief,
      })}>
        Chọn hướng mô phỏng
      </button>
    </main>
  ),
}))

function response(data: unknown) {
  return Promise.resolve(new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }))
}

function stubProject(
  creationState: 'onboarding' | 'accepted',
  role: 'owner' | 'editor' | 'viewer' = 'owner',
  newCounts: number[] = [2],
) {
  const remainingCounts = [...newCounts]
  vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url === '/api/v1/session') return response({ userId: 'user-1', workspaceId, role })
    if (url.includes(`/api/v1/projects/${projectId}/leads/count?`)) {
      return response({ newCount: remainingCounts.shift() ?? newCounts.at(-1) ?? 0 })
    }
    if (url.includes(`/api/v1/projects/${projectId}?`)) {
      return response({ id: projectId, workspaceId, name: 'NovaFlow website', creationState, version: 1, document })
    }
    if (url.includes(`/api/v1/projects/${projectId}/document?`)) return response({ version: 1, document })
    if (url.includes(`/api/v1/projects/${projectId}/brief?`)) return response(null)
    return Promise.reject(new Error(`Unexpected request: ${url}`))
  }))
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('production project onboarding integration', () => {
  it('routes an onboarding project to Guided Brief and enters the editor only after choose', async () => {
    stubProject('onboarding')
    render(<ProjectEditor projectId={projectId} editorOrigin="http://localhost" previewOrigin="http://127.0.0.1:3001" assetOrigin="http://127.0.0.1:3002" remoteImageHostAllowlist="images.example.com" deploymentEnabled={false} />)

    expect(await screen.findByRole('heading', { name: 'Guided Brief production' })).toBeVisible()
    expect(screen.getByText('Asset origin http://127.0.0.1:3002')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Trình chỉnh sửa production' })).not.toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Chọn hướng mô phỏng' }))
    expect(await screen.findByRole('heading', { name: 'Trình chỉnh sửa production' })).toBeVisible()
    expect(screen.getByText('Phiên bản 2')).toBeVisible()
    expect(screen.getByText('Mục tiêu Nhận lịch tư vấn')).toBeVisible()
  })

  it('keeps accepted projects on the existing production editor', async () => {
    stubProject('accepted')
    render(<ProjectEditor projectId={projectId} editorOrigin="http://localhost" previewOrigin="http://127.0.0.1:3001" assetOrigin="http://127.0.0.1:3002" remoteImageHostAllowlist="images.example.com" deploymentEnabled={false} />)

    expect(await screen.findByRole('heading', { name: 'Trình chỉnh sửa production' })).toBeVisible()
    expect(screen.getByText('Dự án NovaFlow website')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Guided Brief production' })).not.toBeInTheDocument()
  })

  it('does not expose onboarding controls to a viewer', async () => {
    stubProject('onboarding', 'viewer')
    render(<ProjectEditor projectId={projectId} editorOrigin="http://localhost" previewOrigin="http://127.0.0.1:3001" assetOrigin="http://127.0.0.1:3002" remoteImageHostAllowlist="images.example.com" deploymentEnabled={false} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('quyền chỉnh sửa')
    expect(screen.queryByRole('heading', { name: 'Guided Brief production' })).not.toBeInTheDocument()
  })

  it('shows an owner/editor Leads tab and updates its new-customer badge', async () => {
    stubProject('accepted')
    render(<ProjectEditor projectId={projectId} editorOrigin="http://localhost" previewOrigin="http://127.0.0.1:3001" assetOrigin="http://127.0.0.1:3002" remoteImageHostAllowlist="images.example.com" deploymentEnabled={false} />)

    expect(await screen.findByRole('tab', { name: 'Thiết kế' })).toHaveAttribute('aria-selected', 'true')
    const leadsTab = await screen.findByRole('tab', { name: /Khách hàng/ })
    expect(leadsTab).toHaveTextContent('2')
    await userEvent.setup().click(leadsTab)
    expect(await screen.findByRole('heading', { name: 'Hộp thư khách hàng production' })).toBeVisible()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Đánh dấu mô phỏng' }))
    expect(leadsTab).toHaveTextContent('1')
  })

  it('hides the Leads surface from viewers', async () => {
    stubProject('accepted', 'viewer')
    render(<ProjectEditor projectId={projectId} editorOrigin="http://localhost" previewOrigin="http://127.0.0.1:3001" assetOrigin="http://127.0.0.1:3002" remoteImageHostAllowlist="images.example.com" deploymentEnabled={false} />)

    expect(await screen.findByRole('heading', { name: 'Trình chỉnh sửa production' })).toBeVisible()
    expect(screen.queryByRole('tab', { name: /Khách hàng/ })).not.toBeInTheDocument()
  })

  it('polls count only while visible and refreshes immediately on focus', async () => {
    let intervalCallback: (() => void) | undefined
    const nativeSetInterval = window.setInterval.bind(window)
    vi.spyOn(window, 'setInterval').mockImplementation((callback, milliseconds) => {
      if (milliseconds === 30_000) {
        intervalCallback = callback
        return 1 as unknown as ReturnType<typeof window.setInterval>
      }
      return nativeSetInterval(
        callback,
        milliseconds,
      ) as unknown as ReturnType<typeof window.setInterval>
    })
    let visible = true
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visible ? 'visible' : 'hidden',
    })
    stubProject('accepted', 'owner', [1, 2, 3])
    render(<ProjectEditor projectId={projectId} editorOrigin="http://localhost" previewOrigin="http://127.0.0.1:3001" assetOrigin="http://127.0.0.1:3002" remoteImageHostAllowlist="images.example.com" deploymentEnabled={false} />)

    const tab = await screen.findByRole('tab', { name: /Khách hàng/ })
    await waitFor(() => expect(tab).toHaveTextContent('1'))
    act(() => { intervalCallback?.() })
    await waitFor(() => expect(tab).toHaveTextContent('2'))

    visible = false
    act(() => { intervalCallback?.() })
    expect(tab).toHaveTextContent('2')

    visible = true
    act(() => { window.dispatchEvent(new Event('focus')) })
    await waitFor(() => expect(tab).toHaveTextContent('3'))
  })
})
