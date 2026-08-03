import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AssetLibraryPanel, createBrowserAssetLibraryApi } from '../app/editor/asset-library-panel'

const projectId = '11111111-1111-4111-8111-111111111111'
const workspaceId = '22222222-2222-4222-8222-222222222222'
const assetId = '33333333-3333-4333-8333-333333333333'

const readyAsset = {
  id: assetId,
  scope: 'project' as const,
  status: 'ready' as const,
  source: 'upload' as const,
  width: 1200,
  height: 800,
  bytes: 1024,
  contentType: 'image/webp' as const,
  defaultAlt: 'Product dashboard',
  attribution: null,
  errorCode: null,
  archived: false,
  createdAt: '2026-07-29T00:00:00.000Z',
  updatedAt: '2026-07-29T00:00:00.000Z',
}

describe('Asset Library panel', () => {
  it('sends explicit trusted Origin on browser mutations and keeps reads same-origin', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(Response.json({ data: readyAsset })))
    const originalOrigin = window.location.origin
    const api = createBrowserAssetLibraryApi(projectId, workspaceId)

    await api.poll(assetId)
    await api.importResult({ requestId: assetId, resultId: '42', defaultAlt: 'Planning board' })

    expect(fetchMock).toHaveBeenNthCalledWith(1, `/api/v1/projects/${projectId}/assets/${assetId}?workspaceId=${workspaceId}`)
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/v1/projects/${projectId}/assets/imports`, expect.objectContaining({
      headers: expect.objectContaining({ origin: originalOrigin }),
    }))
  })

  it('keeps asset management available without an image target', async () => {
    render(<AssetLibraryPanel
      projectId={projectId}
      workspaceId={workspaceId}
      assetOrigin="https://assets.example.com"
      canManageAssets
      canApply={false}
      api={{
        list: vi.fn().mockResolvedValue([]),
        upload: vi.fn(), search: vi.fn(), importResult: vi.fn(), createDerivative: vi.fn(), poll: vi.fn(),
      }}
      onApply={vi.fn()}
    />)

    expect(await screen.findByLabelText('Tải ảnh của bạn')).toBeVisible()
    expect(screen.getByLabelText('Tìm ảnh')).toBeVisible()
    expect(screen.getByText('Chọn vùng Thêm ảnh hoặc Thay ảnh trên website trước.')).toBeVisible()
    expect(screen.getByText(/JPEG, PNG hoặc WebP/)).toHaveTextContent('1200×675')
    expect(screen.queryByRole('button', { name: 'Dùng ảnh đã chọn' })).toBeNull()
  })

  it('loads ready assets and requires explicit accessible metadata before applying', async () => {
    const apply = vi.fn()
    render(<AssetLibraryPanel
      projectId={projectId}
      workspaceId={workspaceId}
      assetOrigin="https://assets.example.com"
      canManageAssets
      canApply
      api={{
        list: vi.fn().mockResolvedValue([readyAsset]),
        upload: vi.fn(), search: vi.fn(), importResult: vi.fn(), createDerivative: vi.fn(), poll: vi.fn(),
      }}
      onApply={apply}
    />)

    await screen.findByRole('button', { name: /Product dashboard/ })
    await userEvent.setup().click(screen.getByRole('button', { name: /Product dashboard/ }))
    expect(screen.getByAltText('Product dashboard')).toHaveAttribute('src', `https://assets.example.com/a/${assetId}`)

    await userEvent.setup().clear(screen.getByLabelText('Mô tả ảnh'))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dùng ảnh đã chọn' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Hãy nhập mô tả ảnh hoặc đánh dấu ảnh trang trí.')
    expect(apply).not.toHaveBeenCalled()

    await userEvent.setup().click(screen.getByLabelText('Ảnh chỉ để trang trí'))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dùng ảnh đã chọn' }))
    expect(apply).toHaveBeenCalledWith({ assetId, alt: '', decorative: true })
  })

  it('uploads, creates a bounded immutable crop and applies the ready derivative', async () => {
    const derivative = { ...readyAsset, id: '66666666-6666-4666-8666-666666666666', source: 'derivative' as const }
    const upload = vi.fn().mockResolvedValue({ ...readyAsset, status: 'queued', width: null, height: null, bytes: null, contentType: null })
    const poll = vi.fn()
      .mockResolvedValueOnce(readyAsset)
      .mockResolvedValueOnce(derivative)
    const createDerivative = vi.fn().mockResolvedValue({ ...derivative, status: 'queued', width: null, height: null, bytes: null, contentType: null })
    const apply = vi.fn()
    render(<AssetLibraryPanel
      projectId={projectId}
      workspaceId={workspaceId}
      assetOrigin="https://assets.example.com"
      canManageAssets
      canApply
      api={{ list: vi.fn().mockResolvedValue([]), upload, search: vi.fn(), importResult: vi.fn(), createDerivative, poll }}
      onApply={apply}
    />)

    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'launch.jpg', { type: 'image/jpeg' })
    await userEvent.setup().upload(screen.getByLabelText('Tải ảnh của bạn'), file)
    expect(await screen.findByRole('button', { name: /Product dashboard/ })).toBeVisible()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cắt ảnh vuông' }))
    await waitFor(() => expect(createDerivative).toHaveBeenCalledWith(assetId, expect.objectContaining({
      transform: { x: 0, y: 0, width: 1, height: 1, outputWidth: 800, outputHeight: 800 },
    })))
    await waitFor(() => expect(screen.getAllByAltText('Product dashboard')[0]).toHaveAttribute('src', `https://assets.example.com/a/${derivative.id}`))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dùng ảnh đã chọn' }))
    expect(apply).toHaveBeenCalledWith({ assetId: derivative.id, alt: 'Product dashboard', decorative: false })
  })

  it('imports only a provider result ID and applies after bounded polling reaches ready', async () => {
    const apply = vi.fn()
    const importResult = vi.fn().mockResolvedValue({ ...readyAsset, status: 'queued', width: null, height: null, bytes: null, contentType: null })
    const poll = vi.fn().mockResolvedValue(readyAsset)
    render(<AssetLibraryPanel
      projectId={projectId}
      workspaceId={workspaceId}
      assetOrigin="https://assets.example.com"
      canManageAssets
      canApply
      api={{
        list: vi.fn().mockResolvedValue([]), upload: vi.fn(),
        search: vi.fn().mockResolvedValue([{
          resultId: '42', width: 1200, height: 800,
          previewUrl: 'https://images.pexels.com/photos/42/medium.jpeg', alt: 'Planning board',
          attribution: { provider: 'pexels' as const, creatorName: 'Ada', creatorUrl: 'https://www.pexels.com/@ada' },
        }]),
        importResult, createDerivative: vi.fn(), poll,
      }}
      onApply={apply}
    />)

    await userEvent.setup().type(screen.getByLabelText('Tìm ảnh'), 'launch')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tìm' }))
    await screen.findByText('Planning board')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Nhập ảnh Planning board' }))

    await waitFor(() => expect(importResult).toHaveBeenCalledWith(expect.objectContaining({ resultId: '42' })))
    expect(JSON.stringify(importResult.mock.calls)).not.toContain('images.pexels.com')
    await waitFor(() => expect(poll).toHaveBeenCalledWith(assetId))
    expect(await screen.findByRole('button', { name: /Product dashboard/ })).toBeVisible()
  })

  it('keeps viewers read-only and exposes safe retry state', async () => {
    render(<AssetLibraryPanel
      projectId={projectId}
      workspaceId={workspaceId}
      assetOrigin="https://assets.example.com"
      canManageAssets={false}
      canApply={false}
      api={{
        list: vi.fn().mockRejectedValue(new Error('private object key')),
        upload: vi.fn(), search: vi.fn(), importResult: vi.fn(), createDerivative: vi.fn(), poll: vi.fn(),
      }}
      onApply={vi.fn()}
    />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải thư viện ảnh.')
    expect(screen.queryByLabelText('Tải ảnh của bạn')).toBeNull()
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeVisible()
    expect(document.body.textContent).not.toContain('private object key')
  })
})
