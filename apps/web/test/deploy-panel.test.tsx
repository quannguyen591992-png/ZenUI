import '@testing-library/jest-dom/vitest'

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { browserDeployApi, DeployPanel } from '../app/editor/deploy-panel'

const projectId = '11111111-1111-4111-8111-111111111111'
const workspaceId = '22222222-2222-4222-8222-222222222222'
const revisionId = '33333333-3333-4333-8333-333333333333'
const connectionId = '44444444-4444-4444-8444-444444444444'
const deploymentId = '55555555-5555-4555-8555-555555555555'
const revision = { id: revisionId, documentVersion: 1, summary: 'Launch revision', source: 'manual', createdAt: '2026-07-22T12:00:00.000Z' }
const connection = { id: connectionId, provider: 'vercel' as const, status: 'connected' as const, connectedAt: '2026-07-22T12:00:00.000Z', updatedAt: '2026-07-22T12:00:00.000Z' }
const queued = { id: deploymentId, revisionId, provider: 'vercel' as const, target: 'preview' as const, status: 'queued' as const, url: null, errorCode: null, createdAt: '2026-07-22T12:00:00.000Z', updatedAt: '2026-07-22T12:00:00.000Z' }
const uploading = { ...queued, status: 'uploading' as const }
const building = { ...queued, status: 'building' as const }
const ready = { ...queued, status: 'ready' as const, url: 'https://zenui-test.vercel.app' }
const failedDeployment = { ...queued, status: 'failed' as const, errorCode: 'provider_error' as const }

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function api(overrides: Record<string, unknown> = {}) {
  return {
    getConnection: vi.fn().mockResolvedValue(connection),
    authorize: vi.fn().mockResolvedValue({ url: 'http://localhost:3000/api/e2e/provider-connect' }),
    disconnect: vi.fn().mockResolvedValue({ ...connection, status: 'disconnected' }),
    create: vi.fn().mockResolvedValue(queued),
    get: vi.fn().mockResolvedValue(ready),
    ...overrides,
  }
}

describe('DeployPanel', () => {
  it('disables Vercel actions when the runtime capability is unavailable', async () => {
    const deploymentApi = api()
    render(<DeployPanel projectId={projectId} workspaceId={workspaceId} revisions={[revision]} api={deploymentApi} enabled={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Triển khai' }))
    expect(screen.getByText('Triển khai Vercel chưa được cấu hình cho môi trường này.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Kết nối Vercel' })).not.toBeInTheDocument()
    expect(deploymentApi.getConnection).not.toHaveBeenCalled()
  })

  it('shows a connection action and no-revision state safely', async () => {
    const disconnectedApi = api({ getConnection: vi.fn().mockResolvedValue(null) })
    render(<DeployPanel projectId={projectId} workspaceId={workspaceId} revisions={[]} api={disconnectedApi} />)
    await userEvent.click(screen.getByRole('button', { name: 'Triển khai' }))
    expect(await screen.findByText('Kết nối Vercel để triển khai một phiên bản.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Kết nối Vercel' })).toBeVisible()
    expect(screen.getByText('Hãy tạo một phiên bản trước khi triển khai.')).toBeVisible()
  })

  it('requires explicit confirmation, prevents duplicate submission and opens ready URLs safely', async () => {
    const deploymentApi = api()
    render(<DeployPanel projectId={projectId} workspaceId={workspaceId} revisions={[revision]} api={deploymentApi} />)
    await userEvent.click(screen.getByRole('button', { name: 'Triển khai' }))
    expect(await screen.findByText('Vercel đã kết nối')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Bắt đầu triển khai' })).toBeDisabled()

    await userEvent.selectOptions(screen.getByLabelText('Môi trường triển khai'), 'production')
    await userEvent.click(screen.getByRole('checkbox', { name: /xác nhận triển khai/i }))
    const submit = screen.getByRole('button', { name: 'Bắt đầu triển khai' })
    await userEvent.dblClick(submit)
    expect(deploymentApi.create).toHaveBeenCalledTimes(1)
    expect(deploymentApi.create).toHaveBeenCalledWith(projectId, expect.objectContaining({
      workspaceId, revisionId, target: 'production', confirmed: true,
    }))
    expect(await screen.findByText('Triển khai đã sẵn sàng')).toBeVisible()
    const link = screen.getByRole('link', { name: 'Mở website đã triển khai' })
    expect(link).toHaveAttribute('href', 'https://zenui-test.vercel.app')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })

  it('connects through a popup and refreshes redacted status', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const connectApi = api({
      getConnection: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(connection),
    })
    const popup = { closed: false, close: vi.fn() }
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
    render(<DeployPanel projectId={projectId} workspaceId={workspaceId} revisions={[revision]} api={connectApi} />)
    await userEvent.click(screen.getByRole('button', { name: 'Triển khai' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Kết nối Vercel' }))
    expect(open).toHaveBeenCalledWith('http://localhost:3000/api/e2e/provider-connect', 'zenui-vercel-connect', 'popup,width=720,height=720')
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(await screen.findByText('Vercel đã kết nối')).toBeVisible()
    vi.useRealTimers()
  })

  it('stops a misrouted Vercel callback instead of polling on the ZenUI Landing page', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const disconnected = api({ getConnection: vi.fn().mockResolvedValue(null) })
    const popup = {
      closed: false,
      close: vi.fn(),
      location: { href: 'http://localhost:3000/provider-callback-error' },
    }
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
    render(<DeployPanel projectId={projectId} workspaceId={workspaceId} revisions={[revision]} api={disconnected} />)

    await userEvent.click(screen.getByRole('button', { name: 'Triển khai' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Kết nối Vercel' }))
    await act(() => vi.advanceTimersByTimeAsync(300))

    expect(await screen.findByRole('alert')).toHaveTextContent('Redirect URL')
    expect(popup.close).toHaveBeenCalled()
  })

  it('handles blocked popup, disconnect and deployment failures accessibly', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    const blocked = api({ getConnection: vi.fn().mockResolvedValue(null) })
    const view = render(<DeployPanel projectId={projectId} workspaceId={workspaceId} revisions={[revision]} api={blocked} />)
    await userEvent.click(screen.getByRole('button', { name: 'Triển khai' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Kết nối Vercel' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Trình duyệt đã chặn cửa sổ bật lên')
    view.unmount()

    const failed = api({ create: vi.fn().mockRejectedValue(new Error('provider-secret')) })
    render(<DeployPanel projectId={projectId} workspaceId={workspaceId} revisions={[revision]} api={failed} />)
    await userEvent.click(screen.getByRole('button', { name: 'Triển khai' }))
    await screen.findByText('Vercel đã kết nối')
    await userEvent.click(screen.getByRole('button', { name: 'Ngắt kết nối Vercel' }))
    await waitFor(() => expect(failed.disconnect).toHaveBeenCalled())
    expect(await screen.findByText('Kết nối Vercel để triển khai một phiên bản.')).toBeVisible()
  })

  it('renders each bounded deployment status and safe terminal failure', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const deploymentApi = api({
      get: vi.fn()
        .mockResolvedValueOnce(uploading)
        .mockResolvedValueOnce(building)
        .mockResolvedValueOnce(failedDeployment),
    })
    render(<DeployPanel projectId={projectId} workspaceId={workspaceId} revisions={[revision]} api={deploymentApi} />)
    await userEvent.click(screen.getByRole('button', { name: 'Triển khai' }))
    await screen.findByText('Vercel đã kết nối')
    await userEvent.click(screen.getByRole('checkbox', { name: /xác nhận triển khai/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Bắt đầu triển khai' }))

    expect(await screen.findByText('Đang tải tệp bất biến lên')).toBeVisible()
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(await screen.findByText('Vercel đang dựng website')).toBeVisible()
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(await screen.findByRole('alert')).toHaveTextContent('Vercel không thể hoàn tất lần xuất bản này.')
  })

  it('reports safe connection and status refresh errors without leaking causes', async () => {
    const unavailableConnection = api({ getConnection: vi.fn().mockRejectedValue(new Error('provider-secret')) })
    const first = render(<DeployPanel projectId={projectId} workspaceId={workspaceId} revisions={[revision]} api={unavailableConnection} />)
    await userEvent.click(screen.getByRole('button', { name: 'Triển khai' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải kết nối Vercel.')
    expect(screen.queryByText(/provider-secret/)).not.toBeInTheDocument()
    first.unmount()

    vi.spyOn(window, 'open').mockReturnValue({ closed: true, close: vi.fn() } as unknown as Window)
    const authorizeFailure = api({
      getConnection: vi.fn().mockResolvedValue(null),
      authorize: vi.fn().mockRejectedValue(new Error('provider-secret')),
    })
    const second = render(<DeployPanel projectId={projectId} workspaceId={workspaceId} revisions={[revision]} api={authorizeFailure} />)
    await userEvent.click(screen.getByRole('button', { name: 'Triển khai' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Kết nối Vercel' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể kết nối Vercel.')
    second.unmount()

    const refreshFailure = api({ get: vi.fn().mockRejectedValue(new Error('provider-secret')) })
    render(<DeployPanel projectId={projectId} workspaceId={workspaceId} revisions={[revision]} api={refreshFailure} />)
    await userEvent.click(screen.getByRole('button', { name: 'Triển khai' }))
    await screen.findByText('Vercel đã kết nối')
    await userEvent.click(screen.getByRole('checkbox', { name: /xác nhận triển khai/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Bắt đầu triển khai' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể cập nhật trạng thái triển khai.')
  })

  it('validates browser API envelopes and sends only the public deployment contract', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { url: 'https://vercel.com/integrations/zenui/new' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { ...connection, status: 'disconnected' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: queued }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: ready }), { status: 200 }))

    await expect(browserDeployApi.getConnection(workspaceId)).resolves.toBeNull()
    await expect(browserDeployApi.authorize({ workspaceId, returnPath: `/projects/${projectId}` }))
      .resolves.toEqual({ url: 'https://vercel.com/integrations/zenui/new' })
    await expect(browserDeployApi.disconnect(workspaceId)).resolves.toMatchObject({ status: 'disconnected' })
    await expect(browserDeployApi.create(projectId, {
      workspaceId, revisionId, requestId: deploymentId, target: 'preview', confirmed: true,
    })).resolves.toEqual(queued)
    await expect(browserDeployApi.get(projectId, workspaceId, deploymentId)).resolves.toEqual(ready)

    expect(fetch.mock.calls[2]?.[1]).toMatchObject({ method: 'DELETE' })
    expect(fetch.mock.calls[3]?.[1]).toMatchObject({ method: 'POST' })
    expect(fetch.mock.calls[4]?.[0]).toBe(`/api/v1/projects/${projectId}/deployments/${deploymentId}?workspaceId=${encodeURIComponent(workspaceId)}`)

    fetch.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 500 }))
    await expect(browserDeployApi.getConnection(workspaceId)).rejects.toThrow('deploy_request_failed')
  })
})
