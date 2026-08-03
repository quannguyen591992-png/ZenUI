import { createValidDesignFixture } from '@zenui/design-schema'
import { describe, expect, it } from 'vitest'

import { buildPromptContext } from '../src/index.js'

describe('minimal AI prompt context', () => {
  it('includes only a selected subtree and its immediate parent for selection edits', () => {
    const context = buildPromptContext({
      mode: 'edit-selection',
      prompt: 'Improve this heading',
      document: createValidDesignFixture(),
      selectedNodeId: 'heading-1',
    })

    expect(context).toMatchObject({
      selectedNodeId: 'heading-1',
      editableProps: { 'heading-1': ['level', 'text'] },
    })
    expect(JSON.stringify(context)).toContain('heading-1')
    expect(JSON.stringify(context)).toContain('container-1')
    expect(JSON.stringify(context)).not.toContain('image-1')
    expect(JSON.stringify(context)).not.toContain('button-1')
  })

  it('rejects context that exceeds the configured byte budget', () => {
    expect(() => buildPromptContext({
      mode: 'edit-page',
      prompt: 'Improve this page',
      document: createValidDesignFixture(),
      maxContextBytes: 50,
    })).toThrow('context_budget_exceeded')
  })
})
