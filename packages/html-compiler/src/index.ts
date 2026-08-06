import { createHash } from 'node:crypto'

import { DESIGN_LIMITS } from '@zenui/design-schema'

import {
  buildRenderPlan,
  escapeHtml,
  type RenderPlanNode,
} from './render'

import type { RemoteImagePolicy } from '@zenui/design-schema'

export {
  buildRenderPlan,
  escapeHtml,
  isNodeHidden,
  nodeStyleToBrowserStyle,
  nodeStyleToCss,
  nodeToBrowserStyle,
  RENDERER_SEMANTIC_CSS,
  resolveNodeStyle,
  resolveNodeTag,
  type BrowserNodeStyle,
  type RenderPlan,
  type RenderPlanNode,
  type RenderPlanResult,
  type RenderViewport,
} from './render'

const voidTags = new Set(['img', 'hr'])
export const DEFAULT_MAX_ARTIFACT_BYTES = 2 * 1024 * 1024

export type CompileResult =
  | { success: true; html: string; bytes: number; checksum: string; csp: string }
  | { success: false; code: 'invalid_document' | 'invalid_relationship' | 'route_not_found' | 'artifact_too_large'; message: string }

export interface StaticSiteFile {
  path: string
  route: string
  html: string
  bytes: number
  checksum: string
  csp: string
}

export type CompileStaticSiteResult =
  | { success: true; files: StaticSiteFile[]; routeCount: number; bytes: number; checksum: string }
  | { success: false; code: 'invalid_document' | 'invalid_relationship' | 'route_not_found' | 'artifact_too_large'; message: string }

function serializeAttributes(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([name, value]) => `${name}="${escapeHtml(value)}"`)
    .join(' ')
}

function serializeNode(node: RenderPlanNode): string {
  const attributes = serializeAttributes(node.attributes)
  const open = attributes ? `<${node.tag} ${attributes}>` : `<${node.tag}>`
  if (voidTags.has(node.tag)) return open
  const content = node.text === null
    ? node.children.map(serializeNode).join('')
    : escapeHtml(node.text)
  return `${open}${content}</${node.tag}>`
}

function styleHash(css: string): string {
  return createHash('sha256').update(css, 'utf8').digest('base64')
}

export function compileStandaloneHtml(
  input: unknown,
  options: {
    maxArtifactBytes?: number
    title?: string
    robots?: 'noindex, nofollow, noarchive'
    imagePolicy?: RemoteImagePolicy
    assetOrigin?: string
    portableAssetPaths?: Readonly<Record<string, string>>
    pageId?: string
    route?: string
    routePrefix?: string
  } = {},
): CompileResult {
  const plan = buildRenderPlan(input, {
    ...(options.imagePolicy ? { imagePolicy: options.imagePolicy } : {}),
    ...(options.assetOrigin ? { assetOrigin: options.assetOrigin } : {}),
    ...(options.portableAssetPaths ? { portableAssetPaths: options.portableAssetPaths } : {}),
    ...(options.pageId ? { pageId: options.pageId } : {}),
    ...(options.route ? { route: options.route } : {}),
    ...(options.routePrefix ? { routePrefix: options.routePrefix } : {}),
  })
  if (!plan.success) return plan
  const policy = [
    "default-src 'none'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'",
    "form-action 'none'", "script-src 'none'", `style-src 'sha256-${styleHash(plan.css)}'`,
    `img-src ${[
      ...(options.portableAssetPaths ? ["'self'"] : options.assetOrigin ? [new URL(options.assetOrigin).origin] : []),
      ...(options.imagePolicy?.sources ?? []),
    ].join(' ') || "'none'"}`, "font-src 'none'", "connect-src 'none'",
  ].join('; ')
  const body = serializeNode(plan.root)
  const title = escapeHtml(options.title ?? 'ZenUI Export')
  const robots = options.robots ? `\n<meta name="robots" content="${options.robots}">` : ''
  const html = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta name="referrer" content="no-referrer">${robots}\n<meta http-equiv="Content-Security-Policy" content="${policy}">\n<title>${title}</title>\n<style>${plan.css}</style>\n</head>\n<body>${body}</body>\n</html>\n`
  const bytes = Buffer.byteLength(html, 'utf8')
  if (bytes > (options.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES)) {
    return { success: false, code: 'artifact_too_large', message: 'Compiled artifact exceeds the size limit' }
  }
  return {
    success: true,
    html,
    bytes,
    checksum: createHash('sha256').update(html, 'utf8').digest('hex'),
    csp: policy,
  }
}

function routePath(route: string): string {
  return route === '/' ? 'index.html' : `${route.slice(1)}/index.html`
}

function relativeAssetPaths(pagePath: string, paths: Readonly<Record<string, string>>): Record<string, string> {
  const depth = pagePath.split('/').length - 1
  const prefix = depth === 0 ? '' : '../'.repeat(depth)
  return Object.fromEntries(Object.entries(paths).map(([assetId, path]) => [assetId, `${prefix}${path}`]))
}

export function compileStaticSite(
  input: unknown,
  options: {
    maxFileBytes?: number
    maxSiteBytes?: number
    maxFiles?: number
    title?: string
    robots?: 'noindex, nofollow, noarchive'
    imagePolicy?: RemoteImagePolicy
    assetOrigin?: string
    portableAssetPaths?: Readonly<Record<string, string>>
    routePrefix?: string
  } = {},
): CompileStaticSiteResult {
  const base = buildRenderPlan(input, {
    ...(options.imagePolicy ? { imagePolicy: options.imagePolicy } : {}),
    ...(options.assetOrigin ? { assetOrigin: options.assetOrigin } : {}),
    ...(options.portableAssetPaths ? { portableAssetPaths: options.portableAssetPaths } : {}),
  })
  if (!base.success) return base
  const pages = [...base.plan.document.pages]
    .sort((left, right) => routePath(left.slug).localeCompare(routePath(right.slug)))
  if (pages.length > (options.maxFiles ?? DESIGN_LIMITS.maxCompiledFiles)) {
    return { success: false, code: 'artifact_too_large', message: 'Compiled site exceeds the file limit' }
  }
  const files: StaticSiteFile[] = []
  for (const page of pages) {
    const path = routePath(page.slug)
    const compiled = compileStandaloneHtml(base.plan.document, {
      maxArtifactBytes: options.maxFileBytes ?? DESIGN_LIMITS.maxCompiledFileBytes,
      title: options.title ? `${options.title} — ${page.name}` : page.name,
      ...(options.robots ? { robots: options.robots } : {}),
      ...(options.imagePolicy ? { imagePolicy: options.imagePolicy } : {}),
      ...(options.assetOrigin ? { assetOrigin: options.assetOrigin } : {}),
      ...(options.portableAssetPaths ? { portableAssetPaths: relativeAssetPaths(path, options.portableAssetPaths) } : {}),
      ...(options.routePrefix ? { routePrefix: options.routePrefix } : {}),
      pageId: page.id,
    })
    if (!compiled.success) return compiled
    files.push({
      path,
      route: page.slug,
      html: compiled.html,
      bytes: compiled.bytes,
      checksum: compiled.checksum,
      csp: compiled.csp,
    })
  }
  const bytes = files.reduce((sum, file) => sum + file.bytes, 0)
  if (bytes > (options.maxSiteBytes ?? DESIGN_LIMITS.maxCompiledSiteBytes)) {
    return { success: false, code: 'artifact_too_large', message: 'Compiled site exceeds the aggregate size limit' }
  }
  const checksum = createHash('sha256')
    .update(files.map(file => `${file.path}\0${file.checksum}\0${file.bytes}`).join('\n'), 'utf8')
    .digest('hex')
  return { success: true, files, routeCount: files.length, bytes, checksum }
}
