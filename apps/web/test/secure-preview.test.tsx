import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createValidDesignFixture } from '@zenui/design-schema'
import { createPreviewMessage } from '@zenui/preview-bridge'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SecurePreview } from '../app/editor/secure-preview'
import { validatePreviewOrigin } from '../lib/server/preview-config'

const previewOrigin = 'http://127.0.0.1:3001'
const channelId = '11111111-1111-4111-8111-111111111111'

afterEach(() => cleanup())

describe('secure preview', () => {
  it('rejects same-origin and malformed preview configuration', () => {
    expect(() => validatePreviewOrigin('http://localhost:3000', 'http://localhost:3000')).toThrow('PREVIEW_ORIGIN must be isolated')
    expect(() => validatePreviewOrigin('not-a-url', 'http://localhost:3000')).toThrow('PREVIEW_ORIGIN is invalid')
    expect(validatePreviewOrigin(previewOrigin, 'http://localhost:3000')).toBe(previewOrigin)
  })

  it('does not render an inactive preview status', () => {
    render(<SecurePreview
      previewOrigin={previewOrigin}
      editorOrigin="http://localhost:3000"
      channelId={channelId}
      document={createValidDesignFixture()}
      viewport="desktop"
      selectedNodeId={null}
      interactionMode="presentation"
      onSelect={vi.fn()}
    />)

    expect(screen.queryByText('Đã đóng bản xem trước')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('uses a constrained iframe and posts only to the exact preview origin', async () => {
    const postMessage = vi.fn()
    render(<SecurePreview
      previewOrigin={previewOrigin}
      editorOrigin="http://localhost:3000"
      channelId={channelId}
      document={createValidDesignFixture()}
      route="/about"
      viewport="desktop"
      selectedNodeId={null}
      interactionMode="presentation"
      onSelect={vi.fn()}
      frameWindow={{ postMessage } as unknown as Window}
    />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Mở xem trước' }))
    const frame = screen.getByTitle('Bản xem trước trang an toàn')
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin')
    expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(frame).not.toHaveAttribute('allow', expect.stringMatching(/camera|microphone/))
    fireEvent.load(frame)
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_DOCUMENT' }), previewOrigin)
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_ROUTE', payload: { route: '/about' } }), previewOrigin)
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_VIEWPORT' }), previewOrigin)
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'SET_MODE', payload: { mode: 'presentation' },
    }), previewOrigin)
  })

  it('sends inspect mode only when the embedding surface requests inspection', async () => {
    const postMessage = vi.fn()
    render(<SecurePreview
      previewOrigin={previewOrigin}
      editorOrigin="http://localhost:3000"
      channelId={channelId}
      document={createValidDesignFixture()}
      viewport="desktop"
      selectedNodeId={null}
      interactionMode="inspect"
      onSelect={vi.fn()}
      frameWindow={{ postMessage } as unknown as Window}
    />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Mở xem trước' }))
    fireEvent.load(screen.getByTitle('Bản xem trước trang an toàn'))

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'SET_MODE', payload: { mode: 'inspect' },
    }), previewOrigin)
  })

  it('constrains the iframe to the selected responsive viewport', async () => {
    const props = {
      previewOrigin,
      editorOrigin: 'http://localhost:3000',
      channelId,
      document: createValidDesignFixture(),
      selectedNodeId: null,
      interactionMode: 'presentation' as const,
      onSelect: vi.fn(),
    }
    const { rerender } = render(<SecurePreview {...props} viewport="tablet" />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Mở xem trước' }))
    expect(screen.getByTitle('Bản xem trước trang an toàn')).toHaveStyle({ width: '768px' })

    rerender(<SecurePreview {...props} viewport="mobile" />)
    expect(screen.getByTitle('Bản xem trước trang an toàn')).toHaveStyle({ width: '390px' })
  })

  it('accepts node events only from the exact iframe source, origin and channel', async () => {
    const onSelect = vi.fn()
    const frameWindow = { postMessage: vi.fn() } as unknown as Window
    render(<SecurePreview
      previewOrigin={previewOrigin}
      editorOrigin="http://localhost:3000"
      channelId={channelId}
      document={createValidDesignFixture()}
      viewport="desktop"
      selectedNodeId={null}
      interactionMode="presentation"
      onSelect={onSelect}
      frameWindow={frameWindow}
    />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mở xem trước' }))
    const message = createPreviewMessage(channelId, 'NODE_CLICKED', { nodeId: 'heading-1' })
    globalThis.dispatchEvent(new MessageEvent('message', { data: message, origin: 'https://evil.test', source: frameWindow }))
    globalThis.dispatchEvent(new MessageEvent('message', { data: message, origin: previewOrigin, source: {} as Window }))
    globalThis.dispatchEvent(new MessageEvent('message', { data: { ...message, channelId: crypto.randomUUID() }, origin: previewOrigin, source: frameWindow }))
    expect(onSelect).not.toHaveBeenCalled()

    globalThis.dispatchEvent(new MessageEvent('message', { data: message, origin: previewOrigin, source: frameWindow }))
    expect(onSelect).toHaveBeenCalledWith('heading-1')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Đã chọn thành phần trong bản xem trước'))
  })
})
