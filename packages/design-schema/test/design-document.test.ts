import { describe, expect, it } from 'vitest'

import {
  COMPONENT_TYPES,
  DESIGN_LIMITS,
  ICON_ALLOWLIST,
  ICON_PATHS,
  collectAssetReferences,
  collectBrokenPageReferences,
  collectLegacyRemoteImageReferences,
  createRemoteImagePolicy,
  createValidDesignFixture,
  designNodeSchema,
  exportDesignDocumentJsonSchema,
  findPageByRoute,
  migrateDesignDocumentV1ToV2,
  normalizePageSlug,
  parseDesignDocument,
  validateDesignDocument,
  type DesignDocumentV2,
  type DesignNode,
} from '../src/index.js'

describe('Design Document v1', () => {
  it('supports the 18 Phase 2 component contracts', () => {
    expect(COMPONENT_TYPES).toEqual([
      'page', 'section', 'container', 'stack', 'columns', 'column', 'divider', 'spacer',
      'heading', 'paragraph', 'image', 'button', 'link', 'icon', 'badge',
      'navbar', 'hero', 'feature-card',
    ])

    const samples: DesignNode[] = [
      { id: 'columns-1', type: 'columns', parentId: 'container-1', children: [], props: {}, style: {}, responsive: {} },
      { id: 'column-1', type: 'column', parentId: 'columns-1', children: [], props: {}, style: {}, responsive: {} },
      { id: 'divider-1', type: 'divider', parentId: 'container-1', children: [], props: {}, style: {}, responsive: {} },
      { id: 'spacer-1', type: 'spacer', parentId: 'container-1', children: [], props: { size: 32 }, style: {}, responsive: {} },
      { id: 'link-1', type: 'link', parentId: 'container-1', children: [], props: { text: 'Docs', href: '/docs' }, style: {}, responsive: {} },
      { id: 'icon-1', type: 'icon', parentId: 'container-1', children: [], props: { name: 'star', label: 'Featured' }, style: {}, responsive: {} },
      { id: 'badge-1', type: 'badge', parentId: 'container-1', children: [], props: { text: 'New' }, style: {}, responsive: {} },
      { id: 'navbar-1', type: 'navbar', parentId: 'page-root', children: [], props: { brand: 'ZenUI' }, style: {}, responsive: {} },
      { id: 'hero-1', type: 'hero', parentId: 'page-root', children: [], props: { label: 'Hero' }, style: {}, responsive: {} },
      { id: 'feature-1', type: 'feature-card', parentId: 'container-1', children: [], props: { title: 'Fast', description: 'Launch quickly' }, style: {}, responsive: {} },
    ]

    for (const node of samples) expect(designNodeSchema.safeParse(node).success).toBe(true)
  })

  it('accepts bounded composition and image treatment tokens', () => {
    const node = {
      id: 'image-visual', type: 'image' as const, parentId: 'container-1', children: [],
      props: { src: 'https://images.example.com/visual.png', alt: 'Product visual' },
      style: {
        gridColumnSpan: 2, gridRowSpan: 2, aspectRatio: 'wide' as const,
        objectFit: 'cover' as const, objectPosition: 'top' as const,
      },
      responsive: { mobile: { gridColumnSpan: 1, gridRowSpan: 1, aspectRatio: 'landscape' as const } },
    }

    expect(designNodeSchema.safeParse(node).success).toBe(true)
    expect(designNodeSchema.safeParse({
      ...node,
      style: { ...node.style, gridColumnSpan: 4, objectPosition: '25% 50%' },
    }).success).toBe(false)
  })

  it('accepts owned immutable asset references and reports canonical and legacy usage', () => {
    const document = createValidDesignFixture()
    document.nodes['image-1']!.props = {
      assetId: '11111111-1111-4111-8111-111111111111',
      alt: 'Product dashboard showing a launch plan',
      decorative: false,
    }
    document.nodes['image-2'] = {
      id: 'image-2', type: 'image', parentId: 'container-1', children: [],
      props: { assetId: '22222222-2222-4222-8222-222222222222', alt: '', decorative: true },
      style: {}, responsive: {},
    }
    document.nodes['container-1']!.children.push('image-2')

    expect(validateDesignDocument(document).success).toBe(true)
    expect(collectAssetReferences(document)).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ])
    expect(collectLegacyRemoteImageReferences(document)).toEqual([])

    document.nodes['image-2'].props = { src: 'https://images.example.com/legacy.png', alt: 'Legacy image' }
    expect(collectLegacyRemoteImageReferences(document)).toEqual(['https://images.example.com/legacy.png'])
  })

  it.each([
    [{ assetId: 'not-a-uuid', alt: 'Invalid asset', decorative: false }, 'invalid opaque asset ID'],
    [{ assetId: '11111111-1111-4111-8111-111111111111', alt: '', decorative: false }, 'missing meaningful alt'],
    [{ assetId: '11111111-1111-4111-8111-111111111111', alt: 'Should be empty', decorative: true }, 'decorative image with alt'],
    [{ assetId: '11111111-1111-4111-8111-111111111111', src: 'https://images.example.com/x.png', alt: 'Mixed', decorative: false }, 'mixed owned and remote source'],
  ])('rejects %s for owned image props', (props, _label) => {
    const document = createValidDesignFixture()
    document.nodes['image-1']!.props = props
    expect(validateDesignDocument(document).success).toBe(false)
  })

  it('accepts an explicit owned logo on a brand link', () => {
    const document = createValidDesignFixture()
    document.nodes['brand-link'] = {
      id: 'brand-link', type: 'link', parentId: 'container-1', children: [],
      props: {
        text: 'ZenUI', href: '#top', brandSlot: true,
        logoAssetId: '33333333-3333-4333-8333-333333333333', logoAlt: 'ZenUI',
      },
      style: {}, responsive: {},
    }
    document.nodes['container-1']!.children.push('brand-link')

    expect(validateDesignDocument(document).success).toBe(true)
    expect(collectAssetReferences(document)).toContain('33333333-3333-4333-8333-333333333333')
  })

  it('normalizes a strict HTTPS image hostname allowlist', () => {
    const policy = createRemoteImagePolicy('images.example.com,*.cdn.example.com')
    expect(policy.sources).toEqual(['https://*.cdn.example.com', 'https://images.example.com'])
    for (const url of [
      'https://images.example.com/hero.png',
      'https://IMAGES.EXAMPLE.COM./hero.png',
      'https://asset.cdn.example.com/hero.png',
      'https://deep.asset.cdn.example.com/hero.png',
    ]) expect(policy.allows(url)).toBe(true)

    for (const url of [
      'http://images.example.com/hero.png',
      'https://images.example.com.evil.test/hero.png',
      'https://cdn.example.com/hero.png',
      'https://user:pass@images.example.com/hero.png',
      'https://images.example.com:8443/hero.png',
      'https://127.0.0.1/hero.png',
      'https://[::1]/hero.png',
      'https://localhost/hero.png',
    ]) expect(policy.allows(url)).toBe(false)

    expect(() => createRemoteImagePolicy('')).toThrow('REMOTE_IMAGE_HOST_ALLOWLIST is required')
    expect(() => createRemoteImagePolicy('images.example.com,images.example.com')).toThrow('duplicate_image_host')
    expect(() => createRemoteImagePolicy('https://images.example.com')).toThrow('invalid_image_host')
  })

  it('applies one image policy at document validation boundaries', () => {
    const policy = createRemoteImagePolicy('images.example.com')
    const allowed = createValidDesignFixture()
    expect(validateDesignDocument(allowed, { imagePolicy: policy }).success).toBe(true)

    const denied = createValidDesignFixture()
    denied.nodes['image-1']!.props = { src: 'https://other.example.com/hero.png', alt: 'Denied' }
    expect(validateDesignDocument(denied, { imagePolicy: policy })).toMatchObject({
      success: false,
      issues: [expect.objectContaining({ code: 'invalid_image_host' })],
    })
  })

  it('rejects unsafe Phase 2 links and unknown icon names', () => {
    expect(designNodeSchema.safeParse({
      id: 'link-1', type: 'link', parentId: 'container-1', children: [],
      props: { text: 'Unsafe', href: 'javascript:alert(1)' }, style: {}, responsive: {},
    }).success).toBe(false)
    expect(designNodeSchema.safeParse({
      id: 'icon-1', type: 'icon', parentId: 'container-1', children: [],
      props: { name: 'remote-svg', label: 'Unsafe' }, style: {}, responsive: {},
    }).success).toBe(false)
  })

  it('offers a richer server-owned icon set with a drawing path for every allowlisted name', () => {
    expect(ICON_ALLOWLIST.length).toBeGreaterThanOrEqual(20)
    for (const name of ['shield', 'sparkles', 'clock', 'chart', 'users', 'mail'] as const) {
      expect(ICON_ALLOWLIST).toContain(name)
      expect(designNodeSchema.safeParse({
        id: 'icon-1', type: 'icon', parentId: 'container-1', children: [],
        props: { name, label: 'Điểm nổi bật' }, style: {}, responsive: {},
      }).success).toBe(true)
    }
    for (const name of ICON_ALLOWLIST) {
      const paths = ICON_PATHS[name]
      expect(paths.length).toBeGreaterThan(0)
      for (const path of paths) expect(path).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9 ,.-]+$/)
    }
  })

  it('accepts the Phase 0 reference document', () => {
    const result = validateDesignDocument(createValidDesignFixture())

    expect(result).toEqual({ success: true, data: expect.any(Object) })
  })

  it.each([
    ['cycle', (document: ReturnType<typeof createValidDesignFixture>) => {
      document.nodes['section-1']!.children.push('page-root')
      document.nodes['page-root']!.parentId = 'section-1'
    }, 'cycle_detected'],
    ['orphan', (document: ReturnType<typeof createValidDesignFixture>) => {
      document.nodes['orphan-1'] = {
        id: 'orphan-1', type: 'paragraph', parentId: 'missing', children: [],
        props: { text: 'orphan' }, style: {}, responsive: {},
      }
    }, 'orphan_node'],
    ['unsafe URL', (document: ReturnType<typeof createValidDesignFixture>) => {
      document.nodes['image-1']!.props = { src: 'javascript:alert(1)', alt: 'unsafe' }
    }, 'unsafe_url'],
    ['map key mismatch', (document: ReturnType<typeof createValidDesignFixture>) => {
      document.nodes['heading-1']!.id = 'different-id'
    }, 'node_id_mismatch'],
  ])('rejects %s', (_name, mutate, code) => {
    const document = createValidDesignFixture()
    mutate(document)

    const result = validateDesignDocument(document)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.issues.map(issue => issue.code)).toContain(code)
  })

  it('rejects documents over the node limit', () => {
    const document = createValidDesignFixture()
    for (let index = Object.keys(document.nodes).length; index <= DESIGN_LIMITS.maxNodes; index += 1) {
      const id = `paragraph-overflow-${index}`
      document.nodes[id] = {
        id, type: 'paragraph', parentId: 'container-1', children: [],
        props: { text: id }, style: {}, responsive: {},
      }
      document.nodes['container-1']!.children.push(id)
    }

    const result = validateDesignDocument(document)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.issues.map(issue => issue.code)).toContain('node_limit_exceeded')
  })

  it('rejects documents deeper than the depth limit', () => {
    const document = createValidDesignFixture()
    let parentId = 'container-1'
    for (let depth = 0; depth <= DESIGN_LIMITS.maxDepth; depth += 1) {
      const id = `stack-${depth}`
      document.nodes[id] = {
        id, type: 'stack', parentId, children: [], props: {}, style: {}, responsive: {},
      }
      document.nodes[parentId]!.children.push(id)
      parentId = id
    }

    const result = validateDesignDocument(document)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.issues.map(issue => issue.code)).toContain('depth_limit_exceeded')
  })

  it('accepts every safe link protocol and rejects protocol-relative links', () => {
    for (const href of ['https://example.com', 'http://example.com', 'mailto:hello@example.com', 'tel:+84123456789', '/contact', '#hero']) {
      const document = createValidDesignFixture()
      document.nodes['button-1']!.props = { text: 'Safe', href }
      expect(validateDesignDocument(document).success).toBe(true)
    }

    const unsafe = createValidDesignFixture()
    unsafe.nodes['button-1']!.props = { text: 'Unsafe', href: '//evil.example.com' }
    expect(validateDesignDocument(unsafe)).toMatchObject({ success: false })
  })

  it('rejects unserializable, oversized and invalid-root documents', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(validateDesignDocument(circular)).toMatchObject({ success: false, issues: [{ code: 'schema_invalid' }] })

    const oversized = createValidDesignFixture() as unknown as Record<string, unknown>
    oversized.padding = 'x'.repeat(DESIGN_LIMITS.maxSerializedBytes)
    expect(validateDesignDocument(oversized)).toMatchObject({ success: false, issues: [{ code: 'document_size_exceeded' }] })

    const invalidRoot = createValidDesignFixture()
    invalidRoot.pages[0]!.rootNodeId = 'heading-1'
    expect(validateDesignDocument(invalidRoot)).toMatchObject({ success: false })
  })

  it('reports missing children and both parent-child mismatch directions', () => {
    const missing = createValidDesignFixture()
    missing.nodes['container-1']!.children.push('missing-child')
    expect(validateDesignDocument(missing)).toMatchObject({ success: false })

    const parentMissingReference = createValidDesignFixture()
    parentMissingReference.nodes['container-1']!.children = parentMissingReference.nodes['container-1']!.children.filter(id => id !== 'heading-1')
    expect(validateDesignDocument(parentMissingReference)).toMatchObject({ success: false })

    const childWrongParent = createValidDesignFixture()
    childWrongParent.nodes['heading-1']!.parentId = 'section-1'
    expect(validateDesignDocument(childWrongParent)).toMatchObject({ success: false })
  })

  it('exports JSON Schema from the canonical contract', () => {
    const schema = exportDesignDocumentJsonSchema()

    expect(schema).toMatchObject({ $schema: expect.stringContaining('json-schema'), anyOf: expect.any(Array) })
  })
})

describe('Design Document v2 multi-page contract', () => {
  function multiPageDocument(): DesignDocumentV2 {
    const migrated = migrateDesignDocumentV1ToV2(createValidDesignFixture())
    const aboutRoot = structuredClone(migrated.nodes['page-root']!)
    aboutRoot.id = 'about-root'
    aboutRoot.children = []
    migrated.nodes['about-root'] = aboutRoot
    migrated.pages.push({ id: 'about', name: 'About', slug: '/about', rootNodeId: 'about-root' })
    migrated.navigation.items.push({ pageId: 'about', label: 'About' })
    return migrated
  }

  it('migrates v1 losslessly and idempotently without changing document version', () => {
    const legacy = createValidDesignFixture()
    const migrated = migrateDesignDocumentV1ToV2(legacy)

    expect(migrated).toMatchObject({
      schemaVersion: 2,
      projectId: legacy.projectId,
      version: legacy.version,
      pages: [{ id: 'home', name: 'Home', slug: '/', rootNodeId: 'page-root' }],
      navigation: { items: [{ pageId: 'home', label: 'Home' }] },
      nodes: legacy.nodes,
    })
    expect(migrateDesignDocumentV1ToV2(migrated)).toEqual(migrated)
    expect(parseDesignDocument(legacy)).toEqual({ success: true, data: migrated, migrated: true })
    expect(parseDesignDocument(migrated)).toEqual({ success: true, data: migrated, migrated: false })
  })

  it.each([
    ['About Us', '/about-us'],
    ['/Pricing/Enterprise', '/pricing/enterprise'],
    ['  contact  ', '/contact'],
    ['Crème brûlée', '/creme-brulee'],
  ])('normalizes safe page slug %s', (input, expected) => {
    expect(normalizePageSlug(input)).toEqual({ success: true, slug: expected })
  })

  it.each([
    '../admin', '/a/private', '/API', '/about//team', '/about/%2fteam', '/about/%2eteam',
    '/about\\team', '/about?x=1', '/about#x', '/favicon.ico', '/one/two/three/four/five',
  ])('rejects unsafe or reserved slug %s', input => {
    expect(normalizePageSlug(input)).toMatchObject({ success: false })
  })

  it('validates multiple roots, navigation and deterministic route lookup', () => {
    const document = multiPageDocument()

    expect(validateDesignDocument(document)).toEqual({ success: true, data: document })
    expect(findPageByRoute(document, '/about/')).toMatchObject({ id: 'about', rootNodeId: 'about-root' })
    expect(findPageByRoute(document, '/missing')).toBeNull()
    expect(collectBrokenPageReferences(document)).toEqual([])
  })

  it.each([
    ['duplicate page ID', (document: DesignDocumentV2) => { document.pages[1]!.id = 'home' }],
    ['duplicate normalized slug', (document: DesignDocumentV2) => { document.pages[1]!.slug = '/ABOUT' }],
    ['second home', (document: DesignDocumentV2) => { document.pages[1]!.slug = '/' }],
    ['shared root', (document: DesignDocumentV2) => { document.pages[1]!.rootNodeId = 'page-root' }],
    ['cross-page root child', (document: DesignDocumentV2) => {
      document.nodes['page-root']!.children.push('about-root')
      document.nodes['about-root']!.parentId = 'page-root'
    }],
    ['missing navigation target', (document: DesignDocumentV2) => { document.navigation.items[1]!.pageId = 'missing' }],
  ])('rejects %s', (_label, mutate) => {
    const document = multiPageDocument()
    mutate(document)
    expect(validateDesignDocument(document).success).toBe(false)
  })

  it('reports broken structured page links and accepts valid ones', () => {
    const document = multiPageDocument()
    document.nodes['button-1']!.props = { text: 'About', pageId: 'about' }
    expect(validateDesignDocument(document).success).toBe(true)
    expect(collectBrokenPageReferences(document)).toEqual([])

    document.nodes['button-1']!.props = { text: 'Missing', pageId: 'missing' }
    expect(collectBrokenPageReferences(document)).toEqual([
      { kind: 'node', nodeId: 'button-1', pageId: 'missing' },
    ])
    expect(validateDesignDocument(document).success).toBe(false)
  })

  it('enforces bounded page and navigation counts', () => {
    const document = migrateDesignDocumentV1ToV2(createValidDesignFixture())
    for (let index = 1; index <= DESIGN_LIMITS.maxPages; index += 1) {
      const rootNodeId = `page-root-${index}`
      document.nodes[rootNodeId] = { id: rootNodeId, type: 'page', parentId: null, children: [], props: {}, style: {}, responsive: {} }
      document.pages.push({ id: `page-${index}`, name: `Page ${index}`, slug: `/page-${index}`, rootNodeId })
      document.navigation.items.push({ pageId: `page-${index}`, label: `Page ${index}` })
    }

    expect(validateDesignDocument(document).success).toBe(false)
  })
})
