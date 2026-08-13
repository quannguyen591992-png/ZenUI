import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SharePanel, type ShareApi } from '../app/editor/share-panel'

const projectId = '11111111-1111-4111-8111-111111111111'
const workspaceId = '22222222-2222-4222-8222-222222222222'
const revisionId = '33333333-3333-4333-8333-333333333333'
const link = {
  id: '44444444-4444-4444-8444-444444444444',
  revisionId,
  url: `http://127.0.0.1:3000/s/${'A'.repeat(32)}`,
  status: 'active' as const,
  expiresAt: null,
  createdAt: '2026-07-22T12:00:00.000Z',
  updatedAt: '2026-07-22T12:00:00.000Z',
  leadFormsLive: false,
}
const revisions = [{ id: revisionId, documentVersion: 1, summary: 'Public snapshot', source: 'manual', createdAt: '2026-07-22T12:00:00.000Z' }]

afterEach(cleanup)

function api(overrides: Partial<ShareApi> = {}): ShareApi {
  return {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(link),
    disable: vi.fn().mockResolvedValue({ ...link, status: 'disabled' }),
    ...overrides,
  }
}

describe('SharePanel', () => {
  it('shares the latest saved website in Simple mode without exposing revision selection', async () => {
    const ensureLatestSavedRevision = vi.fn().mockResolvedValue(revisions[0])
    const create = vi.fn().mockResolvedValue(link)
    const user = userEvent.setup()
    render(<SharePanel
      projectId={projectId}
      workspaceId={workspaceId}
      revisions={revisions}
      presentation="simple"
      canShare
      ensureLatestSavedRevision={ensureLatestSavedRevision}
      api={api({ create })}
    />)

    await user.click(screen.getByRole('button', { name: 'Chia sẻ' }))
    expect(screen.getByText('Ai có liên kết đều có thể xem website đã lưu mới nhất.')).toBeVisible()
    expect(screen.getByText('Công cụ tìm kiếm được yêu cầu không lập chỉ mục liên kết này.')).toBeVisible()
    expect(screen.queryByLabelText('Phiên bản để chia sẻ')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tạo liên kết chia sẻ' }))

    expect(ensureLatestSavedRevision).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith(projectId, expect.objectContaining({ workspaceId, revisionId }))
    expect(await screen.findByRole('link', { name: 'Mở website được chia sẻ' })).toHaveAttribute('href', link.url)
    expect(screen.queryByText(revisionId)).not.toBeInTheDocument()
    await user.click(screen.getByText('Chi tiết nâng cao'))
    expect(screen.getByText(`Revision ${revisionId}`)).toBeVisible()
  })

  it('labels only confirmed live Lead Form shares as receiving customers', async () => {
    const liveLink = {
      ...link,
      id: '55555555-5555-4555-8555-555555555555',
      leadFormsLive: true,
    }
    const user = userEvent.setup()
    render(<SharePanel
      projectId={projectId}
      workspaceId={workspaceId}
      revisions={revisions}
      presentation="simple"
      canShare
      ensureLatestSavedRevision={() => Promise.resolve(revisions[0]!)}
      api={api({
        list: vi.fn().mockResolvedValue([liveLink, link]),
      })}
    />)

    await user.click(screen.getByRole('button', { name: 'Chia sẻ' }))
    expect(await screen.findByText(
      'Chia sẻ website để nhận khách hàng',
    )).toBeVisible()
    expect(screen.getByText(
      'Thông tin khách hàng được lưu tối đa 90 ngày.',
    )).toBeVisible()
    expect(screen.getAllByText(
      'Website nhận khách hàng',
    )).toHaveLength(1)
    expect(screen.getAllByText(
      'Website được chia sẻ',
    )).toHaveLength(1)
  })

  it('blocks new Simple share links until the latest edits are saved', async () => {
    render(<SharePanel
      projectId={projectId}
      workspaceId={workspaceId}
      revisions={revisions}
      presentation="simple"
      canShare={false}
      ensureLatestSavedRevision={() => Promise.resolve(revisions[0]!)}
      api={api()}
    />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Chia sẻ' }))
    expect(screen.getByRole('button', { name: 'Tạo liên kết chia sẻ' })).toBeDisabled()
    expect(screen.getByText('Hãy đợi website lưu xong trước khi tạo liên kết mới.')).toBeVisible()
  })

  it('asks for confirmation before disabling a Simple share link', async () => {
    const disable = vi.fn().mockResolvedValue({ ...link, status: 'disabled' })
    const user = userEvent.setup()
    render(<SharePanel
      projectId={projectId}
      workspaceId={workspaceId}
      revisions={revisions}
      presentation="simple"
      canShare
      ensureLatestSavedRevision={() => Promise.resolve(revisions[0]!)}
      api={api({ list: vi.fn().mockResolvedValue([link]), disable })}
    />)

    await user.click(screen.getByRole('button', { name: 'Chia sẻ' }))
    await user.click(await screen.findByRole('button', { name: 'Tắt liên kết chia sẻ' }))
    expect(disable).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Tắt liên kết chia sẻ?' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Xác nhận tắt liên kết' }))
    expect(disable).toHaveBeenCalledWith(projectId, workspaceId, link.id)
  })

  it('loads an empty state and requires an immutable revision', async () => {
    render(<SharePanel projectId={projectId} workspaceId={workspaceId} revisions={[]} api={api()} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Chia sẻ' }))
    expect(await screen.findByText('Hãy tạo một phiên bản trước khi chia sẻ.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Tạo liên kết chia sẻ' })).toBeDisabled()
  })

  it('creates, copies, opens and disables a revision-pinned link', async () => {
    const create = vi.fn().mockResolvedValue(link)
    const disable = vi.fn().mockResolvedValue({ ...link, status: 'disabled' })
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    render(<SharePanel projectId={projectId} workspaceId={workspaceId} revisions={revisions} api={api({ create, disable })} />)

    await user.click(screen.getByRole('button', { name: 'Chia sẻ' }))
    await user.click(screen.getByRole('button', { name: 'Tạo liên kết chia sẻ' }))
    expect(await screen.findByRole('link', { name: 'Mở Public snapshot' })).toHaveAttribute('href', link.url)
    expect(screen.getByRole('link', { name: 'Mở Public snapshot' })).toHaveAttribute('rel', 'noreferrer')
    await user.click(screen.getByRole('button', { name: 'Sao chép liên kết Public snapshot' }))
    expect(writeText).toHaveBeenCalledWith(link.url)
    expect(await screen.findByText('Đã sao chép liên kết chia sẻ')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Tắt liên kết Public snapshot' }))
    expect(disable).toHaveBeenCalledWith(projectId, workspaceId, link.id)
    expect(await screen.findByText('Đã tắt')).toBeVisible()
  })

  it('renders create, disable and copy failures safely', async () => {
    const user = userEvent.setup()
    const failedApi = api({
      create: () => Promise.reject(new Error('secret')),
      disable: () => Promise.reject(new Error('secret')),
      list: () => Promise.resolve([link]),
    })
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('blocked'))
    render(<SharePanel projectId={projectId} workspaceId={workspaceId} revisions={revisions} api={failedApi} />)
    await user.click(screen.getByRole('button', { name: 'Chia sẻ' }))
    await screen.findByRole('link', { name: 'Mở Public snapshot' })
    await user.click(screen.getByRole('button', { name: 'Sao chép liên kết Public snapshot' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể sao chép liên kết chia sẻ.')
    await user.click(screen.getByRole('button', { name: 'Tắt liên kết Public snapshot' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tắt liên kết chia sẻ.')
    await user.click(screen.getByRole('button', { name: 'Tạo liên kết chia sẻ' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tạo liên kết chia sẻ.')
  })

  it('prevents duplicate create submissions and renders safe failures', async () => {
    let resolveCreate: (value: typeof link) => void = () => undefined
    const create = vi.fn(() => new Promise<typeof link>(resolve => { resolveCreate = resolve }))
    const user = userEvent.setup()
    render(<SharePanel projectId={projectId} workspaceId={workspaceId} revisions={revisions} api={api({ create })} />)
    await user.click(screen.getByRole('button', { name: 'Chia sẻ' }))
    const button = screen.getByRole('button', { name: 'Tạo liên kết chia sẻ' })
    await user.click(button)
    expect(button).toBeDisabled()
    expect(create).toHaveBeenCalledTimes(1)
    resolveCreate(link)
    await waitFor(() => expect(screen.getByText('Đã tạo liên kết chia sẻ')).toBeVisible())

    cleanup()
    render(<SharePanel projectId={projectId} workspaceId={workspaceId} revisions={revisions} api={api({ list: () => Promise.reject(new Error('secret')) })} />)
    await user.click(screen.getByRole('button', { name: 'Chia sẻ' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải liên kết chia sẻ.')
  })
})
