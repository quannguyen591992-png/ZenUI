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
  it('contains the nineteen bounded editor component types exactly once', () => {
    expect(Object.keys(componentRegistry).sort()).toEqual([...COMPONENT_TYPES].sort())
    expect(new Set(COMPONENT_TYPES).size).toBe(19)
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

  it('accepts canonical owned images and an explicit navbar brand slot', () => {
    expect(componentRegistry.image.propSchema.safeParse({
      assetId: '11111111-1111-4111-8111-111111111111',
      alt: 'Product dashboard',
      decorative: false,
    }).success).toBe(true)
    const navbar = componentRegistry.navbar.template
    expect(navbar?.nodes).toContainEqual(expect.objectContaining({
      id: 'navbar-brand',
      type: 'link',
      props: expect.objectContaining({ brandSlot: true }),
    }))
  })

  it('defines Lead Form as a bounded composite leaf with canonical defaults', () => {
    const definition = componentRegistry['lead-form']

    expect(definition).toMatchObject({
      category: 'composite',
      isContainer: false,
      allowedChildren: [],
      renderTag: 'form',
      template: undefined,
    })
    expect(definition.allowedParents).toEqual(expect.arrayContaining([
      'section', 'container', 'stack', 'column', 'hero', 'feature-card',
    ]))
    expect(definition.propSchema.safeParse(definition.defaultProps).success).toBe(true)
    expect(definition.defaultStyle).toMatchObject({
      width: 'full',
      maxWidth: 720,
      marginLeft: 'auto',
      marginRight: 'auto',
    })
    expect(isAllowedChild('container', 'lead-form')).toBe(true)
    expect(isAllowedChild('lead-form', 'paragraph')).toBe(false)
    expect(createRegistryFixture('lead-form').nodes['fixture-lead-form']?.children).toEqual([])
  })

  it('exposes bounded form and typed action controls without operational authority', () => {
    expect(componentRegistry['lead-form'].inspector).toEqual([
      expect.objectContaining({ key: 'fields', control: 'lead-form-builder' }),
    ])
    expect(componentRegistry.button.inspector).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'action', control: 'conversion-action' }),
    ]))
    expect(componentRegistry.link.inspector).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'action', control: 'conversion-action' }),
    ]))

    const exposedKeys = [
      ...componentRegistry['lead-form'].inspector,
      ...componentRegistry.button.inspector,
      ...componentRegistry.link.inspector,
    ].map(field => field.key)
    expect(exposedKeys).not.toEqual(expect.arrayContaining([
      'rawJson', 'rawHtml', 'actionUrl', 'recipient', 'endpoint', 'webhook', 'secret',
    ]))
  })

  it('does not expose raw CSS or arbitrary font values', () => {
    const result = componentRegistry.heading.styleSchema.safeParse({
      rawCss: 'position:fixed',
      fontFamily: 'Untrusted Font',
    })

    expect(result.success).toBe(false)
  })
})
