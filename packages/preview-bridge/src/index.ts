import { z } from 'zod'

export const PREVIEW_PROTOCOL_VERSION = 1 as const

const channelIdSchema = z.string().uuid()
const nodeIdSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
const envelope = {
  protocolVersion: z.literal(PREVIEW_PROTOCOL_VERSION),
  channelId: channelIdSchema,
}
const previewRouteSchema = z.string().min(1).max(80).refine(value => (
  value === '/'
  || /^\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*){0,3}$/.test(value)
), 'Preview route must be canonical')

const editorSchemas = {
  SET_DOCUMENT: z.object({ ...envelope, type: z.literal('SET_DOCUMENT'), payload: z.object({ document: z.unknown().refine(value => value !== undefined) }).strict() }).strict(),
  SET_VIEWPORT: z.object({ ...envelope, type: z.literal('SET_VIEWPORT'), payload: z.object({ viewport: z.enum(['desktop', 'tablet', 'mobile']) }).strict() }).strict(),
  SET_ROUTE: z.object({ ...envelope, type: z.literal('SET_ROUTE'), payload: z.object({ route: previewRouteSchema }).strict() }).strict(),
  SELECT_NODE: z.object({ ...envelope, type: z.literal('SELECT_NODE'), payload: z.object({ nodeId: nodeIdSchema.nullable() }).strict() }).strict(),
  SET_MODE: z.object({ ...envelope, type: z.literal('SET_MODE'), payload: z.object({ mode: z.enum(['inspect', 'presentation']) }).strict() }).strict(),
} as const

const previewSchemas = {
  NODE_CLICKED: z.object({ ...envelope, type: z.literal('NODE_CLICKED'), payload: z.object({ nodeId: nodeIdSchema }).strict() }).strict(),
  NODE_HOVERED: z.object({ ...envelope, type: z.literal('NODE_HOVERED'), payload: z.object({ nodeId: nodeIdSchema.nullable() }).strict() }).strict(),
  RENDER_READY: z.object({ ...envelope, type: z.literal('RENDER_READY'), payload: z.object({ nodeCount: z.number().int().nonnegative().max(500) }).strict() }).strict(),
  RENDER_ERROR: z.object({ ...envelope, type: z.literal('RENDER_ERROR'), payload: z.object({
    code: z.enum(['invalid_document', 'invalid_relationship', 'render_failed']),
    message: z.string().min(1).max(200),
  }).strict() }).strict(),
} as const

export const editorMessageSchema = z.discriminatedUnion('type', [
  editorSchemas.SET_DOCUMENT,
  editorSchemas.SET_VIEWPORT,
  editorSchemas.SET_ROUTE,
  editorSchemas.SELECT_NODE,
  editorSchemas.SET_MODE,
])
export const previewMessageSchema = z.discriminatedUnion('type', [
  previewSchemas.NODE_CLICKED,
  previewSchemas.NODE_HOVERED,
  previewSchemas.RENDER_READY,
  previewSchemas.RENDER_ERROR,
])
export type EditorMessage = z.infer<typeof editorMessageSchema>
export type PreviewMessage = z.infer<typeof previewMessageSchema>

export function createEditorMessage<T extends keyof typeof editorSchemas>(
  channelId: string,
  type: T,
  payload: z.input<(typeof editorSchemas)[T]>['payload'],
): Extract<EditorMessage, { type: T }> {
  return editorSchemas[type].parse({ protocolVersion: PREVIEW_PROTOCOL_VERSION, channelId, type, payload }) as Extract<EditorMessage, { type: T }>
}

export function createPreviewMessage<T extends keyof typeof previewSchemas>(
  channelId: string,
  type: T,
  payload: z.input<(typeof previewSchemas)[T]>['payload'],
): Extract<PreviewMessage, { type: T }> {
  return previewSchemas[type].parse({ protocolVersion: PREVIEW_PROTOCOL_VERSION, channelId, type, payload }) as Extract<PreviewMessage, { type: T }>
}

interface MessageGuard {
  expectedOrigin: string
  expectedSource: MessageEventSource
  channelId: string
}

function trustedEvent(event: MessageEvent, guard: MessageGuard): boolean {
  let expectedOrigin: string
  try {
    expectedOrigin = new URL(guard.expectedOrigin).origin
  } catch {
    return false
  }
  return event.origin !== 'null'
    && event.origin === expectedOrigin
    && event.source === guard.expectedSource
}

function parseEvent<T>(event: MessageEvent, guard: MessageGuard, schema: z.ZodType<T>): T | null {
  if (!trustedEvent(event, guard)) return null
  const parsed = schema.safeParse(event.data)
  return parsed.success && parsed.data && typeof parsed.data === 'object'
    && 'channelId' in parsed.data && parsed.data.channelId === guard.channelId
    ? parsed.data
    : null
}

export function parseEditorMessageEvent(event: MessageEvent, guard: MessageGuard): EditorMessage | null {
  return parseEvent(event, guard, editorMessageSchema)
}

export function parsePreviewMessageEvent(event: MessageEvent, guard: MessageGuard): PreviewMessage | null {
  return parseEvent(event, guard, previewMessageSchema)
}
