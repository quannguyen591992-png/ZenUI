import { describe, expect, it } from 'vitest'

import {
  DESIGN_LIMITS,
  createValidDesignFixture,
  exportDesignDocumentJsonSchema,
  validateDesignDocument,
} from '../src/index.js'

describe('Design Document v1', () => {
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

  it('exports JSON Schema from the canonical contract', () => {
    const schema = exportDesignDocumentJsonSchema()

    expect(schema).toMatchObject({ $schema: expect.stringContaining('json-schema'), type: 'object' })
  })
})
