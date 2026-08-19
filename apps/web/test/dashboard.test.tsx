import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Dashboard } from '../app/dashboard'
import { DashboardShell } from '../app/dashboard/dashboard-shell'

const workspaceId = '22222222-2222-4222-8222-222222222222'
const project = {
  id: '55555555-5555-4555-8555-555555555555',
  workspaceId,
  name: 'Landing page',
  status: 'active' as const,
  version: 1,
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Dashboard shell', () => {
  it('renders route-aware navigation without deferred Resources or Team items', () => {
    render(
      <DashboardShell
        session={{ userId: 'owner', workspaceId, role: 'owner' }}
        pathname="/dashboard/customers"
        localAuth
      >
        <p>Dashboard content</p>
      </DashboardShell>,
    )

    expect(screen.getByRole('link', { name: 'ZenUI' })).toHaveAttribute(
      'href',
      '/',
    )
    expect(screen.getByRole('link', { name: 'ZenUI' }))
      .toHaveClass('zenui-brand-gradient')
    expect(screen.getByRole('link', { name: 'Dự án' })).toHaveAttribute(
      'href',
      '/dashboard',
    )
    expect(screen.getByRole('link', { name: 'Khách hàng' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Sử dụng AI' })).toHaveAttribute(
      'href',
      '/dashboard/usage',
    )
    expect(screen.queryByText('Tài nguyên')).not.toBeInTheDocument()
    expect(screen.queryByText('Nhóm')).not.toBeInTheDocument()
    expect(screen.getByText('Mẫu (Templates)')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByText('Cài đặt')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(document.querySelector('form[action="/api/local/session/logout"]'))
      .not.toBeNull()
  })

  it('hides Customer Leads from viewers while keeping own AI usage available', () => {
    render(
      <DashboardShell
        session={{ userId: 'viewer', workspaceId, role: 'viewer' }}
        pathname="/dashboard"
      >
        <p>Dashboard content</p>
      </DashboardShell>,
    )

    expect(screen.queryByRole('link', { name: 'Khách hàng' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Sử dụng AI' })).toBeVisible()
  })
})

describe('authenticated dashboard', () => {
  it('shows loading then an empty state for the authenticated workspace', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { userId: 'owner', workspaceId, role: 'owner' } }))
      .mockResolvedValueOnce(jsonResponse({ data: [] })))

    render(<Dashboard />)

    const loadingState = screen.getByRole('status')
    expect(loadingState).toHaveTextContent('Đang tải dự án')
    expect(loadingState).not.toHaveClass('dashboard-pro-layout')
    expect(await screen.findByRole('heading', { name: 'Chào mừng đến với ZenUI' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Tạo dự án' })).toBeVisible()
  })

  it('offers sign-in again when the session expires instead of retrying forever', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      error: { code: 'unauthorized', message: 'Vui lòng đăng nhập để tiếp tục.' },
    }, 401))
    vi.stubGlobal('fetch', fetchMock)

    render(<Dashboard />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Vui lòng đăng nhập để tiếp tục.')
    expect(screen.getByRole('link', { name: 'Đăng nhập lại' })).toHaveAttribute(
      'href',
      '/login?callbackUrl=%2Fdashboard',
    )
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  it('creates, renames and deletes projects for an owner', async () => {
    const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/v1/session') return Promise.resolve(jsonResponse({ data: { userId: 'owner', workspaceId, role: 'owner' } }))
      if (input.startsWith('/api/v1/projects?')) return Promise.resolve(jsonResponse({ data: [] }))
      if (input === '/api/v1/projects' && init?.method === 'POST') return Promise.resolve(jsonResponse({ data: project }, 201))
      if (input.startsWith(`/api/v1/projects/${project.id}?`)) return Promise.resolve(jsonResponse({ data: { document: null } }))
      if (input === `/api/v1/projects/${project.id}` && init?.method === 'PATCH') return Promise.resolve(jsonResponse({ data: { ...project, name: 'Renamed' } }))
      if (input === `/api/v1/projects/${project.id}` && init?.method === 'DELETE') return Promise.resolve(jsonResponse({ data: { ...project, name: 'Renamed', status: 'archived' } }))
      throw new Error(`Unexpected request: ${input}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<Dashboard />)

    await screen.findByRole('heading', { name: 'Chào mừng đến với ZenUI' })
    await user.type(screen.getByLabelText('Tên dự án'), 'Landing page')
    await user.click(screen.getByRole('button', { name: 'Tạo dự án' }))
    expect(await screen.findByRole('link', { name: 'Mở Landing page' })).toHaveAttribute('href', `/projects/${project.id}`)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))

    await user.click(screen.getByRole('button', { name: 'Tùy chọn cho Landing page' }))
    await user.click(screen.getByRole('menuitem', { name: 'Đổi tên Landing page' }))
    const rename = screen.getByLabelText('Đổi tên dự án')
    await user.clear(rename)
    await user.type(rename, 'Renamed')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(await screen.findByRole('link', { name: 'Mở Renamed' })).toBeVisible()

    expect(screen.queryByRole('button', { name: 'Lưu trữ Renamed' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Tùy chọn cho Renamed' }))
    await user.click(screen.getByRole('menuitem', { name: 'Xóa Renamed' }))
    expect(await screen.findByRole('heading', { name: 'Chào mừng đến với ZenUI' })).toBeVisible()
  })

  it('shows a safe create failure and keeps the empty state', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { userId: 'owner', workspaceId, role: 'owner' } }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'server_error', message: 'Unable to create' } }, 500)))
    const user = userEvent.setup()
    render(<Dashboard />)

    await screen.findByRole('heading', { name: 'Chào mừng đến với ZenUI' })
    await user.type(screen.getByLabelText('Tên dự án'), 'Failed project')
    await user.click(screen.getByRole('button', { name: 'Tạo dự án' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể hoàn tất yêu cầu')
    expect(screen.getByRole('heading', { name: 'Chào mừng đến với ZenUI' })).toBeVisible()
  })

  it('shows safe mutation failures without discarding the current list', async () => {
    const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/v1/session') return Promise.resolve(jsonResponse({ data: { userId: 'owner', workspaceId, role: 'owner' } }))
      if (input.startsWith('/api/v1/projects?')) return Promise.resolve(jsonResponse({ data: [project] }))
      if (input.startsWith(`/api/v1/projects/${project.id}?`)) return Promise.resolve(jsonResponse({ data: { document: null } }))
      if (input === `/api/v1/projects/${project.id}` && init?.method === 'PATCH') {
        return Promise.resolve(jsonResponse({ error: { code: 'server_error', message: 'Unable to rename' } }, 500))
      }
      throw new Error(`Unexpected request: ${input}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<Dashboard />)

    await screen.findByRole('link', { name: 'Mở Landing page' })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    await user.click(screen.getByRole('button', { name: 'Tùy chọn cho Landing page' }))
    await user.click(screen.getByRole('menuitem', { name: 'Đổi tên Landing page' }))
    await user.clear(screen.getByLabelText('Đổi tên dự án'))
    await user.type(screen.getByLabelText('Đổi tên dự án'), 'New name')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể hoàn tất yêu cầu')
    expect(screen.getByLabelText('Đổi tên dự án')).toHaveValue('New name')
  })

  it('keeps project management controls hidden from viewers', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { userId: 'viewer', workspaceId, role: 'viewer' } }))
      .mockResolvedValueOnce(jsonResponse({ data: [project] })))

    render(<Dashboard />)

    expect(await screen.findByRole('link', { name: 'Mở Landing page' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /tạo dự án/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /đổi tên landing page/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /xóa landing page/i })).toBeNull()
  })
})
