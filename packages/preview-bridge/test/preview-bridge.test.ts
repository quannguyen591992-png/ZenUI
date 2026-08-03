import { describe, expect, it } from 'vitest'

import {
  createEditorMessage,
  createPreviewMessage,
  parseEditorMessageEvent,
  parsePreviewMessageEvent,
} from '../src/index.js'

const channelId = '11111111-1111-4111-8111-111111111111'
const expectedOrigin = 'https://preview.example.test'
const source = {} as Window

function event(data: unknown, overrides: Partial<MessageEvent> = {}): MessageEvent {
  return {
    data,
    origin: expectedOrigin,
    source,
    ...overrides,
  } as MessageEvent
}

describe('preview bridge', () => {
  it('creates strict versioned editor and preview messages', () => {
    expect(createEditorMessage(channelId, 'SET_VIEWPORT', { viewport: 'tablet' })).toEqual({
      protocolVersion: 1, channelId, type: 'SET_VIEWPORT', payload: { viewport: 'tablet' },
    })
    expect(createEditorMessage(channelId, 'SET_ROUTE', { route: '/about' })).toEqual({
      protocolVersion: 1, channelId, type: 'SET_ROUTE', payload: { route: '/about' },
    })
    expect(createPreviewMessage(channelId, 'RENDER_READY', { nodeCount: 7 })).toEqual({
      protocolVersion: 1, channelId, type: 'RENDER_READY', payload: { nodeCount: 7 },
    })
  })

  it('accepts messages only when origin, source, channel and schema all match', () => {
    const message = createPreviewMessage(channelId, 'NODE_CLICKED', { nodeId: 'heading-1' })
    expect(parsePreviewMessageEvent(event(message), { expectedOrigin, expectedSource: source, channelId }))
      .toEqual(message)

    for (const forged of [
      event(message, { origin: 'https://evil.example.test' }),
      event(message, { source: {} as Window }),
      event({ ...message, channelId: crypto.randomUUID() }),
      event({ ...message, payload: { nodeId: '<script>' } }),
      event({ ...message, extra: 'forged' }),
      event(message, { origin: 'null' }),
    ]) {
      expect(parsePreviewMessageEvent(forged, { expectedOrigin, expectedSource: source, channelId })).toBeNull()
    }
  })

  it('validates editor messages without trusting raw document payloads', () => {
    const message = createEditorMessage(channelId, 'SET_DOCUMENT', { document: { schemaVersion: 1 } })
    expect(parseEditorMessageEvent(event(message), { expectedOrigin, expectedSource: source, channelId })).toEqual(message)
    expect(parseEditorMessageEvent(event({ ...message, payload: { document: undefined } }), {
      expectedOrigin, expectedSource: source, channelId,
    })).toBeNull()
    expect(() => createEditorMessage(channelId, 'SET_MODE', { mode: 'unsafe' as 'inspect' })).toThrow()
    expect(() => createEditorMessage(channelId, 'SET_ROUTE', { route: '/../admin' })).toThrow()
    expect(() => createEditorMessage(channelId, 'SET_ROUTE', { route: '/about?x=1' })).toThrow()
  })
})
