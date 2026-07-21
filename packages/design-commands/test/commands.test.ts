import { createValidDesignFixture } from '@zenui/design-schema'
import { describe, expect, it } from 'vitest'

import {
  applyCommandTransaction,
  designCommandSchema,
  type DesignCommand,
} from '../src/index.js'

const metadata = {
  commandId: 'command-1',
  documentVersion: 1,
  source: 'user' as const,
}

describe('design command contract', () => {
  it.each([
    'INSERT_NODE', 'MOVE_NODE', 'REMOVE_NODE', 'DUPLICATE_NODE', 'UPDATE_PROPS',
    'UPDATE_STYLE', 'UPDATE_RESPONSIVE_STYLE', 'UPDATE_THEME', 'REPLACE_SUBTREE',
  ])('defines a discriminated command for %s', type => {
    const samples: Record<string, unknown> = {
      INSERT_NODE: { ...metadata, type, parentId: 'container-1', index: 0, node: { id: 'new-heading', type: 'heading', parentId: 'container-1', children: [], props: { text: 'New', level: 2 }, style: {}, responsive: {} } },
      MOVE_NODE: { ...metadata, type, nodeId: 'heading-1', newParentId: 'container-1', newIndex: 1 },
      REMOVE_NODE: { ...metadata, type, nodeId: 'heading-1' },
      DUPLICATE_NODE: { ...metadata, type, nodeId: 'heading-1', newNodeId: 'heading-copy', targetParentId: 'container-1', index: 1 },
      UPDATE_PROPS: { ...metadata, type, nodeId: 'heading-1', patch: { text: 'Updated' } },
      UPDATE_STYLE: { ...metadata, type, nodeId: 'heading-1', patch: { color: '#112233' } },
      UPDATE_RESPONSIVE_STYLE: { ...metadata, type, nodeId: 'heading-1', breakpoint: 'mobile', patch: { fontSize: 24 } },
      UPDATE_THEME: { ...metadata, type, patch: { colors: { primary: '#112233' } } },
      REPLACE_SUBTREE: { ...metadata, type, nodeId: 'heading-1', nodes: [{ id: 'replacement', type: 'heading', parentId: 'container-1', children: [], props: { text: 'Replacement', level: 2 }, style: {}, responsive: {} }], rootNodeId: 'replacement' },
    }

    expect(designCommandSchema.safeParse(samples[type]).success).toBe(true)
  })

  it('applies a valid batch atomically and increments the document version once', () => {
    const document = createValidDesignFixture()
    const commands: DesignCommand[] = [
      { ...metadata, type: 'UPDATE_PROPS', nodeId: 'heading-1', patch: { text: 'Changed' } },
      { ...metadata, commandId: 'command-2', type: 'UPDATE_STYLE', nodeId: 'heading-1', patch: { color: '#112233' } },
    ]

    const result = applyCommandTransaction(document, 1, commands)

    expect(result).toMatchObject({ accepted: true, version: 2 })
    if (result.accepted) {
      const heading = result.document.nodes['heading-1']
      expect(heading?.type).toBe('heading')
      if (heading?.type === 'heading' && 'text' in heading.props) expect(heading.props.text).toBe('Changed')
      expect(heading?.style.color).toBe('#112233')
      expect(result.inverseCommands).toHaveLength(2)
    }
  })

  it('rejects stale versions with a stable code', () => {
    const command: DesignCommand = {
      ...metadata, documentVersion: 2, type: 'UPDATE_PROPS', nodeId: 'heading-1', patch: { text: 'Changed' },
    }

    expect(applyCommandTransaction(createValidDesignFixture(), 1, [command])).toMatchObject({
      accepted: false,
      error: { code: 'stale_document_version' },
    })
  })

  it('rejects an invalid batch without applying earlier commands', () => {
    const document = createValidDesignFixture()
    const commands: DesignCommand[] = [
      { ...metadata, type: 'UPDATE_PROPS', nodeId: 'heading-1', patch: { text: 'Must roll back' } },
      { ...metadata, commandId: 'command-2', type: 'MOVE_NODE', nodeId: 'section-1', newParentId: 'container-1', newIndex: 0 },
    ]

    const result = applyCommandTransaction(document, 1, commands)

    expect(result).toMatchObject({ accepted: false, error: { code: 'cycle_detected' } })
    const heading = document.nodes['heading-1']
    expect(heading?.type).toBe('heading')
    if (heading?.type === 'heading' && 'text' in heading.props) expect(heading.props.text).toBe('Build your next product')
  })

  it('inserts, removes, duplicates and moves leaf nodes', () => {
    const insert: DesignCommand = {
      ...metadata, type: 'INSERT_NODE', parentId: 'container-1', index: 0,
      node: { id: 'heading-new', type: 'heading', parentId: 'container-1', children: [], props: { text: 'New', level: 2 }, style: {}, responsive: {} },
    }
    const inserted = applyCommandTransaction(createValidDesignFixture(), 1, [insert])
    expect(inserted).toMatchObject({ accepted: true })
    if (!inserted.accepted) return

    const duplicate: DesignCommand = {
      ...metadata, documentVersion: 2, type: 'DUPLICATE_NODE', nodeId: 'heading-new', newNodeId: 'heading-copy', targetParentId: 'container-1', index: 1,
    }
    const duplicated = applyCommandTransaction(inserted.document, 2, [duplicate])
    expect(duplicated).toMatchObject({ accepted: true })
    if (!duplicated.accepted) return

    const move: DesignCommand = {
      ...metadata, documentVersion: 3, type: 'MOVE_NODE', nodeId: 'heading-copy', newParentId: 'section-1', newIndex: 1,
    }
    const moved = applyCommandTransaction(duplicated.document, 3, [move])
    expect(moved).toMatchObject({ accepted: true })
    if (!moved.accepted) return

    const remove: DesignCommand = {
      ...metadata, documentVersion: 4, type: 'REMOVE_NODE', nodeId: 'heading-copy',
    }
    const removed = applyCommandTransaction(moved.document, 4, [remove])
    expect(removed).toMatchObject({ accepted: true })
    if (removed.accepted) expect(removed.document.nodes['heading-copy']).toBeUndefined()
  })

  it('updates responsive styles and theme', () => {
    const commands: DesignCommand[] = [
      { ...metadata, type: 'UPDATE_RESPONSIVE_STYLE', nodeId: 'heading-1', breakpoint: 'mobile', patch: { fontSize: 24 } },
      { ...metadata, commandId: 'command-2', type: 'UPDATE_THEME', patch: { colors: { primary: '#112233', background: '#ffffff', text: '#0f172a' } } },
    ]
    const result = applyCommandTransaction(createValidDesignFixture(), 1, commands)
    expect(result).toMatchObject({ accepted: true })
    if (result.accepted) {
      expect(result.document.nodes['heading-1']?.responsive.mobile).toEqual({ fontSize: 24 })
      expect(result.document.theme.colors.primary).toBe('#112233')
    }
  })

  it.each([
    [{ ...metadata, type: 'REMOVE_NODE', nodeId: 'missing' }, 'node_not_found'],
    [{ ...metadata, type: 'REMOVE_NODE', nodeId: 'page-root' }, 'root_operation_forbidden'],
    [{ ...metadata, type: 'REMOVE_NODE', nodeId: 'section-1' }, 'invalid_command'],
    [{ ...metadata, type: 'INSERT_NODE', parentId: 'missing', index: 0, node: { id: 'x', type: 'heading', parentId: 'missing', children: [], props: { text: 'X', level: 2 }, style: {}, responsive: {} } }, 'parent_not_found'],
    [{ ...metadata, type: 'MOVE_NODE', nodeId: 'heading-1', newParentId: 'missing', newIndex: 0 }, 'parent_not_found'],
    [{ ...metadata, type: 'MOVE_NODE', nodeId: 'page-root', newParentId: 'section-1', newIndex: 0 }, 'root_operation_forbidden'],
    [{ ...metadata, type: 'MOVE_NODE', nodeId: 'button-1', newParentId: 'page-root', newIndex: 1 }, 'invalid_parent_child'],
    [{ ...metadata, type: 'DUPLICATE_NODE', nodeId: 'section-1', newNodeId: 'copy', targetParentId: 'page-root', index: 1 }, 'invalid_command'],
    [{ ...metadata, type: 'UPDATE_STYLE', nodeId: 'missing', patch: { color: '#112233' } }, 'node_not_found'],
    [{ ...metadata, type: 'REPLACE_SUBTREE', nodeId: 'heading-1', nodes: [{ id: 'r', type: 'heading', parentId: 'container-1', children: [], props: { text: 'R', level: 2 }, style: {}, responsive: {} }], rootNodeId: 'r' }, 'invalid_command'],
  ] as const)('returns stable errors for rejected operations', (command, code) => {
    const result = applyCommandTransaction(createValidDesignFixture(), 1, [command as DesignCommand])
    expect(result).toMatchObject({ accepted: false, error: { code } })
  })

  it('rejects malformed and empty command batches', () => {
    expect(applyCommandTransaction(createValidDesignFixture(), 1, [])).toMatchObject({ accepted: false, error: { code: 'invalid_command' } })
    expect(applyCommandTransaction(createValidDesignFixture(), 1, [{ type: 'UNKNOWN' } as never])).toMatchObject({ accepted: false, error: { code: 'invalid_command' } })
  })
})
