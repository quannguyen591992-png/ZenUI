import { validateDesignDocument } from '@zenui/design-schema'
import { describe, expect, it } from 'vitest'

import {
  COMPONENT_TYPES,
  componentRegistry,
  createRegistryFixture,
  isAllowedChild,
  validateRegistryRelationships,
} from '../src/index.js'

describe('prototype component registry', () => {
  it('contains the eighteen Phase 2 component types exactly once', () => {
    expect(Object.keys(componentRegistry).sort()).toEqual([...COMPONENT_TYPES].sort())
    expect(new Set(COMPONENT_TYPES).size).toBe(18)
  })

  it.each(COMPONENT_TYPES)('has valid defaults and a valid fixture for %s', type => {
    const definition = componentRegistry[type]

    expect(definition.propSchema.safeParse(definition.defaultProps).success).toBe(true)
    expect(definition.styleSchema.safeParse(definition.defaultStyle).success).toBe(true)
    expect(validateDesignDocument(createRegistryFixture(type)).success).toBe(true)
  })

  it('enforces parent-child constraints', () => {
    expect(isAllowedChild('page', 'section')).toBe(true)
    expect(isAllowedChild('container', 'heading')).toBe(true)
    expect(isAllowedChild('heading', 'paragraph')).toBe(false)
    expect(isAllowedChild('page', 'button')).toBe(false)
  })

  it('defines safe composite templates with unique local IDs', () => {
    for (const type of ['navbar', 'hero', 'feature-card'] as const) {
      const template = componentRegistry[type].template
      expect(template).toBeDefined()
      expect(template?.nodes.length).toBeGreaterThan(1)
      expect(new Set(template?.nodes.map(node => node.id)).size).toBe(template?.nodes.length)
      expect(template?.nodes.some(node => node.id === template.rootNodeId)).toBe(true)
    }
  })

  it('reports invalid registry relationships in a document', () => {
    const document = createRegistryFixture('button')
    document.nodes['button-1']!.parentId = 'page-root'
    document.nodes['container-1']!.children = document.nodes['container-1']!.children.filter(id => id !== 'button-1')
    document.nodes['page-root']!.children.push('button-1')

    expect(validateRegistryRelationships(document)).toEqual([expect.objectContaining({
      code: 'invalid_parent_child',
      path: 'nodes.page-root.children',
    })])
  })

  it('does not expose raw CSS or arbitrary font values', () => {
    const result = componentRegistry.heading.styleSchema.safeParse({
      rawCss: 'position:fixed',
      fontFamily: 'Untrusted Font',
    })

    expect(result.success).toBe(false)
  })
})
