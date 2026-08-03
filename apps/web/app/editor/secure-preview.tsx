'use client'

import { createEditorMessage, parsePreviewMessageEvent } from '@zenui/preview-bridge'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { DesignDocument } from '@zenui/design-schema'

const previewViewportWidths = {
  desktop: 'calc(100vw - 48px)',
  tablet: '768px',
  mobile: '390px',
} as const

interface SecurePreviewProps {
  previewOrigin: string
  editorOrigin: string
  channelId?: string
  document: DesignDocument
  route?: string
  viewport: 'desktop' | 'tablet' | 'mobile'
  selectedNodeId: string | null
  presentation?: 'simple' | 'advanced'
  saveStatus?: 'idle' | 'dirty' | 'saving' | 'saved' | 'offline' | 'error' | 'conflict'
  onSelect: (nodeId: string) => void
  frameWindow?: Window
}

export function SecurePreview({
  previewOrigin,
  editorOrigin,
  channelId: providedChannelId,
  document,
  route = '/',
  viewport,
  selectedNodeId,
  presentation = 'advanced',
  saveStatus = 'saved',
  onSelect,
  frameWindow,
}: SecurePreviewProps) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const channelId = useMemo(() => providedChannelId ?? crypto.randomUUID(), [providedChannelId])
  const targetWindow = (): Window | null => frameWindow ?? iframeRef.current?.contentWindow ?? null
  const ready = useRef(false)
  const previewUrl = `${previewOrigin}/?editorOrigin=${encodeURIComponent(editorOrigin)}&channelId=${encodeURIComponent(channelId)}`

  const post = (): void => {
    const target = targetWindow()
    if (!target || !ready.current) return
    target.postMessage(createEditorMessage(channelId, 'SET_DOCUMENT', { document }), previewOrigin)
    target.postMessage(createEditorMessage(channelId, 'SET_ROUTE', { route }), previewOrigin)
    target.postMessage(createEditorMessage(channelId, 'SET_VIEWPORT', { viewport }), previewOrigin)
    target.postMessage(createEditorMessage(channelId, 'SELECT_NODE', { nodeId: selectedNodeId }), previewOrigin)
    target.postMessage(createEditorMessage(channelId, 'SET_MODE', { mode: 'inspect' }), previewOrigin)
  }

  useEffect(() => {
    if (open) post()
  }, [document, open, route, selectedNodeId, viewport])

  useEffect(() => {
    if (!open) ready.current = false
  }, [open])

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      const source = targetWindow()
      if (!source) return
      const message = parsePreviewMessageEvent(event, {
        expectedOrigin: previewOrigin,
        expectedSource: source,
        channelId,
      })
      if (!message) return
      if (message.type === 'NODE_CLICKED') {
        onSelect(message.payload.nodeId)
        setStatus('Đã chọn thành phần trong bản xem trước')
      }
      if (message.type === 'RENDER_READY') setStatus(`Bản xem trước đã sẵn sàng: ${message.payload.nodeCount} thành phần`)
      if (message.type === 'RENDER_ERROR') setStatus('Không thể hiển thị bản xem trước an toàn.')
    }
    globalThis.addEventListener('message', onMessage)
    return () => globalThis.removeEventListener('message', onMessage)
  }, [channelId, frameWindow, onSelect, previewOrigin])

  return (
    <section className="secure-preview" aria-label="Bản xem trước an toàn">
      <button type="button" onClick={() => {
        setOpen(current => !current)
        setStatus(open ? '' : 'Đang tải bản xem trước an toàn')
      }}>
        {open ? 'Đóng xem trước' : presentation === 'simple' ? 'Xem trước' : 'Mở xem trước'}
      </button>
      {open && presentation === 'simple' && !['idle', 'saved'].includes(saveStatus) && (
        <p role="status">Bản xem trước đang hiển thị chỉnh sửa hiện tại; website đã lưu mới nhất chưa sẵn sàng để chia sẻ hoặc xuất bản.</p>
      )}
      {open && (
        <iframe
          ref={iframeRef}
          title="Bản xem trước trang an toàn"
          src={previewUrl}
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
          style={{ width: previewViewportWidths[viewport] }}
          onLoad={() => {
            ready.current = true
            post()
            setStatus('Đã tải bản xem trước an toàn')
          }}
        />
      )}
      {status && <p role="status" aria-live="polite">{status}</p>}
    </section>
  )
}
