import { createValidDesignFixture } from '@zenui/design-schema'
import { describe, expect, it } from 'vitest'

import {
  compileStandaloneHtml,
  escapeHtml,
  nodeStyleToCss,
  resolveNodeTag,
} from '../src/index.js'

describe('standalone HTML compiler', () => {
  it('resolves semantic tags and stable allowlisted styles', () => {
    const document = createValidDesignFixture()
    const heading = document.nodes['heading-1']!

    expect(resolveNodeTag(heading)).toBe('h1')
    expect(nodeStyleToCss({ color: '#112233', paddingTop: 12, width: 'full' })).toBe('width:100%;padding-top:12px;color:#112233')
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
    expect(result.html).toContain('<a data-node-id="link-1" href="/docs">Read docs</a>')
    expect(result.html).toContain('aria-label="Featured"')
    expect(result.html).toContain('★')
    expect(result.html).toContain('height:24px')
    expect(result.html).toContain('@media(max-width:1024px)')
    expect(result.html).toContain('@media(max-width:640px)')
    expect(result.html).not.toMatch(/<script|\son\w+=/i)
  })

  it('rejects invalid documents before rendering', () => {
    const document = createValidDesignFixture()
    document.nodes['image-1']!.props = { src: 'javascript:alert(1)', alt: 'Unsafe' }

    expect(compileStandaloneHtml(document)).toMatchObject({ success: false, code: 'invalid_document' })
  })
})
