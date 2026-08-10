import { createRemoteImagePolicy, createValidDesignFixture, migrateDesignDocumentV1ToV2, type DesignDocumentV2 } from '@zenui/design-schema'
import { describe, expect, it } from 'vitest'

import {
  buildRenderPlan,
  compileStandaloneHtml,
  compileStaticSite,
  escapeHtml,
  nodeStyleToBrowserStyle,
  nodeStyleToCss,
  nodeToBrowserStyle,
  resolveNodeStyle,
  resolveNodeTag,
} from '../src/index.js'

describe('standalone HTML compiler', () => {
  it('resolves semantic tags and stable allowlisted styles', () => {
    const document = createValidDesignFixture()
    const heading = document.nodes['heading-1']!

    expect(resolveNodeTag(heading)).toBe('h1')
    expect(nodeStyleToCss({ color: '#112233', paddingTop: 12, width: 'full' })).toBe('width:100%;padding-top:12px;color:#112233')
  })

  it('resolves the same bounded styles for browser Canvas and compiler CSS', () => {
    const document = createValidDesignFixture()
    const heading = document.nodes['heading-1']!
    heading.style = {
      width: 'full', gridColumns: 2, gridColumnSpan: 2, gridRowSpan: 2,
      aspectRatio: 'wide', objectFit: 'cover', objectPosition: 'top',
      fontSize: 48, shadow: 'md', borderWidth: 1,
    }
    heading.responsive.mobile = { gridColumns: 1, gridColumnSpan: 1, gridRowSpan: 1, aspectRatio: 'landscape', fontSize: 24 }

    expect(resolveNodeStyle(heading, 'mobile')).toEqual({
      width: 'full', gridColumns: 1, gridColumnSpan: 1, gridRowSpan: 1,
      aspectRatio: 'landscape', objectFit: 'cover', objectPosition: 'top',
      fontSize: 24, shadow: 'md', borderWidth: 1,
    })
    expect(nodeStyleToBrowserStyle(resolveNodeStyle(heading, 'mobile'))).toEqual({
      gridTemplateColumns: 'repeat(1,minmax(0,1fr))',
      gridColumn: 'span 1',
      gridRow: 'span 1',
      width: '100%',
      aspectRatio: '4/3',
      objectFit: 'cover',
      objectPosition: 'top',
      fontSize: '24px',
      borderWidth: '1px',
      boxShadow: '0 12px 32px rgba(15,23,42,.10)',
      borderStyle: 'solid',
    })
    expect(nodeToBrowserStyle(heading, 'mobile')).toEqual({
      margin: '0',
      ...nodeStyleToBrowserStyle(resolveNodeStyle(heading, 'mobile')),
    })
    expect(nodeStyleToCss(resolveNodeStyle(heading, 'mobile'))).toBe(
      'grid-template-columns:repeat(1,minmax(0,1fr));grid-column:span 1;grid-row:span 1;width:100%;aspect-ratio:4/3;object-fit:cover;object-position:top;font-size:24px;border-width:1px;box-shadow:0 12px 32px rgba(15,23,42,.10)',
    )
  })

  it('escapes text and attributes', () => {
    expect(escapeHtml('<script>"x" & y</script>')).toBe('&lt;script&gt;&quot;x&quot; &amp; y&lt;/script&gt;')
  })

  it('compiles deterministic standalone HTML without scripts', () => {
    const document = createValidDesignFixture()
    const first = compileStandaloneHtml(document)
    const second = compileStandaloneHtml(document)

    expect(first).toEqual(second)
    expect(first).toMatchObject({ success: true })
    if (!first.success) return
    expect(first.html).toContain('<!doctype html>')
    expect(first.html).toContain('<h1')
    expect(first.html).toContain('Build your next product')
    expect(first.html).toContain('https://images.example.com/hero.png')
    expect(first.html).not.toMatch(/<script|\son\w+=/i)
  })

  it('omits hidden sections from every canonical render surface without mutating content', () => {
    const document = createValidDesignFixture()
    document.nodes['section-1']!.props = { hidden: true }
    document.nodes['section-1']!.style.display = 'grid'
    const original = structuredClone(document)

    expect(nodeToBrowserStyle(document.nodes['section-1']!)).toMatchObject({ display: 'none' })
    const plan = buildRenderPlan(document)
    const compiled = compileStandaloneHtml(document)

    expect(plan).toMatchObject({ success: true })
    expect(compiled).toMatchObject({ success: true })
    if (!plan.success || !compiled.success) return
    expect(plan.root.children).toEqual([])
    expect(plan.css).not.toContain('[data-node-id="section-1"]')
    expect(compiled.html).not.toContain('Build your next product')
    expect(document).toEqual(original)
  })

  it('renders Phase 2 primitives and responsive overrides safely', () => {
    const document = createValidDesignFixture()
    document.nodes['container-1']!.children.push('link-1', 'icon-1', 'badge-1', 'spacer-1')
    document.nodes['link-1'] = {
      id: 'link-1', type: 'link', parentId: 'container-1', children: [],
      props: { text: 'Read docs', href: '/docs' }, style: {}, responsive: {},
    }
    document.nodes['icon-1'] = {
      id: 'icon-1', type: 'icon', parentId: 'container-1', children: [],
      props: { name: 'star', label: 'Featured' }, style: {}, responsive: {},
    }
    document.nodes['badge-1'] = {
      id: 'badge-1', type: 'badge', parentId: 'container-1', children: [],
      props: { text: 'New' }, style: {}, responsive: {},
    }
    document.nodes['spacer-1'] = {
      id: 'spacer-1', type: 'spacer', parentId: 'container-1', children: [],
      props: { size: 24 }, style: {}, responsive: {},
    }
    document.nodes['heading-1']!.responsive = {
      tablet: { fontSize: 36 },
      mobile: { fontSize: 24, display: 'none' },
    }

    const result = compileStandaloneHtml(document)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.html).toContain('<a data-node-id="link-1" data-node-type="link" href="/docs">Read docs</a>')
    expect(result.html).toContain('aria-label="Featured"')
    expect(result.html).toContain('<svg')
    expect(result.html).toContain('<path d=')
    expect(result.html).not.toContain('★')
    expect(result.html).toContain('height:24px')
    expect(result.html).toContain('@media(max-width:1024px)')
    expect(result.html).toContain('@media(max-width:640px)')
    expect(result.html).not.toMatch(/<script|\son\w+=/i)
  })

  it('builds one canonical render plan for preview and export', () => {
    const document = createValidDesignFixture()
    const plan = buildRenderPlan(document)
    const compiled = compileStandaloneHtml(document)

    expect(plan).toMatchObject({ success: true })
    expect(compiled).toMatchObject({ success: true })
    if (!plan.success || !compiled.success) return
    expect(plan.root).toMatchObject({ tag: 'main', attributes: { 'data-node-id': 'page-root' } })
    expect(plan.css).toContain('[data-node-id="heading-1"]')
    expect(plan.css).not.toContain('javascript:')
    expect(compiled.html).toContain(plan.css)
    expect(compiled.html).not.toMatch(/\sstyle="/i)
  })

  it('emits strict CSP, correct void elements and privacy-safe external assets', () => {
    const document = createValidDesignFixture()
    document.nodes['container-1']!.children.push('divider-1')
    document.nodes['divider-1'] = {
      id: 'divider-1', type: 'divider', parentId: 'container-1', children: [],
      props: {}, style: { borderWidth: 1 }, responsive: {},
    }
    const result = compileStandaloneHtml(document)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.html).toMatch(/http-equiv="Content-Security-Policy"/)
    expect(result.html).toContain("script-src 'none'")
    expect(result.html).toContain("style-src 'sha256-")
    expect(result.html).toContain('referrerpolicy="no-referrer"')
    expect(result.html).toContain('loading="lazy"')
    expect(result.html).toContain('[data-node-type="button"],[data-node-type="link"]{color:inherit;text-decoration:none}')
    expect(result.html).toContain('[data-node-type="button"]{display:inline-flex')
    expect(result.html).toContain('[data-node-type="badge"]{display:inline-flex')
    expect(result.html).toContain(':focus-visible{outline:3px solid currentColor')
    expect(result.html).toMatch(/<img [^>]+>/)
    expect(result.html).not.toContain('</img>')
    expect(result.html).toMatch(/<hr [^>]+>/)
    expect(result.html).not.toContain('</hr>')
  })

  it('resolves owned image and logo assets from one environment asset origin', () => {
    const document = createValidDesignFixture()
    document.nodes['image-1']!.props = {
      assetId: '11111111-1111-4111-8111-111111111111', alt: 'Product dashboard', decorative: false,
    }
    document.nodes['brand-link'] = {
      id: 'brand-link', type: 'link', parentId: 'container-1', children: [],
      props: {
        text: 'NovaFlow', href: '#top', brandSlot: true,
        logoAssetId: '22222222-2222-4222-8222-222222222222', logoAlt: 'NovaFlow',
      }, style: {}, responsive: {},
    }
    document.nodes['container-1']!.children.push('brand-link')

    const result = compileStandaloneHtml(document, { assetOrigin: 'https://assets.example.com' })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.html).toContain('src="https://assets.example.com/a/11111111-1111-4111-8111-111111111111"')
    expect(result.html).toContain('<a data-node-id="brand-link"')
    expect(result.html).toContain('src="https://assets.example.com/a/22222222-2222-4222-8222-222222222222"')
    expect(result.html).toContain('alt="NovaFlow"')
    expect(result.csp).toContain('img-src https://assets.example.com')
  })

  it('resolves portable owned assets relative to root and nested pages', () => {
    const document: DesignDocumentV2 = migrateDesignDocumentV1ToV2(createValidDesignFixture())
    const assetId = '11111111-1111-4111-8111-111111111111'
    document.nodes['image-1']!.props = { assetId, alt: 'Product dashboard', decorative: false }
    document.nodes['about-root'] = {
      id: 'about-root', type: 'page', parentId: null, children: ['about-section'], props: {}, style: {}, responsive: {},
    }
    document.nodes['about-section'] = {
      id: 'about-section', type: 'section', parentId: 'about-root', children: ['about-image'],
      props: { label: 'About' }, style: {}, responsive: {},
    }
    document.nodes['about-image'] = {
      id: 'about-image', type: 'image', parentId: 'about-section', children: [],
      props: { assetId, alt: 'Product dashboard', decorative: false }, style: {}, responsive: {},
    }
    document.pages.push({ id: 'about', name: 'About', slug: '/about', rootNodeId: 'about-root' })

    const result = compileStaticSite(document, {
      portableAssetPaths: { [assetId]: `assets/${assetId}.webp` },
      assetOrigin: 'http://127.0.0.1:3002',
    })

    expect(result).toMatchObject({ success: true })
    if (!result.success) return
    expect(result.files.find(file => file.path === 'index.html')?.html)
      .toContain(`src="assets/${assetId}.webp"`)
    expect(result.files.find(file => file.path === 'about/index.html')?.html)
      .toContain(`src="../assets/${assetId}.webp"`)
    for (const file of result.files) {
      expect(file.csp).toContain("img-src 'self'")
      expect(file.html).not.toMatch(/localhost|127\.0\.0\.1|assets\/[^"']*\/image\.webp/)
    }
  })

  it('uses one remote-image policy for validation and exact CSP sources', () => {
    const policy = createRemoteImagePolicy('images.example.com,*.cdn.example.com')
    const result = compileStandaloneHtml(createValidDesignFixture(), { imagePolicy: policy })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.csp).toContain('img-src https://*.cdn.example.com https://images.example.com')
    expect(result.csp).not.toContain('img-src http: https:')

    const denied = createValidDesignFixture()
    denied.nodes['image-1']!.props = { src: 'https://evil.example.test/hero.png', alt: 'Denied' }
    expect(compileStandaloneHtml(denied, { imagePolicy: policy })).toMatchObject({
      success: false, code: 'invalid_document',
    })
  })

  it('adds allowlisted share metadata without weakening CSP', () => {
    const result = compileStandaloneHtml(createValidDesignFixture(), {
      title: 'ZenUI shared page',
      robots: 'noindex, nofollow, noarchive',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.html).toContain('<title>ZenUI shared page</title>')
    expect(result.html).toContain('<meta name="robots" content="noindex, nofollow, noarchive">')
    expect(result.csp).toContain("script-src 'none'")
    expect(result.html).toContain(`content="${result.csp}"`)
  })

  it('compiles a deterministic bounded static-site manifest for all routes', () => {
    const document: DesignDocumentV2 = migrateDesignDocumentV1ToV2(createValidDesignFixture())
    document.pages[0]!.name = 'Home'
    const aboutRoot = { ...structuredClone(document.nodes['page-root']!), id: 'about-root', children: ['about-section'] }
    document.nodes['about-root'] = aboutRoot
    document.nodes['about-section'] = {
      id: 'about-section', type: 'section', parentId: 'about-root', children: ['about-heading'],
      props: { label: 'About' }, style: {}, responsive: {},
    }
    document.nodes['about-heading'] = {
      id: 'about-heading', type: 'heading', parentId: 'about-section', children: [],
      props: { text: 'About ZenUI', level: 1 }, style: {}, responsive: {},
    }
    document.pages.push({ id: 'about', name: 'About', slug: '/about', rootNodeId: 'about-root' })
    document.navigation.items.push({ pageId: 'about', label: 'About' })
    document.nodes['button-1']!.props = { text: 'About', pageId: 'about' }

    const first = compileStaticSite(document)
    const second = compileStaticSite(document)

    expect(first).toEqual(second)
    expect(first).toMatchObject({
      success: true,
      files: [
        { path: 'about/index.html', route: '/about' },
        { path: 'index.html', route: '/' },
      ],
      routeCount: 2,
      bytes: expect.any(Number),
      checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    if (!first.success) return
    expect(first.files[0]!.html).toContain('About ZenUI')
    expect(first.files[1]!.html).toContain('href="/about"')
  })

  it('renders a selected page and rejects missing routes or site budgets', () => {
    const document: DesignDocumentV2 = migrateDesignDocumentV1ToV2(createValidDesignFixture())
    document.nodes['about-root'] = { id: 'about-root', type: 'page', parentId: null, children: [], props: {}, style: {}, responsive: {} }
    document.pages.push({ id: 'about', name: 'About', slug: '/about', rootNodeId: 'about-root' })

    expect(buildRenderPlan(document, { pageId: 'about' })).toMatchObject({ success: true, root: { attributes: { 'data-node-id': 'about-root' } } })
    expect(buildRenderPlan(document, { route: '/missing' })).toMatchObject({ success: false, code: 'route_not_found' })
    expect(compileStaticSite(document, { maxSiteBytes: 100 })).toMatchObject({ success: false, code: 'artifact_too_large' })
  })

  it('rejects invalid documents, registry relationships and oversized artifacts before rendering', () => {
    const unsafe = createValidDesignFixture()
    unsafe.nodes['image-1']!.props = { src: 'javascript:alert(1)', alt: 'Unsafe' }
    expect(compileStandaloneHtml(unsafe)).toMatchObject({ success: false, code: 'invalid_document' })

    const relationship = createValidDesignFixture()
    relationship.nodes['page-root']!.children.push('paragraph-2')
    relationship.nodes['paragraph-2'] = {
      id: 'paragraph-2', type: 'paragraph', parentId: 'page-root', children: [],
      props: { text: 'Invalid parent' }, style: {}, responsive: {},
    }
    expect(buildRenderPlan(relationship)).toMatchObject({ success: false, code: 'invalid_relationship' })

    expect(compileStandaloneHtml(createValidDesignFixture(), { maxArtifactBytes: 100 }))
      .toMatchObject({ success: false, code: 'artifact_too_large' })
  })
})
