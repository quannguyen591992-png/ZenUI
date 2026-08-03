import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  AiAssistant,
  type AiAssistantApi,
  type AiRunSummary,
} from '../app/editor/ai-assistant'

const projectId = '11111111-1111-4111-8111-111111111111'
const workspaceId = '22222222-2222-4222-8222-222222222222'

const completed: AiRunSummary = {
  id: '33333333-3333-4333-8333-333333333333',
  mode: 'generate',
  status: 'completed',
  repairCount: 0,
  errorCode: null,
  usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
  documentVersion: 2,
  revisionId: '44444444-4444-4444-8444-444444444444',
}

function api(overrides: Partial<AiAssistantApi> = {}): AiAssistantApi {
  return {
    listRuns: () => Promise.resolve([]),
    createRun: () => Promise.resolve({ ...completed, status: 'queued', documentVersion: null, revisionId: null }),
    subscribe: (_projectId, _workspaceId, _runId, onEvent) => {
      queueMicrotask(() => onEvent(completed))
      return () => undefined
    },
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AI Assistant', () => {
  it('loads an empty state and validates selection mode accessibly', async () => {
    render(<AiAssistant
      projectId={projectId}
      workspaceId={workspaceId}
      expectedVersion={1}
      selectedNodeId={null}
      canSubmit
      api={api()}
      onCompleted={() => Promise.resolve()}
    />)

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải lịch sử AI')
    expect(await screen.findByText('Chưa có lần chạy AI nào.')).toBeVisible()
    await userEvent.setup().selectOptions(screen.getByLabelText('Chế độ AI'), 'edit-selection')
    expect(screen.getByText('Hãy chọn một thành phần trước khi dùng chế độ này.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Chạy AI' })).toBeDisabled()
  })

  it('submits a generation request, streams status and reloads canonical server state', async () => {
    const createRun = vi.fn().mockResolvedValue({ ...completed, status: 'queued', documentVersion: null, revisionId: null })
    const onCompleted = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<AiAssistant
      projectId={projectId}
      workspaceId={workspaceId}
      expectedVersion={1}
      selectedNodeId="heading-1"
      canSubmit
      api={api({ createRun })}
      onCompleted={onCompleted}
    />)

    await screen.findByText('Chưa có lần chạy AI nào.')
    await user.type(screen.getByLabelText('Yêu cầu cho AI'), 'Create a focused launch page')
    await user.click(screen.getByRole('button', { name: 'Chạy AI' }))

    expect(createRun).toHaveBeenCalledWith(projectId, expect.objectContaining({
      workspaceId,
      mode: 'generate',
      prompt: 'Create a focused launch page',
      expectedVersion: 1,
      requestId: expect.any(String),
    }))
    expect((await screen.findAllByText('AI đã hoàn tất'))[0]).toBeVisible()
    expect(screen.getByText('30 token')).toBeVisible()
    await waitFor(() => expect(onCompleted).toHaveBeenCalledWith(completed))
  })

  it('sends selected node scope and keeps the prompt out of browser storage', async () => {
    const createRun = vi.fn().mockResolvedValue({ ...completed, mode: 'edit-selection', status: 'failed', errorCode: 'scope_violation' })
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const user = userEvent.setup()
    render(<AiAssistant
      projectId={projectId}
      workspaceId={workspaceId}
      expectedVersion={4}
      selectedNodeId="heading-1"
      canSubmit
      api={api({ createRun, subscribe: () => () => undefined })}
      onCompleted={() => Promise.resolve()}
    />)

    await screen.findByText('Chưa có lần chạy AI nào.')
    await user.selectOptions(screen.getByLabelText('Chế độ AI'), 'edit-selection')
    await user.type(screen.getByLabelText('Yêu cầu cho AI'), 'Improve this selected heading')
    await user.click(screen.getByRole('button', { name: 'Chạy AI' }))

    expect(createRun).toHaveBeenCalledWith(projectId, expect.objectContaining({
      mode: 'edit-selection', selectedNodeId: 'heading-1', expectedVersion: 4,
    }))
    expect(setItem).not.toHaveBeenCalled()
  })

  it('disables submission while autosave is unsafe and shows safe list failures', async () => {
    render(<AiAssistant
      projectId={projectId}
      workspaceId={workspaceId}
      expectedVersion={1}
      selectedNodeId="heading-1"
      canSubmit={false}
      api={api({ listRuns: () => Promise.reject(new Error('SQL and secret provider response')) })}
      onCompleted={() => Promise.resolve()}
    />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải lịch sử AI.')
    expect(screen.getByRole('button', { name: 'Chạy AI' })).toBeDisabled()
    expect(screen.queryByText(/SQL|secret provider/i)).toBeNull()
  })

  it('renders repairing and failed status events with safe actionable labels', async () => {
    const createRun = vi.fn().mockResolvedValue({
      ...completed, status: 'queued', documentVersion: null, revisionId: null,
    })
    const subscribe: AiAssistantApi['subscribe'] = (_projectId, _workspaceId, _runId, onEvent, onError) => {
      onEvent({ ...completed, status: 'repairing', repairCount: 1, documentVersion: null, revisionId: null })
      onError?.()
      queueMicrotask(() => onEvent({
        ...completed, status: 'failed', errorCode: 'invalid_model_output', documentVersion: null, revisionId: null,
      }))
      return () => undefined
    }
    const user = userEvent.setup()
    render(<AiAssistant
      projectId={projectId}
      workspaceId={workspaceId}
      expectedVersion={1}
      selectedNodeId="heading-1"
      canSubmit
      api={api({ createRun, subscribe })}
      onCompleted={() => Promise.resolve()}
    />)
    await screen.findByText('Chưa có lần chạy AI nào.')
    await user.type(screen.getByLabelText('Yêu cầu cho AI'), 'Repair this safely')
    await user.click(screen.getByRole('button', { name: 'Chạy AI' }))

    expect((await screen.findAllByText('AI đã dừng an toàn'))[0]).toBeVisible()
    expect(screen.getByText('Trang được tạo chưa đạt cấu trúc an toàn. Hãy thử mô tả ngắn gọn và tập trung hơn.')).toBeVisible()
    expect(screen.queryByText('Error: invalid_model_output')).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent('Kết nối trạng thái AI đã bị gián đoạn.')
  })

  it('explains token budget failures without exposing internal limits', async () => {
    const user = userEvent.setup()
    render(<AiAssistant
      projectId={projectId}
      workspaceId={workspaceId}
      expectedVersion={1}
      selectedNodeId={null}
      canSubmit
      api={api({
        createRun: () => Promise.resolve({ ...completed, status: 'queued', documentVersion: null, revisionId: null }),
        subscribe: (_projectId, _workspaceId, _runId, onEvent) => {
          queueMicrotask(() => onEvent({ ...completed, status: 'failed', errorCode: 'budget_exceeded', documentVersion: null, revisionId: null }))
          return () => undefined
        },
      })}
      onCompleted={() => Promise.resolve()}
    />)
    await screen.findByText('Chưa có lần chạy AI nào.')
    await user.type(screen.getByLabelText('Yêu cầu cho AI'), 'Generate a concise page')
    await user.click(screen.getByRole('button', { name: 'Chạy AI' }))

    expect(await screen.findByText('Yêu cầu AI vượt quá giới hạn xử lý an toàn. Hãy rút gọn mô tả rồi thử lại.')).toBeVisible()
    expect(screen.queryByText(/12000|8000/)).toBeNull()
  })

  it('shows a safe create failure and keeps retry available', async () => {
    const user = userEvent.setup()
    render(<AiAssistant
      projectId={projectId}
      workspaceId={workspaceId}
      expectedVersion={1}
      selectedNodeId={null}
      canSubmit
      api={api({ createRun: () => Promise.reject(new Error('secret provider response')) })}
      onCompleted={() => Promise.resolve()}
    />)
    await screen.findByText('Chưa có lần chạy AI nào.')
    await user.type(screen.getByLabelText('Yêu cầu cho AI'), 'Generate safely')
    await user.click(screen.getByRole('button', { name: 'Chạy AI' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể bắt đầu yêu cầu AI.')
    expect(screen.getByRole('button', { name: 'Chạy AI' })).toBeEnabled()
  })

  it('browser adapter reads safe envelopes and closes malformed event streams', async () => {
    const { browserAiAssistantApi } = await import('../app/editor/ai-assistant')
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [completed] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: completed }), { status: 202 })))
    await expect(browserAiAssistantApi.listRuns(projectId, workspaceId)).resolves.toEqual([completed])
    await expect(browserAiAssistantApi.createRun(projectId, {
      workspaceId, requestId: crypto.randomUUID(), mode: 'generate', prompt: 'Generate', expectedVersion: 1,
    })).resolves.toEqual(completed)

    const listeners: Record<string, (event: Event) => void> = {}
    const eventSourceClose = vi.fn()
    class FakeEventSource {
      constructor(_url: string) {}
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        listeners[type] = listener as (event: Event) => void
      }
      close() { eventSourceClose() }
    }
    vi.stubGlobal('EventSource', FakeEventSource)
    const error = vi.fn()
    const close = browserAiAssistantApi.subscribe(projectId, workspaceId, completed.id, vi.fn(), error)
    listeners.status?.(new MessageEvent('status', { data: '{invalid' }))
    listeners.error?.(new Event('error'))
    expect(error).toHaveBeenCalledTimes(2)
    close()
    expect(eventSourceClose).toHaveBeenCalledOnce()
  })

  it('cleans up the event subscription on unmount', async () => {
    const close = vi.fn()
    const createRun = vi.fn().mockResolvedValue({ ...completed, status: 'queued', documentVersion: null, revisionId: null })
    const user = userEvent.setup()
    const view = render(<AiAssistant
      projectId={projectId}
      workspaceId={workspaceId}
      expectedVersion={1}
      selectedNodeId={null}
      canSubmit
      api={api({ createRun, subscribe: () => close })}
      onCompleted={() => Promise.resolve()}
    />)
    await screen.findByText('Chưa có lần chạy AI nào.')
    await user.type(screen.getByLabelText('Yêu cầu cho AI'), 'Create a safe landing page')
    await user.click(screen.getByRole('button', { name: 'Chạy AI' }))

    view.unmount()
    expect(close).toHaveBeenCalledOnce()
  })
})
