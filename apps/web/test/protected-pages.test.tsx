import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import DashboardLayout from '../app/dashboard/layout'
import DashboardPage from '../app/dashboard/page'
import ProjectPage, { isAssistantOptInEnabled } from '../app/projects/[projectId]/page'

const {
  databaseLimitMock,
  getRuntimeSessionMock,
  projectEditorMock,
  redirectMock,
} = vi.hoisted(() => ({
  databaseLimitMock: vi.fn(),
  redirectMock: vi.fn((path: string): never => { throw new Error(`REDIRECT:${path}`) }),
  getRuntimeSessionMock: vi.fn(),
  projectEditorMock: vi.fn(() => <main><h1>Trình chỉnh sửa được bảo vệ</h1></main>),
}))

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
  usePathname: () => '/dashboard',
}))
vi.mock('../lib/server/runtime-session', () => ({ getRuntimeSession: getRuntimeSessionMock }))
vi.mock('../lib/server/configured-auth', () => ({
  createConfiguredAuth: vi.fn(() => ({ signOut: vi.fn() })),
}))
vi.mock('../lib/server/database', () => ({
  waitForDatabase: vi.fn(),
  getDatabase: () => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: databaseLimitMock }),
      }),
    }),
  }),
}))
vi.mock('../lib/server/e2e-runtime', () => ({
  isE2eRuntimeEnabled: () => false,
  isLocalAuthRuntimeEnabled: () => true,
}))
vi.mock('../app/dashboard', () => ({ Dashboard: () => <main><h1>Bảng điều khiển dự án</h1></main> }))
vi.mock('../app/projects/[projectId]/project-editor', () => ({ ProjectEditor: projectEditorMock }))

beforeEach(() => {
  vi.clearAllMocks()
  databaseLimitMock.mockResolvedValue([{
    userId: 'owner',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    role: 'owner',
  }])
})

describe('protected pages', () => {
  it('redirects an unauthenticated dashboard visitor to login', async () => {
    getRuntimeSessionMock.mockResolvedValueOnce(null)

    await expect(DashboardLayout({ children: <DashboardPage /> }))
      .rejects.toThrow('REDIRECT:/login?callbackUrl=%2Fdashboard')
  })

  it('renders the dashboard after guarded authentication', async () => {
    getRuntimeSessionMock.mockResolvedValueOnce({ userId: 'owner' })

    render(await DashboardLayout({ children: <DashboardPage /> }))
    expect(screen.getByRole('heading', { name: 'Bảng điều khiển dự án' })).toBeVisible()
  })

  it('exposes assistant lanes only in explicit opt-in rollout mode', () => {
    expect(isAssistantOptInEnabled({
      AI_ASSISTANT_ROLLOUT_MODE: 'opt-in',
      AI_ASSISTANT_V2_ENABLED: 'true',
    })).toBe(true)
    expect(isAssistantOptInEnabled({
      AI_ASSISTANT_ROLLOUT_MODE: 'shadow',
      AI_ASSISTANT_V2_ENABLED: 'true',
    })).toBe(false)
    expect(isAssistantOptInEnabled({
      AI_ASSISTANT_ROLLOUT_MODE: 'disabled',
      AI_ASSISTANT_V2_ENABLED: 'true',
    })).toBe(false)
    expect(isAssistantOptInEnabled({ AI_ASSISTANT_ROLLOUT_MODE: 'opt-in' })).toBe(false)
  })

  it('passes validated origins and opt-in assistant flags to the protected editor', async () => {
    const previous = { ...process.env }
    process.env = {
      ...previous,
      APP_ORIGIN: 'http://localhost:3000',
      PREVIEW_ORIGIN: 'http://127.0.0.1:3001',
      ASSET_ORIGIN: 'http://127.0.0.1:3002',
      REMOTE_IMAGE_HOST_ALLOWLIST: 'images.example.com',
      AI_ASSISTANT_ROLLOUT_MODE: 'opt-in',
      AI_ASSISTANT_V2_ENABLED: 'true',
      AI_ASSISTANT_STYLE_ENABLED: 'true',
      AI_ASSISTANT_LAYOUT_ENABLED: 'true',
      AI_ASSISTANT_COMPOSITION_ENABLED: 'true',
    }
    getRuntimeSessionMock.mockResolvedValueOnce({ userId: 'owner' })
    try {
      render(await ProjectPage({ params: Promise.resolve({ projectId: '55555555-5555-4555-8555-555555555555' }) }))
      expect(screen.getByRole('heading', { name: 'Trình chỉnh sửa được bảo vệ' })).toBeVisible()
      expect(projectEditorMock).toHaveBeenCalledWith(expect.objectContaining({
        editorOrigin: 'http://localhost:3000',
        previewOrigin: 'http://127.0.0.1:3001',
        assetOrigin: 'http://127.0.0.1:3002',
        assistantStyleEnabled: true,
        assistantLayoutEnabled: true,
        assistantCompositionEnabled: true,
      }), undefined)
    } finally {
      process.env = previous
    }
  })

  it('fails closed when protected editor origin configuration is missing', async () => {
    const previous = { ...process.env }
    process.env = { ...previous, APP_ORIGIN: '', PREVIEW_ORIGIN: '', ASSET_ORIGIN: '', REMOTE_IMAGE_HOST_ALLOWLIST: '' }
    getRuntimeSessionMock.mockResolvedValueOnce({ userId: 'owner' })
    try {
      await expect(ProjectPage({ params: Promise.resolve({ projectId: '55555555-5555-4555-8555-555555555555' }) }))
        .rejects.toThrow('APP_ORIGIN, PREVIEW_ORIGIN, ASSET_ORIGIN and REMOTE_IMAGE_HOST_ALLOWLIST are required')
    } finally {
      process.env = previous
    }
  })

  it('redirects an unauthenticated project visitor with a safe project callback', async () => {
    getRuntimeSessionMock.mockResolvedValueOnce(null)
    const projectId = '55555555-5555-4555-8555-555555555555'

    await expect(ProjectPage({ params: Promise.resolve({ projectId }) })).rejects.toThrow(
      `REDIRECT:/login?callbackUrl=${encodeURIComponent(`/projects/${projectId}`)}`,
    )
  })
})
