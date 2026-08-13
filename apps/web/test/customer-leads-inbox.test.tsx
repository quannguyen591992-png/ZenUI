import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CustomerLeadsInbox } from '../app/projects/[projectId]/customer-leads-inbox'

const projectId = '11111111-1111-4111-8111-111111111111'
const workspaceId = '22222222-2222-4222-8222-222222222222'
const firstLeadId = '33333333-3333-4333-8333-333333333333'
const secondLeadId = '44444444-4444-4444-8444-444444444444'

function summary(id = firstLeadId, status: 'new' | 'contacted' = 'new') {
  return {
    id,
    status,
    version: status === 'new' ? 1 : 2,
    formTitle: id === firstLeadId ? 'Nhận tư vấn' : 'Đăng ký demo',
    receivedAt: '2026-08-13T08:00:00.000Z',
    expiresAt: '2026-11-11T08:00:00.000Z',
    contactedAt: status === 'contacted'
      ? '2026-08-13T09:00:00.000Z'
      : null,
  }
}

function json(data: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(
    status < 400 ? { data } : { error: data },
  ), {
    status,
    headers: { 'content-type': 'application/json' },
  }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Customer Leads Inbox', () => {
  it('shows safe empty/error states and retries the summary list', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => json({
        code: 'internal_error',
        message: 'Không thể tải',
      }, 500))
      .mockImplementationOnce(() => json([]))
    vi.stubGlobal('fetch', fetchMock)

    render(<CustomerLeadsInbox
      projectId={projectId}
      workspaceId={workspaceId}
      onLeadContacted={vi.fn()}
    />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không thể tải danh sách khách hàng',
    )
    await userEvent.setup().click(screen.getByRole('button', {
      name: 'Thử lại',
    }))
    expect(await screen.findByText(
      'Chưa có khách hàng nào gửi biểu mẫu.',
    )).toBeVisible()
  })

  it('clears old PII immediately while loading another lead detail', async () => {
    let resolveSecond: ((response: Response) => void) | undefined
    const secondDetail = new Promise<Response>(resolve => {
      resolveSecond = resolve
    })
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL ? input.href : input.url
      if (url.includes(`/${secondLeadId}?`)) return secondDetail
      if (url.includes(`/${firstLeadId}?`)) {
        return json({
          ...summary(firstLeadId),
          fields: [{
            key: 'email',
            type: 'email',
            label: 'Email',
            value: 'first@example.test',
          }],
        })
      }
      return json([summary(firstLeadId), summary(secondLeadId)])
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CustomerLeadsInbox
      projectId={projectId}
      workspaceId={workspaceId}
      onLeadContacted={vi.fn()}
    />)
    await userEvent.setup().click(await screen.findByRole('button', {
      name: /Nhận tư vấn/,
    }))
    expect(await screen.findByText('first@example.test')).toBeVisible()

    await userEvent.setup().click(screen.getByRole('button', {
      name: /Đăng ký demo/,
    }))
    expect(screen.queryByText('first@example.test')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Đang tải thông tin khách hàng',
    )

    resolveSecond?.(await json({
      ...summary(secondLeadId),
      fields: [{
        key: 'phone',
        type: 'tel',
        label: 'Số điện thoại',
        value: '0900000000',
      }],
    }))
    expect(await screen.findByText('0900000000')).toBeVisible()
  })

  it('marks a new lead contacted and persists the server response in list and detail', async () => {
    const onLeadContacted = vi.fn()
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL ? input.href : input.url
      if (init?.method === 'PATCH') {
        return json(summary(firstLeadId, 'contacted'))
      }
      if (url.includes(`/${firstLeadId}?`)) {
        return json({
          ...summary(firstLeadId),
          fields: [{
            key: 'email',
            type: 'email',
            label: 'Email',
            value: 'visitor@example.test',
          }],
        })
      }
      return json([summary()])
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CustomerLeadsInbox
      projectId={projectId}
      workspaceId={workspaceId}
      onLeadContacted={onLeadContacted}
    />)
    await userEvent.setup().click(await screen.findByRole('button', {
      name: /Nhận tư vấn/,
    }))
    await userEvent.setup().click(await screen.findByRole('button', {
      name: 'Đánh dấu đã liên hệ',
    }))

    expect(await screen.findAllByText('Đã liên hệ')).toHaveLength(2)
    expect(onLeadContacted).toHaveBeenCalledTimes(1)
    const patchCall = fetchMock.mock.calls.find(([, init]) => (
      init?.method === 'PATCH'
    ))
    expect(typeof patchCall?.[1]?.body).toBe('string')
    if (typeof patchCall?.[1]?.body !== 'string') {
      throw new Error('Expected a JSON request body')
    }
    expect(JSON.parse(patchCall[1].body)).toEqual({
      workspaceId,
      expectedVersion: 1,
    })
  })
})
