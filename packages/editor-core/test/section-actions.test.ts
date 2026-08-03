import { validateRegistryRelationships } from '@zenui/component-registry'
import {
  createValidDesignFixture,
  validateDesignDocument,
  type DesignDocument,
} from '@zenui/design-schema'
import { describe, expect, it } from 'vitest'

import {
  createEditorState,
  executeCommands,
  findContainingSectionId,
  getPageStory,
  planSectionDelete,
  planSectionDuplicate,
  planSectionLayoutReplacement,
  planSectionMove,
  planSectionVisibility,
  redo,
  undo,
} from '../src/index'

function createSectionDocument(): DesignDocument {
  const document = createValidDesignFixture()
  document.nodes['section-1']!.props = { label: 'Features' }
  document.nodes['section-1']!.style.display = 'grid'
  document.nodes['navbar-1'] = {
    id: 'navbar-1',
    type: 'navbar',
    parentId: 'page-root',
    children: [],
    props: { brand: 'ZenUI' },
    style: {},
    responsive: {},
  }
  document.nodes['hero-1'] = {
    id: 'hero-1',
    type: 'hero',
    parentId: 'page-root',
    children: [],
    props: { label: 'Welcome' },
    style: {},
    responsive: {},
  }
  document.nodes['testimonials-section'] = {
    id: 'testimonials-section',
    type: 'section',
    parentId: 'page-root',
    children: [],
    props: { label: 'Customer stories' },
    style: {},
    responsive: {},
  }
  document.nodes['faq-section'] = {
    id: 'faq-section',
    type: 'section',
    parentId: 'page-root',
    children: [],
    props: { label: 'Frequently asked questions' },
    style: {},
    responsive: {},
  }
  document.nodes['final-cta-section'] = {
    id: 'final-cta-section',
    type: 'section',
    parentId: 'page-root',
    children: [],
    props: { label: 'Start today' },
    style: {},
    responsive: {},
  }
  document.nodes['page-root']!.children = [
    'navbar-1',
    'hero-1',
    'section-1',
    'testimonials-section',
    'faq-section',
    'final-cta-section',
  ]
  return document
}

describe('section-first editor planners', () => {
  it('builds an ordered Page Story with stable labels, purposes and visibility', () => {
    const document = createSectionDocument()
    document.nodes['faq-section']!.props = {
      ...document.nodes['faq-section']!.props,
      hidden: true,
    }

    expect(getPageStory(document)).toEqual([
      { nodeId: 'navbar-1', label: 'ZenUI', purpose: 'Giới thiệu', hidden: false },
      { nodeId: 'hero-1', label: 'Welcome', purpose: 'Giới thiệu', hidden: false },
      { nodeId: 'section-1', label: 'Features', purpose: 'Giải thích giá trị', hidden: false },
      { nodeId: 'testimonials-section', label: 'Customer stories', purpose: 'Xây dựng niềm tin', hidden: false },
      { nodeId: 'faq-section', label: 'Frequently asked questions', purpose: 'Giải đáp câu hỏi', hidden: true },
      { nodeId: 'final-cta-section', label: 'Start today', purpose: 'Mời hành động', hidden: false },
    ])
  })

  it('maps primitive selection to its containing top-level section', () => {
    const document = createSectionDocument()

    expect(findContainingSectionId(document, 'heading-1')).toBe('section-1')
    expect(findContainingSectionId(document, 'section-1')).toBe('section-1')
    expect(findContainingSectionId(document, 'page-root')).toBeNull()
    expect(findContainingSectionId(document, 'missing')).toBeNull()
  })

  it('plans bounded section reorder using MOVE_NODE final-order semantics', () => {
    const document = createSectionDocument()

    expect(planSectionMove(document, 'hero-1', -1)).toMatchObject({
      accepted: true,
      command: { type: 'MOVE_NODE', nodeId: 'hero-1', newParentId: 'page-root', newIndex: 0 },
    })
    expect(planSectionMove(document, 'navbar-1', -1)).toMatchObject({
      accepted: false,
      code: 'index_out_of_bounds',
    })
    expect(planSectionMove(document, 'heading-1', 1)).toMatchObject({
      accepted: false,
      code: 'invalid_command',
    })
  })

  it('duplicates a complete section subtree with remapped collision-free IDs', () => {
    const document = createSectionDocument()
    const plan = planSectionDuplicate(
      document,
      'section-1',
      sourceId => `${sourceId}-copy`,
    )

    expect(plan).toMatchObject({
      accepted: true,
      command: {
        type: 'REPLACE_SUBTREE',
        nodeId: 'section-1-copy',
        rootNodeId: 'section-1-copy',
        index: 3,
      },
    })
    if (!plan.accepted) throw new Error('Expected duplicate plan')

    const duplicated = executeCommands(createEditorState(document), [plan.command])
    expect(duplicated.error).toBeNull()
    expect(duplicated.document.nodes['section-1-copy']?.parentId).toBe('page-root')
    expect(duplicated.document.nodes['container-1-copy']?.parentId).toBe('section-1-copy')
    expect(duplicated.document.nodes['section-1-copy']?.children).toEqual(['container-1-copy'])
    expect(duplicated.document.nodes['container-1-copy']?.children).toEqual([
      'heading-1-copy',
      'paragraph-1-copy',
      'image-1-copy',
      'button-1-copy',
    ])
    expect(validateDesignDocument(duplicated.document).success).toBe(true)
    expect(validateRegistryRelationships(duplicated.document)).toEqual([])
    expect(undo(duplicated).document.nodes['section-1-copy']).toBeUndefined()
  })

  it('rejects duplicate ID collisions without emitting a partial command', () => {
    const document = createSectionDocument()

    expect(planSectionDuplicate(document, 'section-1', () => 'section-1')).toMatchObject({
      accepted: false,
      code: 'invalid_command',
    })
  })

  it('hides and shows through props while preserving authored display layout and undo/redo', () => {
    const document = createSectionDocument()
    const hide = planSectionVisibility(document, 'section-1', true)
    if (!hide.accepted) throw new Error('Expected visibility plan')

    let state = executeCommands(createEditorState(document), [hide.command])
    expect(state.document.nodes['section-1']?.props).toEqual({ label: 'Features', hidden: true })
    expect(state.document.nodes['section-1']?.style.display).toBe('grid')

    state = undo(state)
    expect(state.document.nodes['section-1']?.props).toEqual({ label: 'Features' })
    expect(state.document.nodes['section-1']?.style.display).toBe('grid')

    state = redo(state)
    const show = planSectionVisibility(state.document, 'section-1', false)
    if (!show.accepted) throw new Error('Expected show plan')
    state = executeCommands(state, [show.command])
    expect(state.document.nodes['section-1']?.props).toEqual({ label: 'Features', hidden: false })
    expect(state.document.nodes['section-1']?.style.display).toBe('grid')
  })

  it('guards deletion of the final section and restores deleted subtrees exactly', () => {
    const document = createSectionDocument()
    const remove = planSectionDelete(document, 'section-1')
    if (!remove.accepted) throw new Error('Expected delete plan')
    const originalNodes = structuredClone(document.nodes)

    let state = executeCommands(createEditorState(document), [remove.command])
    expect(state.document.nodes['section-1']).toBeUndefined()
    state = undo(state)
    expect(state.document.nodes).toEqual(originalNodes)

    const onlySection = createValidDesignFixture()
    expect(planSectionDelete(onlySection, 'section-1')).toMatchObject({
      accepted: false,
      code: 'invalid_command',
    })
  })

  it('cycles a bounded layout without changing IDs, children or semantic content', () => {
    const document = createSectionDocument()
    const originalNodes = structuredClone(document.nodes)
    const plan = planSectionLayoutReplacement(document, 'section-1')
    if (!plan.accepted) throw new Error('Expected layout plan')

    expect(plan.command).toMatchObject({
      type: 'REPLACE_SUBTREE',
      nodeId: 'section-1',
      rootNodeId: 'section-1',
    })
    expect(new Set(plan.command.nodes.map(node => node.id))).toEqual(new Set([
      'section-1',
      'container-1',
      'heading-1',
      'paragraph-1',
      'image-1',
      'button-1',
    ]))
    for (const replacement of plan.command.nodes) {
      expect(replacement.props).toEqual(originalNodes[replacement.id]?.props)
      expect(replacement.children).toEqual(originalNodes[replacement.id]?.children)
    }

    let state = executeCommands(createEditorState(document), [plan.command])
    expect(state.error).toBeNull()
    expect(state.document.nodes['section-1']?.style).not.toEqual(originalNodes['section-1']?.style)
    expect(validateDesignDocument(state.document).success).toBe(true)
    expect(validateRegistryRelationships(state.document)).toEqual([])

    state = undo(state)
    expect(state.document.nodes).toEqual(originalNodes)
  })
})
