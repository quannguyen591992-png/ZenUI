import { validateDesignDocument } from '@zenui/design-schema'
import { describe, expect, it } from 'vitest'

import {
  COMPONENT_TYPES,
  componentRegistry,
  createRegistryFixture,
  isAllowedChild,
} from '../src/index.js'

describe('prototype component registry', () => {
  it('contains the eight Phase 0 component types exactly once', () => {
    expect(Object.keys(componentRegistry).sort()).toEqual([...COMPONENT_TYPES].sort())
    expect(new Set(COMPONENT_TYPES).size).toBe(8)
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

  it('does not expose raw CSS or arbitrary font values', () => {
    const result = componentRegistry.heading.styleSchema.safeParse({
      rawCss: 'position:fixed',
      fontFamily: 'Untrusted Font',
    })

    expect(result.success).toBe(false)
  })
})
