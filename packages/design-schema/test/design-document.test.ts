import { describe, expect, it } from 'vitest'

import {
  COMPONENT_TYPES,
  DESIGN_LIMITS,
  createValidDesignFixture,
  designNodeSchema,
  exportDesignDocumentJsonSchema,
  validateDesignDocument,
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

    expect(schema).toMatchObject({ $schema: expect.stringContaining('json-schema'), type: 'object' })
  })
})
