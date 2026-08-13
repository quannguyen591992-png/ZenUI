import { createValidDesignFixture, migrateDesignDocumentV1ToV2 } from '@zenui/design-schema'
import { createEditorMessage } from '@zenui/preview-bridge'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createPreviewRuntime } from '../src/runtime.js'

const channelId = '11111111-1111-4111-8111-111111111111'
const editorOrigin = 'http://localhost:3000'
let parentWindow: Window
let postMessage: ReturnType<typeof vi.fn>

beforeEach(() => {
  document.head.replaceChildren()
  document.body.innerHTML = '<main id="preview-root" role="status">Waiting</main>'
  postMessage = vi.fn()
  parentWindow = { postMessage } as unknown as Window
})

afterEach(() => vi.restoreAllMocks())

function dispatch(data: unknown, origin = editorOrigin, source: MessageEventSource = parentWindow): void {
  globalThis.dispatchEvent(new MessageEvent('message', { data, origin, source }))
}

describe('preview runtime', () => {
  it('renders the canonical plan and posts safe ready/click events', () => {
    const runtime = createPreviewRuntime({ editorOrigin, channelId, parentWindow, document, remoteImageHostAllowlist: 'images.example.com', nonce: 'test-nonce' })
    dispatch(createEditorMessage(channelId, 'SET_DOCUMENT', { document: createValidDesignFixture() }))

    expect(document.querySelector('h1')?.textContent).toContain('Build your next product')
    expect(document.querySelector('style')?.nonce).toBe('test-nonce')
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'RENDER_READY' }), editorOrigin)

    document.querySelector('h1')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'NODE_CLICKED', payload: { nodeId: 'heading-1' },
    }), editorOrigin)
    runtime.dispose()
  })

  it('prevents native Lead Form submissions and removes the guard on dispose', () => {
    const fixture = createValidDesignFixture()
    fixture.nodes['lead-form-1'] = {
      id: 'lead-form-1', type: 'lead-form', parentId: 'container-1', children: [],
      props: {
        title: 'Contact us', description: '', submitLabel: 'Send', successCopy: 'Thanks',
        fields: [{ key: 'email', type: 'email', label: 'Email', required: true }],
      },
      style: {}, responsive: {},
    }
    fixture.nodes['container-1']!.children.push('lead-form-1')
    const runtime = createPreviewRuntime({ editorOrigin, channelId, parentWindow, document, remoteImageHostAllowlist: 'images.example.com' })
    dispatch(createEditorMessage(channelId, 'SET_DOCUMENT', { document: fixture }))

    const form = document.querySelector('form')!
    const guarded = new Event('submit', { bubbles: true, cancelable: true })
    form.dispatchEvent(guarded)
    expect(guarded.defaultPrevented).toBe(true)
    expect(document.body.textContent).toContain('Bản xem trước — chưa gửi dữ liệu')

    runtime.dispose()
    const afterDispose = new Event('submit', { bubbles: true, cancelable: true })
    form.dispatchEvent(afterDispose)
    expect(afterDispose.defaultPrevented).toBe(false)
  })

  it('resolves owned image and brand-logo assets from the configured asset origin', () => {
    const fixture = createValidDesignFixture()
    fixture.nodes['image-1']!.props = {
      assetId: '22222222-2222-4222-8222-222222222222', alt: 'Product dashboard', decorative: false,
    }
    fixture.nodes['brand-link'] = {
      id: 'brand-link', type: 'link', parentId: 'container-1', children: [],
      props: {
        text: 'NovaFlow', href: '#top', brandSlot: true,
        logoAssetId: '33333333-3333-4333-8333-333333333333', logoAlt: 'NovaFlow',
      }, style: {}, responsive: {},
    }
    fixture.nodes['container-1']!.children.push('brand-link')
    const runtime = createPreviewRuntime({
      editorOrigin, channelId, parentWindow, document,
      remoteImageHostAllowlist: 'images.example.com', assetOrigin: 'https://assets.example.com',
    })

    dispatch(createEditorMessage(channelId, 'SET_DOCUMENT', { document: fixture }))

    expect(document.querySelector('[data-node-id="image-1"]')?.getAttribute('src')).toBe(
      'https://assets.example.com/a/22222222-2222-4222-8222-222222222222',
    )
    expect(document.querySelector('[data-node-id="brand-link"] img')?.getAttribute('src')).toBe(
      'https://assets.example.com/a/33333333-3333-4333-8333-333333333333',
    )
    expect(document.querySelector('[data-node-id="brand-link"] img')?.getAttribute('alt')).toBe('NovaFlow')
    runtime.dispose()
  })

  it('rejects forged messages and denied image hosts without raw details', () => {
    const runtime = createPreviewRuntime({ editorOrigin, channelId, parentWindow, document, remoteImageHostAllowlist: 'images.example.com' })
    dispatch(createEditorMessage(channelId, 'SET_DOCUMENT', { document: createValidDesignFixture() }), 'https://evil.test')
    expect(document.querySelector('h1')).toBeNull()

    const denied = createValidDesignFixture()
    denied.nodes['image-1']!.props = { src: 'https://evil.example.test/hero.png', alt: 'Denied' }
    dispatch(createEditorMessage(channelId, 'SET_DOCUMENT', { document: denied }))
    expect(document.getElementById('preview-root')?.textContent).toContain('Preview unavailable')
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'RENDER_ERROR', payload: { code: 'invalid_document', message: 'Preview document is invalid' },
    }), editorOrigin)
    expect(document.body.textContent).not.toContain('script')
    runtime.dispose()
  })

  it('switches between validated document routes without leaving the preview origin', () => {
    const fixture = migrateDesignDocumentV1ToV2(createValidDesignFixture())
    fixture.nodes['about-root'] = { id: 'about-root', type: 'page', parentId: null, children: ['about-section'], props: {}, style: {}, responsive: {} }
    fixture.nodes['about-section'] = { id: 'about-section', type: 'section', parentId: 'about-root', children: ['about-heading'], props: { label: 'About' }, style: {}, responsive: {} }
    fixture.nodes['about-heading'] = { id: 'about-heading', type: 'heading', parentId: 'about-section', children: [], props: { text: 'About ZenUI', level: 1 }, style: {}, responsive: {} }
    fixture.pages.push({ id: 'about', name: 'About', slug: '/about', rootNodeId: 'about-root' })
    const runtime = createPreviewRuntime({ editorOrigin, channelId, parentWindow, document, remoteImageHostAllowlist: 'images.example.com' })
    dispatch(createEditorMessage(channelId, 'SET_DOCUMENT', { document: fixture }))
    dispatch(createEditorMessage(channelId, 'SET_ROUTE', { route: '/about' }))

    expect(document.querySelector('h1')?.textContent).toBe('About ZenUI')
    expect(document.getElementById('preview-root')?.dataset.route).toBe('/about')
    runtime.dispose()
  })

  it('applies viewport, mode, selection and hover messages without navigation', () => {
    const fixture = createValidDesignFixture()
    fixture.nodes['heading-1']!.responsive = {
      tablet: { fontSize: 36 },
      mobile: { fontSize: 24, display: 'none' },
    }
    const runtime = createPreviewRuntime({ editorOrigin, channelId, parentWindow, document, remoteImageHostAllowlist: 'images.example.com' })
    dispatch(createEditorMessage(channelId, 'SET_DOCUMENT', { document: fixture }))
    dispatch(createEditorMessage(channelId, 'SET_VIEWPORT', { viewport: 'mobile' }))
    dispatch(createEditorMessage(channelId, 'SELECT_NODE', { nodeId: 'heading-1' }))

    expect(document.documentElement.dataset.viewport).toBe('mobile')
    expect(document.getElementById('zenui-preview-style')?.textContent).toContain('html[data-viewport="tablet"]')
    expect(document.getElementById('zenui-preview-style')?.textContent).toContain('html[data-viewport="mobile"]')
    expect(document.querySelector('[data-node-id="heading-1"]')?.hasAttribute('data-selected')).toBe(true)
    const heading = document.querySelector('h1')!
    heading.dispatchEvent(new Event('pointerover', { bubbles: true }))
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'NODE_HOVERED', payload: { nodeId: 'heading-1' },
    }), editorOrigin)

    dispatch(createEditorMessage(channelId, 'SET_MODE', { mode: 'presentation' }))
    const calls = postMessage.mock.calls.length
    heading.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    heading.dispatchEvent(new Event('pointerover', { bubbles: true }))
    expect(postMessage).toHaveBeenCalledTimes(calls)
    runtime.dispose()
  })

  it('replaces an existing stylesheet and rejects missing runtime roots', () => {
    const runtime = createPreviewRuntime({ editorOrigin, channelId, parentWindow, document, remoteImageHostAllowlist: 'images.example.com' })
    dispatch(createEditorMessage(channelId, 'SET_DOCUMENT', { document: createValidDesignFixture() }))
    const first = document.getElementById('zenui-preview-style')
    dispatch(createEditorMessage(channelId, 'SET_DOCUMENT', { document: createValidDesignFixture() }))
    expect(document.querySelectorAll('#zenui-preview-style')).toHaveLength(1)
    expect(document.getElementById('zenui-preview-style')).not.toBe(first)
    runtime.dispose()

    document.body.replaceChildren()
    expect(() => createPreviewRuntime({ editorOrigin, channelId, parentWindow, document, remoteImageHostAllowlist: 'images.example.com' })).toThrow('preview_root_missing')
  })
})
