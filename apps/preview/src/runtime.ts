import { createRemoteImagePolicy } from '@zenui/design-schema'
import { buildRenderPlan, type RenderPlanNode } from '@zenui/html-compiler/render'
import {
  createPreviewMessage,
  parseEditorMessageEvent,
  type EditorMessage,
} from '@zenui/preview-bridge'

interface PreviewRuntimeOptions {
  editorOrigin: string
  channelId: string
  parentWindow: Window
  document: Document
  remoteImageHostAllowlist: string
  assetOrigin?: string
  nonce?: string
}

function appendNode(document: Document, node: RenderPlanNode): HTMLElement {
  const element = document.createElement(node.tag)
  for (const [name, value] of Object.entries(node.attributes)) element.setAttribute(name, value)
  if (node.text !== null) element.textContent = node.text
  else for (const child of node.children) element.append(appendNode(document, child))
  return element
}

function safeError(error: unknown): { code: 'invalid_document' | 'invalid_relationship' | 'render_failed'; message: string } {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code
    if (code === 'invalid_document' || code === 'invalid_relationship') {
      return { code, message: code === 'invalid_document' ? 'Preview document is invalid' : 'Preview relationships are invalid' }
    }
  }
  return { code: 'render_failed', message: 'Preview could not be rendered' }
}

export function createPreviewRuntime(options: PreviewRuntimeOptions) {
  const imagePolicy = createRemoteImagePolicy(options.remoteImageHostAllowlist)
  const root = options.document.getElementById('preview-root')
  if (!root) throw new Error('preview_root_missing')
  let mode: 'inspect' | 'presentation' = 'inspect'
  let selectedNodeId: string | null = null
  let route = '/'
  let currentDocument: unknown = null

  const send = <T extends 'NODE_CLICKED' | 'NODE_HOVERED' | 'RENDER_READY' | 'RENDER_ERROR'>(
    type: T,
    payload: Parameters<typeof createPreviewMessage<T>>[2],
  ): void => {
    options.parentWindow.postMessage(createPreviewMessage(options.channelId, type, payload), options.editorOrigin)
  }

  const select = (): void => {
    for (const element of root.querySelectorAll<HTMLElement>('[data-node-id]')) {
      element.toggleAttribute('data-selected', element.dataset.nodeId === selectedNodeId)
    }
  }

  const render = (input: unknown): void => {
    currentDocument = input
    const result = buildRenderPlan(input, {
      imagePolicy,
      route,
      ...(options.assetOrigin ? { assetOrigin: options.assetOrigin } : {}),
    })
    if (!result.success) {
      root.replaceChildren(options.document.createTextNode('Preview unavailable'))
      send('RENDER_ERROR', safeError(result))
      return
    }
    const style = options.document.createElement('style')
    style.id = 'zenui-preview-style'
    if (options.nonce) style.nonce = options.nonce
    style.textContent = `${result.css}[data-selected]{outline:2px solid #155eef;outline-offset:2px}`
    options.document.getElementById(style.id)?.remove()
    options.document.head.append(style)
    root.removeAttribute('role')
    root.dataset.route = route
    root.replaceChildren(appendNode(options.document, result.root))
    select()
    send('RENDER_READY', { nodeCount: Object.keys(result.plan.document.nodes).length })
  }

  const apply = (message: EditorMessage): void => {
    if (message.type === 'SET_DOCUMENT') render(message.payload.document)
    if (message.type === 'SET_ROUTE') {
      route = message.payload.route
      if (currentDocument) render(currentDocument)
    }
    if (message.type === 'SET_VIEWPORT') options.document.documentElement.dataset.viewport = message.payload.viewport
    if (message.type === 'SET_MODE') mode = message.payload.mode
    if (message.type === 'SELECT_NODE') {
      selectedNodeId = message.payload.nodeId
      select()
    }
  }

  const onMessage = (event: MessageEvent): void => {
    const message = parseEditorMessageEvent(event, {
      expectedOrigin: options.editorOrigin,
      expectedSource: options.parentWindow,
      channelId: options.channelId,
    })
    if (message) apply(message)
  }

  const onClick = (event: MouseEvent): void => {
    event.preventDefault()
    if (mode !== 'inspect') return
    const element = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-node-id]') : null
    if (element?.dataset.nodeId) send('NODE_CLICKED', { nodeId: element.dataset.nodeId })
  }

  const onPointerOver = (event: PointerEvent): void => {
    if (mode !== 'inspect') return
    const element = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-node-id]') : null
    send('NODE_HOVERED', { nodeId: element?.dataset.nodeId ?? null })
  }

  globalThis.addEventListener('message', onMessage)
  root.addEventListener('click', onClick)
  root.addEventListener('pointerover', onPointerOver)
  return {
    dispose() {
      globalThis.removeEventListener('message', onMessage)
      root.removeEventListener('click', onClick)
      root.removeEventListener('pointerover', onPointerOver)
    },
  }
}
