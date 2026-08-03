import { createValidDesignFixture } from '@zenui/design-schema'
import { describe, expect, it } from 'vitest'

import {
  ASSET_QUEUE_NAME,
  assetArchiveRequestSchema,
  assetDerivativeRequestSchema,
  assetImportRequestSchema,
  assetJobSchema,
  assetPublicSchema,
  assetSearchQuerySchema,
  assetUploadQuerySchema,
  brandKitApplyRequestSchema,
  brandKitSchema,
  brandKitUpdateRequestSchema,
  brandKitValuesSchema,
  contrastRatio,
  createBrandApplicationCommands,
  cropTransformSchema,
  meetsContrast,
} from '../src/index.js'

const ids = {
  assetId: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
  workspaceId: '33333333-3333-4333-8333-333333333333',
  userId: '44444444-4444-4444-8444-444444444444',
}

describe('asset and brand contracts', () => {
  it('keeps queue jobs local-ID-only and public assets redacted', () => {
    expect(ASSET_QUEUE_NAME).toBe('zenui-assets-v1')
    expect(assetJobSchema.safeParse(ids).success).toBe(true)
    expect(assetJobSchema.safeParse({ ...ids, sourceUrl: 'https://secret.example/x' }).success).toBe(false)
    expect(assetPublicSchema.safeParse({
      id: ids.assetId,
      scope: 'project',
      status: 'ready',
      source: 'upload',
      width: 1200,
      height: 800,
      bytes: 1024,
      contentType: 'image/webp',
      defaultAlt: 'Launch planning dashboard',
      attribution: null,
      errorCode: null,
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).success).toBe(true)
    expect(assetPublicSchema.safeParse({
      id: ids.assetId,
      scope: 'project', status: 'ready', source: 'generated', width: 1200, height: 675,
      bytes: 2048, contentType: 'image/webp', defaultAlt: 'AI-generated launch workspace', attribution: null,
      errorCode: null, archived: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }).success).toBe(true)
    expect(assetPublicSchema.safeParse({
      id: ids.assetId,
      scope: 'project', status: 'ready', source: 'pexels', width: 1, height: 1,
      bytes: 1, contentType: 'image/webp', defaultAlt: 'Image', attribution: null,
      errorCode: null, archived: false, objectKey: 'private/key', providerSourceUrl: 'https://secret',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }).success).toBe(false)
  })

  it('validates bounded non-destructive crops', () => {
    expect(cropTransformSchema.safeParse({ x: 0.1, y: 0.2, width: 0.8, height: 0.6, outputWidth: 1200, outputHeight: 900 }).success).toBe(true)
    expect(cropTransformSchema.safeParse({ x: 0.8, y: 0.2, width: 0.8, height: 0.6, outputWidth: 1200, outputHeight: 900 }).success).toBe(false)
    expect(cropTransformSchema.safeParse({ x: 0.1, y: 0.8, width: 0.6, height: 0.4, outputWidth: 1200, outputHeight: 900 }).success).toBe(false)
  })

  it('validates strict upload, search, import, derivative, archive and Brand Kit requests', () => {
    expect(assetUploadQuerySchema.parse({
      workspaceId: ids.workspaceId, requestId: ids.assetId, scope: 'project',
      filename: 'launch.WEBP', defaultAlt: 'Launch board',
    })).toMatchObject({ scope: 'project', filename: 'launch.WEBP' })
    expect(assetUploadQuerySchema.safeParse({
      workspaceId: ids.workspaceId, requestId: ids.assetId, scope: 'project',
      filename: 'launch.svg', defaultAlt: 'Launch board',
    }).success).toBe(false)
    expect(assetImportRequestSchema.safeParse({
      workspaceId: ids.workspaceId, requestId: ids.assetId, resultId: '42', defaultAlt: 'Launch board',
    }).success).toBe(true)
    expect(assetImportRequestSchema.safeParse({
      workspaceId: ids.workspaceId, requestId: ids.assetId, resultId: 'https://images.example/x', defaultAlt: 'Launch board',
    }).success).toBe(false)
    expect(assetSearchQuerySchema.parse({ workspaceId: ids.workspaceId, query: ' launch ' })).toMatchObject({ query: 'launch', limit: 12 })
    expect(assetDerivativeRequestSchema.safeParse({
      workspaceId: ids.workspaceId, requestId: ids.assetId,
      transform: { x: 0, y: 0, width: 1, height: 1, outputWidth: 320, outputHeight: 240 },
    }).success).toBe(true)
    expect(assetArchiveRequestSchema.safeParse({ workspaceId: ids.workspaceId }).success).toBe(true)
    expect(brandKitApplyRequestSchema.safeParse({
      workspaceId: ids.workspaceId, expectedBrandKitVersion: 2, expectedDocumentVersion: 3,
    }).success).toBe(true)
  })

  it('requires asset metadata and safe errors to match lifecycle state', () => {
    const timestamp = new Date().toISOString()
    const base = {
      id: ids.assetId, scope: 'project' as const, source: 'upload' as const,
      width: null, height: null, bytes: null, contentType: null,
      defaultAlt: 'Launch board', attribution: null, errorCode: null,
      archived: false, createdAt: timestamp, updatedAt: timestamp,
    }
    expect(assetPublicSchema.safeParse({ ...base, status: 'ready' }).success).toBe(false)
    expect(assetPublicSchema.safeParse({
      ...base, status: 'queued', width: 10, height: 10, bytes: 100, contentType: 'image/webp',
    }).success).toBe(false)
    expect(assetPublicSchema.safeParse({ ...base, status: 'failed' }).success).toBe(false)
    expect(assetPublicSchema.safeParse({ ...base, status: 'queued', errorCode: 'import_failed' }).success).toBe(false)
    expect(assetPublicSchema.safeParse({ ...base, status: 'failed', errorCode: 'invalid_image' }).success).toBe(true)
  })

  it('requires accessible brand contrast and allowlisted fonts', () => {
    expect(meetsContrast('#0f172a', '#ffffff', 4.5)).toBe(true)
    expect(meetsContrast('#dddddd', '#ffffff', 4.5)).toBe(false)
    expect(brandKitSchema.safeParse({
      version: 1,
      name: 'NovaFlow',
      logoAssetId: ids.assetId,
      colors: { primary: '#2563eb', background: '#ffffff', text: '#0f172a' },
      fonts: { heading: 'Manrope', body: 'Arial' },
    }).success).toBe(true)
    expect(brandKitSchema.safeParse({
      version: 1,
      name: 'Unreadable',
      colors: { primary: '#eeeeee', background: '#ffffff', text: '#dddddd' },
      fonts: { heading: 'Remote Font', body: 'Arial' },
    }).success).toBe(false)
    expect(brandKitSchema.safeParse({
      version: 1,
      name: 'Low primary contrast',
      colors: { primary: '#eeeeee', background: '#ffffff', text: '#0f172a' },
      fonts: { heading: 'Manrope', body: 'Arial' },
    }).success).toBe(false)
    expect(brandKitValuesSchema.safeParse({
      name: 'Low text contrast',
      colors: { primary: '#2563eb', background: '#ffffff', text: '#eeeeee' },
      fonts: { heading: 'Manrope', body: 'Arial' },
    }).success).toBe(false)
    expect(brandKitValuesSchema.safeParse({
      name: 'Low primary contrast',
      colors: { primary: '#eeeeee', background: '#ffffff', text: '#0f172a' },
      fonts: { heading: 'Manrope', body: 'Arial' },
    }).success).toBe(false)
    expect(brandKitUpdateRequestSchema.safeParse({
      expectedVersion: 0,
      name: 'NovaFlow',
      colors: { primary: '#2563eb', background: '#ffffff', text: '#0f172a' },
      fonts: { heading: 'Manrope', body: 'Arial' },
    }).success).toBe(true)
    expect(contrastRatio('not-a-color', '#ffffff')).toBe(0)
    expect(contrastRatio('#000000', '#ffffff')).toBeGreaterThan(20)
  })

  it('plans one atomic brand application without touching unrelated content', () => {
    const document = createValidDesignFixture()
    document.nodes['navbar-1'] = {
      id: 'navbar-1', type: 'navbar', parentId: 'page-root', children: ['navbar-brand'],
      props: { brand: 'Old brand' }, style: {}, responsive: {},
    }
    document.nodes['navbar-brand'] = {
      id: 'navbar-brand', type: 'link', parentId: 'navbar-1', children: [],
      props: { text: 'Old brand', href: '#top', brandSlot: true }, style: {}, responsive: {},
    }
    document.nodes['page-root']!.children.unshift('navbar-1')

    const commands = createBrandApplicationCommands({
      document,
      documentVersion: 1,
      brandKit: {
        version: 2,
        name: 'NovaFlow',
        logoAssetId: ids.assetId,
        colors: { primary: '#2563eb', background: '#ffffff', text: '#0f172a' },
        fonts: { heading: 'Manrope', body: 'Arial' },
      },
    })

    expect(commands).toEqual([
      expect.objectContaining({ type: 'UPDATE_THEME' }),
      expect.objectContaining({ type: 'UPDATE_PROPS', nodeId: 'navbar-1', patch: { brand: 'NovaFlow' } }),
      expect.objectContaining({
        type: 'UPDATE_PROPS', nodeId: 'navbar-brand',
        patch: { text: 'NovaFlow', logoAssetId: ids.assetId, logoAlt: 'NovaFlow' },
      }),
    ])
    expect(commands.some(command => 'nodeId' in command && command.nodeId === 'heading-1')).toBe(false)
  })

  it('clears the brand logo mapping when a Brand Kit has no logo', () => {
    const document = createValidDesignFixture()
    document.nodes['navbar-brand'] = {
      id: 'navbar-brand', type: 'link', parentId: 'page-root', children: [],
      props: {
        text: 'Old brand', href: '#top', brandSlot: true,
        logoAssetId: ids.assetId, logoAlt: 'Old brand',
      },
      style: {}, responsive: {},
    }
    document.nodes['page-root']!.children.unshift('navbar-brand')

    const commands = createBrandApplicationCommands({
      document,
      documentVersion: 3,
      brandKit: {
        version: 4,
        name: 'NovaFlow',
        logoAssetId: null,
        colors: { primary: '#2563eb', background: '#ffffff', text: '#0f172a' },
        fonts: { heading: 'Manrope', body: 'Arial' },
      },
    })

    expect(commands).toContainEqual(expect.objectContaining({
      type: 'UPDATE_PROPS',
      nodeId: 'navbar-brand',
      patch: { text: 'NovaFlow', logoAssetId: undefined, logoAlt: undefined },
    }))
  })
})
