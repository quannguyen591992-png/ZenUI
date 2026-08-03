import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ExportPanel, type ExportApi } from '../app/editor/export-panel'

const projectId = '11111111-1111-4111-8111-111111111111'
const workspaceId = '22222222-2222-4222-8222-222222222222'
const exportId = '33333333-3333-4333-8333-333333333333'
const queued = { id: exportId, projectId, status: 'queued' as const, expectedVersion: 1, documentVersion: 1, artifact: null, errorCode: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
const completed = {
  ...queued,
  status: 'completed' as const,
  artifact: { bytes: 1200, checksum: 'a'.repeat(64), contentType: 'application/zip' as const, routeCount: 2 },
}

function api(overrides: Partial<ExportApi> = {}): ExportApi {
  return {
    create: () => Promise.resolve(queued),
    get: () => Promise.resolve(completed),
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('export panel', () => {
  it('creates a durable export, polls completion and exposes authenticated download', async () => {
    const create = vi.fn().mockResolvedValue(queued)
    render(<ExportPanel projectId={projectId} workspaceId={workspaceId} expectedVersion={1} canExport api={api({ create })} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Xuất website' }))
    expect(create).toHaveBeenCalledWith(projectId, expect.objectContaining({ workspaceId, expectedVersion: 1, requestId: expect.any(String) }))
    expect(await screen.findByText('Tệp xuất đã sẵn sàng')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Tải website ZIP' })).toHaveAttribute('href', expect.stringContaining(`/exports/${exportId}/download`))
    expect(screen.getByText(/2 trang/)).toBeVisible()
    expect(screen.getByText(/1\.200 byte/)).toBeVisible()
  })

  it('uses the browser API adapter and validates redacted envelopes', async () => {
    const { browserExportApi } = await import('../app/editor/export-panel')
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: queued }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: completed }), { status: 200 })))
    await expect(browserExportApi.create(projectId, { workspaceId, requestId: crypto.randomUUID(), expectedVersion: 1 }))
      .resolves.toEqual(queued)
    await expect(browserExportApi.get(projectId, workspaceId, exportId)).resolves.toEqual(completed)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'internal_error' } }), { status: 500 })))
    await expect(browserExportApi.get(projectId, workspaceId, exportId)).rejects.toThrow('export_request_failed')
  })

  it('shows polling failures and terminal failed exports safely', async () => {
    const refreshFailure = api({ get: () => Promise.reject(new Error('storage secret')) })
    const view = render(<ExportPanel projectId={projectId} workspaceId={workspaceId} expectedVersion={1} canExport api={refreshFailure} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Xuất website' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không thể cập nhật trạng thái xuất tệp.'))
    view.unmount()

    render(<ExportPanel projectId={projectId} workspaceId={workspaceId} expectedVersion={1} canExport api={api({
      get: () => Promise.resolve({ ...queued, status: 'failed', errorCode: 'storage_unavailable' }),
    })} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Xuất website' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Kho lưu trữ tạm thời chưa sẵn sàng. Vui lòng thử lại sau.'))
  })

  it('disables unsafe exports and reports safe failures', async () => {
    const create = vi.fn().mockRejectedValue(new Error('S3 key secret'))
    const view = render(<ExportPanel projectId={projectId} workspaceId={workspaceId} expectedVersion={1} canExport={false} api={api({ create })} />)
    expect(screen.getByRole('button', { name: 'Xuất website' })).toBeDisabled()
    view.rerender(<ExportPanel projectId={projectId} workspaceId={workspaceId} expectedVersion={1} canExport api={api({ create })} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Xuất website' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không thể bắt đầu xuất tệp.'))
    expect(screen.queryByText(/S3|secret/)).toBeNull()
  })
})
