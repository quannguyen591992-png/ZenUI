import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { BrandKitPanel, createBrowserBrandKitApi } from '../app/editor/brand-kit-panel'

const projectId = '11111111-1111-4111-8111-111111111111'
const workspaceId = '22222222-2222-4222-8222-222222222222'

const kit = {
  version: 1,
  name: 'NovaFlow',
  logoAssetId: null,
  colors: { primary: '#2563eb', background: '#ffffff', text: '#0f172a' },
  fonts: { heading: 'Manrope' as const, body: 'Arial' as const },
}

describe('Brand Kit panel', () => {
  it('sends the trusted browser Origin on save and apply mutations', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(Response.json({ data: kit })))
    const api = createBrowserBrandKitApi(projectId, workspaceId)

    await api.save({ ...kit, expectedVersion: kit.version })
    await api.apply({ expectedBrandKitVersion: kit.version, expectedDocumentVersion: 1 })

    for (const call of fetchMock.mock.calls) {
      expect(call[1]).toEqual(expect.objectContaining({
        headers: expect.objectContaining({ origin: window.location.origin }),
      }))
    }
  })

  it('previews without mutation, validates contrast, then saves and applies atomically', async () => {
    const save = vi.fn().mockResolvedValue({ ...kit, version: 2, name: 'NovaFlow Studio' })
    const apply = vi.fn().mockResolvedValue({ version: 4, document: { version: 4 } })
    const accepted = vi.fn()
    render(<BrandKitPanel
      projectId={projectId}
      workspaceId={workspaceId}
      expectedDocumentVersion={3}
      canManage
      api={{ load: vi.fn().mockResolvedValue(kit), save, apply }}
      onApplied={accepted}
    />)

    expect(await screen.findByText('NovaFlow')).toBeVisible()
    await userEvent.setup().clear(screen.getByLabelText('Tên thương hiệu'))
    await userEvent.setup().type(screen.getByLabelText('Tên thương hiệu'), 'NovaFlow Studio')
    expect(screen.getByTestId('brand-preview')).toHaveTextContent('NovaFlow Studio')
    expect(save).not.toHaveBeenCalled()

    await userEvent.setup().clear(screen.getByLabelText('Màu chữ thương hiệu'))
    await userEvent.setup().type(screen.getByLabelText('Màu chữ thương hiệu'), '#ffffff')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Lưu Brand Kit' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Độ tương phản')
    expect(save).not.toHaveBeenCalled()

    await userEvent.setup().clear(screen.getByLabelText('Màu chữ thương hiệu'))
    await userEvent.setup().type(screen.getByLabelText('Màu chữ thương hiệu'), '#0f172a')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Lưu Brand Kit' }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 1, name: 'NovaFlow Studio' }))

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Áp dụng cho website' }))
    expect(apply).toHaveBeenCalledWith({ expectedBrandKitVersion: 2, expectedDocumentVersion: 3 })
    expect(accepted).toHaveBeenCalledWith({ version: 4, document: { version: 4 } })
  })

  it('keeps non-owners read-only and redacts dependency errors', async () => {
    render(<BrandKitPanel
      projectId={projectId}
      workspaceId={workspaceId}
      expectedDocumentVersion={1}
      canManage={false}
      api={{ load: vi.fn().mockRejectedValue(new Error('database-secret')), save: vi.fn(), apply: vi.fn() }}
      onApplied={vi.fn()}
    />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải Brand Kit.')
    expect(screen.queryByRole('button', { name: 'Lưu Brand Kit' })).toBeNull()
    expect(document.body.textContent).not.toContain('database-secret')
  })
})
