import '@testing-library/jest-dom/vitest'

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PublishPanel, type PublishApi } from '../app/editor/publish-panel'

const projectId = '11111111-1111-4111-8111-111111111111'
const workspaceId = '22222222-2222-4222-8222-222222222222'
const revisionId = '33333333-3333-4333-8333-333333333333'
const connectionId = '44444444-4444-4444-8444-444444444444'
const deploymentId = '55555555-5555-4555-8555-555555555555'
const revision = { id: revisionId, documentVersion: 2, summary: 'Website đã lưu', source: 'ai', createdAt: '2026-07-28T12:00:00.000Z' }
const connection = { id: connectionId, provider: 'vercel' as const, status: 'connected' as const, connectedAt: '2026-07-28T12:00:00.000Z', updatedAt: '2026-07-28T12:00:00.000Z' }
const queued = { id: deploymentId, revisionId, provider: 'vercel' as const, target: 'production' as const, status: 'queued' as const, url: null, errorCode: null, createdAt: '2026-07-28T12:00:00.000Z', updatedAt: '2026-07-28T12:00:00.000Z' }
const ready = { ...queued, status: 'ready' as const, url: 'https://zenui-stage9.vercel.app' }

function api(overrides: Partial<PublishApi> = {}): PublishApi {
  return {
    getConnection: vi.fn().mockResolvedValue(connection),
    authorize: vi.fn().mockResolvedValue({ url: 'http://localhost:3000/api/e2e/provider-connect' }),
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(queued),
    get: vi.fn().mockResolvedValue(ready),
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('PublishPanel', () => {
  it('summarizes the public outcome and publishes only after explicit confirmation', async () => {
    const ensureLatestSavedRevision = vi.fn().mockResolvedValue(revision)
    const create = vi.fn().mockResolvedValue(queued)
    const publishApi = api({ create })
    const user = userEvent.setup()
    render(<PublishPanel
      projectId={projectId}
      workspaceId={workspaceId}
      projectName="NovaFlow website"
      primaryAction="Đặt lịch tư vấn"
      canPublish
      enabled
      ensureLatestSavedRevision={ensureLatestSavedRevision}
      api={publishApi}
    />)

    await user.click(screen.getByRole('button', { name: 'Xuất bản' }))
    expect(await screen.findByRole('heading', { name: 'Xuất bản website' })).toBeVisible()
    expect(screen.getByText('NovaFlow website')).toBeVisible()
    expect(screen.getByText('Đặt lịch tư vấn')).toBeVisible()
    expect(screen.getByText('Website công khai')).toBeVisible()
    expect(screen.getByText('Vercel')).not.toBeVisible()
    expect(screen.getByText('Provider')).not.toBeVisible()
    expect(screen.getByRole('button', { name: 'Xuất bản website' })).toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: 'Tôi hiểu website này sẽ trở thành công khai' }))
    await user.dblClick(screen.getByRole('button', { name: 'Xuất bản website' }))

    expect(ensureLatestSavedRevision).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith(projectId, expect.objectContaining({
      workspaceId,
      revisionId,
      target: 'production',
      confirmed: true,
    }))
    expect(await screen.findByText('Website của bạn đã được xuất bản')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Mở website' })).toHaveAttribute('href', ready.url)
  })

  it('blocks publishing while the latest edits are not safely saved', async () => {
    render(<PublishPanel
      projectId={projectId}
      workspaceId={workspaceId}
      projectName="NovaFlow website"
      primaryAction="Đặt lịch tư vấn"
      canPublish={false}
      enabled
      ensureLatestSavedRevision={() => Promise.resolve(revision)}
      api={api()}
    />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Xuất bản' }))
    expect(screen.getByText('Hãy đợi website lưu xong trước khi xuất bản.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Xuất bản website' })).toBeDisabled()
  })

  it('connects through plain-language publishing copy and keeps provider details collapsed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const disconnected = api({
      getConnection: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(connection),
    })
    const popup = { closed: false, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
    render(<PublishPanel
      projectId={projectId}
      workspaceId={workspaceId}
      projectName="NovaFlow website"
      primaryAction="Đặt lịch tư vấn"
      canPublish
      enabled
      ensureLatestSavedRevision={() => Promise.resolve(revision)}
      api={disconnected}
    />)

    await userEvent.click(screen.getByRole('button', { name: 'Xuất bản' }))
    expect(await screen.findByText('Kết nối dịch vụ xuất bản để đưa website lên mạng.')).toBeVisible()
    expect(screen.getByText('Vercel')).not.toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Kết nối dịch vụ xuất bản' }))
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(await screen.findByText('Dịch vụ xuất bản đã sẵn sàng')).toBeVisible()
    await userEvent.click(screen.getByText('Chi tiết nâng cao'))
    expect(screen.getByText('Vercel')).toBeVisible()
  })

  it('renders unavailable, popup and status recovery states without technical leaks', async () => {
    const user = userEvent.setup()
    const unavailable = render(<PublishPanel
      projectId={projectId}
      workspaceId={workspaceId}
      projectName="NovaFlow website"
      primaryAction=""
      canPublish
      enabled={false}
      ensureLatestSavedRevision={() => Promise.resolve(revision)}
      api={api()}
    />)
    await user.click(screen.getByRole('button', { name: 'Xuất bản' }))
    expect(screen.getByText('Dịch vụ xuất bản chưa được cấu hình cho môi trường này.')).toBeVisible()
    expect(screen.getByText('Chưa có thông tin')).toBeVisible()
    unavailable.unmount()

    vi.spyOn(window, 'open').mockReturnValue(null)
    const blocked = render(<PublishPanel
      projectId={projectId}
      workspaceId={workspaceId}
      projectName="NovaFlow website"
      primaryAction="Đặt lịch tư vấn"
      canPublish
      enabled
      ensureLatestSavedRevision={() => Promise.resolve(revision)}
      api={api({ getConnection: vi.fn().mockResolvedValue(null) })}
    />)
    await user.click(screen.getByRole('button', { name: 'Xuất bản' }))
    await user.click(await screen.findByRole('button', { name: 'Kết nối dịch vụ xuất bản' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Trình duyệt đã chặn cửa sổ kết nối')
    blocked.unmount()

    const statusFailure = render(<PublishPanel
      projectId={projectId}
      workspaceId={workspaceId}
      projectName="NovaFlow website"
      primaryAction="Đặt lịch tư vấn"
      canPublish
      enabled
      ensureLatestSavedRevision={() => Promise.resolve(revision)}
      api={api({ list: vi.fn().mockRejectedValue(new Error('secret')) })}
    />)
    await user.click(screen.getByRole('button', { name: 'Xuất bản' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải trạng thái xuất bản')
    statusFailure.unmount()
  })

  it('handles terminal failure, polling failure and copy failure safely', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const failed = { ...queued, status: 'failed' as const, errorCode: 'provider_error' as const }
    const pollFailure = api({ get: vi.fn().mockRejectedValue(new Error('secret')) })
    const user = userEvent.setup()
    const first = render(<PublishPanel
      projectId={projectId}
      workspaceId={workspaceId}
      projectName="NovaFlow website"
      primaryAction="Đặt lịch tư vấn"
      canPublish
      enabled
      ensureLatestSavedRevision={() => Promise.resolve(revision)}
      api={pollFailure}
    />)
    await user.click(screen.getByRole('button', { name: 'Xuất bản' }))
    await user.click(screen.getByRole('checkbox', { name: 'Tôi hiểu website này sẽ trở thành công khai' }))
    await user.click(screen.getByRole('button', { name: 'Xuất bản website' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa thể cập nhật kết quả xuất bản')
    first.unmount()

    const terminal = render(<PublishPanel
      projectId={projectId}
      workspaceId={workspaceId}
      projectName="NovaFlow website"
      primaryAction="Đặt lịch tư vấn"
      canPublish
      enabled
      ensureLatestSavedRevision={() => Promise.resolve(revision)}
      api={api({ list: vi.fn().mockResolvedValue([]), get: vi.fn().mockResolvedValue(failed) })}
    />)
    await user.click(screen.getByRole('button', { name: 'Xuất bản' }))
    await user.click(screen.getByRole('checkbox', { name: 'Tôi hiểu website này sẽ trở thành công khai' }))
    await user.click(screen.getByRole('button', { name: 'Xuất bản website' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Website của bạn chưa được công khai')
    terminal.unmount()

    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('blocked'))
    render(<PublishPanel
      projectId={projectId}
      workspaceId={workspaceId}
      projectName="NovaFlow website"
      primaryAction="Đặt lịch tư vấn"
      canPublish
      enabled
      ensureLatestSavedRevision={() => Promise.resolve(revision)}
      api={api({ list: vi.fn().mockResolvedValue([ready]) })}
    />)
    await user.click(screen.getByRole('button', { name: 'Xuất bản' }))
    await user.click(await screen.findByRole('button', { name: 'Sao chép địa chỉ' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể sao chép địa chỉ website')
  })

  it('restores the latest ready public URL and reports safe retry copy', async () => {
    const failed = { ...queued, status: 'failed' as const, errorCode: 'provider_error' as const }
    const failedApi = api({ list: vi.fn().mockResolvedValue([failed]), create: vi.fn().mockRejectedValue(new Error('provider-secret')) })
    const first = render(<PublishPanel
      projectId={projectId}
      workspaceId={workspaceId}
      projectName="NovaFlow website"
      primaryAction="Đặt lịch tư vấn"
      canPublish
      enabled
      ensureLatestSavedRevision={() => Promise.resolve(revision)}
      api={failedApi}
    />)
    await userEvent.click(screen.getByRole('button', { name: 'Xuất bản' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Tôi hiểu website này sẽ trở thành công khai' }))
    await userEvent.click(screen.getByRole('button', { name: 'Xuất bản website' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể bắt đầu xuất bản. Hãy thử lại.')
    expect(screen.queryByText('provider-secret')).not.toBeInTheDocument()
    first.unmount()

    render(<PublishPanel
      projectId={projectId}
      workspaceId={workspaceId}
      projectName="NovaFlow website"
      primaryAction="Đặt lịch tư vấn"
      canPublish
      enabled
      ensureLatestSavedRevision={() => Promise.resolve(revision)}
      api={api({ list: vi.fn().mockResolvedValue([ready]) })}
    />)
    await userEvent.click(screen.getByRole('button', { name: 'Xuất bản' }))
    await waitFor(() => expect(screen.getByRole('link', { name: 'Mở website' })).toHaveAttribute('href', ready.url))
  })
})
