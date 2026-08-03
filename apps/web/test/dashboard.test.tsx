import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Dashboard } from '../app/dashboard'

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

describe('authenticated dashboard', () => {
  it('shows loading then an empty state for the authenticated workspace', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { userId: 'owner', workspaceId, role: 'owner' } }))
      .mockResolvedValueOnce(jsonResponse({ data: [] })))

    render(<Dashboard />)

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải dự án')
    expect(await screen.findByText('Chưa có dự án')).toBeVisible()
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
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { userId: 'owner', workspaceId, role: 'owner' } }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ data: project }, 201))
      .mockResolvedValueOnce(jsonResponse({ data: { ...project, name: 'Renamed' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { ...project, name: 'Renamed', status: 'archived' } }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<Dashboard />)

    await screen.findByText('Chưa có dự án')
    await user.type(screen.getByLabelText('Tên dự án'), 'Landing page')
    await user.click(screen.getByRole('button', { name: 'Tạo dự án' }))
    expect(await screen.findByRole('link', { name: 'Mở Landing page' })).toHaveAttribute('href', `/projects/${project.id}`)

    await user.click(screen.getByRole('button', { name: 'Đổi tên Landing page' }))
    const rename = screen.getByLabelText('Đổi tên dự án')
    await user.clear(rename)
    await user.type(rename, 'Renamed')
    await user.click(screen.getByRole('button', { name: 'Lưu tên dự án' }))
    expect(await screen.findByRole('link', { name: 'Mở Renamed' })).toBeVisible()

    expect(screen.queryByRole('button', { name: 'Lưu trữ Renamed' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Xóa Renamed' }))
    expect(await screen.findByText('Chưa có dự án')).toBeVisible()
  })

  it('shows a safe create failure and keeps the empty state', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { userId: 'owner', workspaceId, role: 'owner' } }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'server_error', message: 'Unable to create' } }, 500)))
    const user = userEvent.setup()
    render(<Dashboard />)

    await screen.findByText('Chưa có dự án')
    await user.type(screen.getByLabelText('Tên dự án'), 'Failed project')
    await user.click(screen.getByRole('button', { name: 'Tạo dự án' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể hoàn tất yêu cầu')
    expect(screen.getByText('Chưa có dự án')).toBeVisible()
  })

  it('shows safe mutation failures without discarding the current list', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { userId: 'owner', workspaceId, role: 'owner' } }))
      .mockResolvedValueOnce(jsonResponse({ data: [project] }))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'server_error', message: 'Unable to rename' } }, 500)))
    const user = userEvent.setup()
    render(<Dashboard />)

    await screen.findByRole('link', { name: 'Mở Landing page' })
    await user.click(screen.getByRole('button', { name: 'Đổi tên Landing page' }))
    await user.clear(screen.getByLabelText('Đổi tên dự án'))
    await user.type(screen.getByLabelText('Đổi tên dự án'), 'New name')
    await user.click(screen.getByRole('button', { name: 'Lưu tên dự án' }))

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
