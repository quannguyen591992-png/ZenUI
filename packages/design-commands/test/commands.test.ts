import { createValidDesignFixture, migrateDesignDocumentV1ToV2 } from '@zenui/design-schema'
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
    'UPDATE_STYLE', 'UPDATE_RESPONSIVE_STYLE', 'UPDATE_THEME', 'REPLACE_SUBTREE', 'REPLACE_DOCUMENT',
    'CREATE_PAGE', 'UPDATE_PAGE', 'MOVE_PAGE', 'DUPLICATE_PAGE', 'REMOVE_PAGE', 'UPDATE_NAVIGATION',
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
      REPLACE_DOCUMENT: { ...metadata, type, document: createValidDesignFixture() },
      CREATE_PAGE: { ...metadata, type, index: 1, page: { id: 'about', name: 'About', slug: '/about', rootNodeId: 'about-root' }, nodes: [{ id: 'about-root', type: 'page', parentId: null, children: [], props: {}, style: {}, responsive: {} }] },
      UPDATE_PAGE: { ...metadata, type, pageId: 'home', patch: { name: 'Homepage' } },
      MOVE_PAGE: { ...metadata, type, pageId: 'home', newIndex: 0 },
      DUPLICATE_PAGE: { ...metadata, type, sourcePageId: 'home', index: 1, page: { id: 'home-copy', name: 'Home copy', slug: '/home-copy', rootNodeId: 'home-copy-root' }, nodes: [{ id: 'home-copy-root', type: 'page', parentId: null, children: [], props: {}, style: {}, responsive: {} }] },
      REMOVE_PAGE: { ...metadata, type, pageId: 'about' },
      UPDATE_NAVIGATION: { ...metadata, type, items: [{ pageId: 'home', label: 'Home' }] },
    }

    expect(designCommandSchema.safeParse(samples[type]).success).toBe(true)
  })

  it('replaces an AI-generated document while preserving server ownership metadata', () => {
    const current = createValidDesignFixture()
    current.projectId = 'trusted-project'
    current.version = 7
    const generated = createValidDesignFixture()
    generated.projectId = 'model-forged-project'
    generated.version = 999
    generated.nodes['heading-1']!.props = { text: 'AI landing page', level: 1 }

    const result = applyCommandTransaction(current, 7, [{
      commandId: 'ai-generation',
      documentVersion: 7,
      source: 'ai',
      type: 'REPLACE_DOCUMENT',
      document: generated,
    }])

    expect(result).toMatchObject({ accepted: true, version: 8 })
    if (!result.accepted) return
    expect(result.document.projectId).toBe('trusted-project')
    expect(result.document.version).toBe(8)
    expect(result.document.nodes['heading-1']?.props).toMatchObject({ text: 'AI landing page' })
    expect(result.inverseCommands).toEqual([expect.objectContaining({
      type: 'REPLACE_DOCUMENT',
      document: expect.objectContaining({ projectId: 'trusted-project', version: 7 }),
    })])
  })

  it('rejects an invalid AI-generated document without changing the current document', () => {
    const current = createValidDesignFixture()
    const generated = createValidDesignFixture()
    generated.nodes['heading-1']!.props = { text: 'Unsafe', level: 99 }

    const result = applyCommandTransaction(current, 1, [{
      ...metadata,
      source: 'ai',
      type: 'REPLACE_DOCUMENT',
      document: generated,
    }])

    expect(result).toMatchObject({ accepted: false, error: { code: 'document_invalid' } })
    expect(current.nodes['heading-1']?.props).toMatchObject({ text: 'Build your next product' })
  })

  it('atomically replaces legacy remote image props with one canonical owned asset', () => {
    const command = JSON.parse(JSON.stringify({
      ...metadata,
      type: 'UPDATE_PROPS',
      nodeId: 'image-1',
      patch: {
        src: null,
        assetId: '11111111-1111-4111-8111-111111111111',
        alt: 'Owned product dashboard',
        decorative: false,
      },
    })) as DesignCommand
    const result = applyCommandTransaction(createValidDesignFixture(), 1, [command])

    expect(result).toMatchObject({ accepted: true, version: 2 })
    if (!result.accepted) return
    expect(result.document.nodes['image-1']?.props).toEqual({
      assetId: '11111111-1111-4111-8111-111111111111',
      alt: 'Owned product dashboard',
      decorative: false,
    })
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

  it('interprets MOVE_NODE indexes against the final same-parent order', () => {
    const document = createValidDesignFixture()
    const moved = applyCommandTransaction(document, 1, [{
      ...metadata,
      type: 'MOVE_NODE',
      nodeId: 'paragraph-1',
      newParentId: 'container-1',
      newIndex: 0,
    }])

    expect(moved).toMatchObject({ accepted: true })
    if (moved.accepted) {
      expect(moved.document.nodes['container-1']?.children).toEqual([
        'paragraph-1', 'heading-1', 'image-1', 'button-1',
      ])
    }
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
    [{ ...metadata, type: 'INSERT_NODE', parentId: 'missing', index: 0, node: { id: 'x', type: 'heading', parentId: 'missing', children: [], props: { text: 'X', level: 2 }, style: {}, responsive: {} } }, 'parent_not_found'],
    [{ ...metadata, type: 'MOVE_NODE', nodeId: 'heading-1', newParentId: 'missing', newIndex: 0 }, 'parent_not_found'],
    [{ ...metadata, type: 'MOVE_NODE', nodeId: 'page-root', newParentId: 'section-1', newIndex: 0 }, 'root_operation_forbidden'],
    [{ ...metadata, type: 'MOVE_NODE', nodeId: 'button-1', newParentId: 'page-root', newIndex: 1 }, 'invalid_parent_child'],
    [{ ...metadata, type: 'DUPLICATE_NODE', nodeId: 'section-1', newNodeId: 'copy', targetParentId: 'page-root', index: 1 }, 'invalid_command'],
    [{ ...metadata, type: 'UPDATE_STYLE', nodeId: 'missing', patch: { color: '#112233' } }, 'node_not_found'],
    [{ ...metadata, type: 'REPLACE_SUBTREE', nodeId: 'heading-1', nodes: [{ id: 'r', type: 'button', parentId: 'page-root', children: [], props: { text: 'R', href: '#r' }, style: {}, responsive: {} }], rootNodeId: 'r' }, 'invalid_parent_child'],
  ] as const)('returns stable errors for rejected operations', (command, code) => {
    const result = applyCommandTransaction(createValidDesignFixture(), 1, [command as DesignCommand])
    expect(result).toMatchObject({ accepted: false, error: { code } })
  })

  it('replaces a subtree atomically and returns a restorable inverse', () => {
    const command: DesignCommand = {
      ...metadata,
      type: 'REPLACE_SUBTREE',
      nodeId: 'container-1',
      rootNodeId: 'replacement-stack',
      nodes: [
        {
          id: 'replacement-stack', type: 'stack', parentId: 'section-1', children: ['replacement-heading'],
          props: {}, style: { gap: 24 }, responsive: {},
        },
        {
          id: 'replacement-heading', type: 'heading', parentId: 'replacement-stack', children: [],
          props: { text: 'Replacement', level: 2 }, style: {}, responsive: {},
        },
      ],
    }

    const replaced = applyCommandTransaction(createValidDesignFixture(), 1, [command])

    expect(replaced).toMatchObject({ accepted: true, version: 2 })
    if (!replaced.accepted) return
    expect(replaced.document.nodes['container-1']).toBeUndefined()
    expect(replaced.document.nodes['replacement-stack']?.children).toEqual(['replacement-heading'])
    expect(replaced.document.nodes['section-1']?.children).toEqual(['replacement-stack'])

    const restored = applyCommandTransaction(replaced.document, 2, replaced.inverseCommands)
    expect(restored).toMatchObject({ accepted: true, version: 3 })
    if (restored.accepted) {
      expect(restored.document.nodes['container-1']?.children).toEqual([
        'heading-1', 'paragraph-1', 'image-1', 'button-1',
      ])
      expect(restored.document.nodes['replacement-stack']).toBeUndefined()
    }
  })

  it('rolls back a replacement containing duplicate or orphan nodes', () => {
    const document = createValidDesignFixture()
    const command: DesignCommand = {
      ...metadata,
      type: 'REPLACE_SUBTREE',
      nodeId: 'heading-1',
      rootNodeId: 'paragraph-1',
      nodes: [{
        id: 'paragraph-1', type: 'paragraph', parentId: 'container-1', children: [],
        props: { text: 'Collision' }, style: {}, responsive: {},
      }],
    }

    const result = applyCommandTransaction(document, 1, [command])

    expect(result).toMatchObject({ accepted: false, error: { code: 'invalid_command' } })
    expect(document.nodes['heading-1']).toBeDefined()
  })

  it('restores a removed subtree and duplicates leaf nodes safely', () => {
    const removed = applyCommandTransaction(createValidDesignFixture(), 1, [{
      ...metadata, type: 'REMOVE_NODE', nodeId: 'container-1',
    }])
    expect(removed).toMatchObject({ accepted: true })
    if (!removed.accepted) return
    expect(removed.document.nodes['heading-1']).toBeUndefined()

    const restored = applyCommandTransaction(removed.document, 2, removed.inverseCommands)
    expect(restored).toMatchObject({ accepted: true })
    if (!restored.accepted) return
    expect(restored.document.nodes['container-1']?.children).toHaveLength(4)

    const duplicated = applyCommandTransaction(restored.document, 3, [{
      ...metadata,
      documentVersion: 3,
      type: 'DUPLICATE_NODE',
      nodeId: 'heading-1',
      newNodeId: 'heading-copy',
      targetParentId: 'container-1',
      index: 1,
    }])
    expect(duplicated).toMatchObject({ accepted: true })
  })

  it('rejects malformed replacement roots and out-of-bounds subtree restores', () => {
    const missingRoot: DesignCommand = {
      ...metadata,
      type: 'REPLACE_SUBTREE',
      nodeId: 'heading-1',
      rootNodeId: 'missing',
      nodes: [{
        id: 'replacement', type: 'heading', parentId: 'container-1', children: [],
        props: { text: 'Replacement', level: 2 }, style: {}, responsive: {},
      }],
    }
    expect(applyCommandTransaction(createValidDesignFixture(), 1, [missingRoot])).toMatchObject({
      accepted: false, error: { code: 'invalid_command' },
    })

    const restoreMissing: DesignCommand = {
      ...metadata,
      type: 'REPLACE_SUBTREE',
      nodeId: 'removed-node',
      rootNodeId: 'new-heading',
      index: 99,
      nodes: [{
        id: 'new-heading', type: 'heading', parentId: 'container-1', children: [],
        props: { text: 'New', level: 2 }, style: {}, responsive: {},
      }],
    }
    expect(applyCommandTransaction(createValidDesignFixture(), 1, [restoreMissing])).toMatchObject({
      accepted: false, error: { code: 'index_out_of_bounds' },
    })
  })

  it('undoes added props and styles without leaving merged keys behind', () => {
    const document = createValidDesignFixture()
    const command: DesignCommand = {
      ...metadata,
      type: 'UPDATE_STYLE',
      nodeId: 'paragraph-1',
      patch: { color: '#112233', backgroundColor: '#ffffff' },
    }

    const updated = applyCommandTransaction(document, 1, [command])
    expect(updated).toMatchObject({ accepted: true })
    if (!updated.accepted) return

    const undone = applyCommandTransaction(updated.document, 2, updated.inverseCommands)
    expect(undone).toMatchObject({ accepted: true })
    if (undone.accepted) expect(undone.document.nodes['paragraph-1']?.style).toEqual({})
  })

  it('rejects invalid insert variants without mutating the input', () => {
    const document = createValidDesignFixture()
    const duplicate: DesignCommand = {
      ...metadata,
      type: 'INSERT_NODE',
      parentId: 'container-1',
      index: 0,
      node: structuredClone(document.nodes['heading-1']!),
    }
    const invalidRelationship: DesignCommand = {
      ...metadata,
      type: 'INSERT_NODE',
      parentId: 'page-root',
      index: 0,
      node: {
        id: 'new-heading', type: 'heading', parentId: 'page-root', children: [],
        props: { text: 'New', level: 2 }, style: {}, responsive: {},
      },
    }
    const invalidIndex: DesignCommand = {
      ...metadata,
      type: 'INSERT_NODE',
      parentId: 'container-1',
      index: 99,
      node: {
        id: 'new-heading', type: 'heading', parentId: 'container-1', children: [],
        props: { text: 'New', level: 2 }, style: {}, responsive: {},
      },
    }

    expect(applyCommandTransaction(document, 1, [duplicate])).toMatchObject({
      accepted: false, error: { code: 'invalid_command' },
    })
    expect(applyCommandTransaction(document, 1, [invalidRelationship])).toMatchObject({
      accepted: false, error: { code: 'invalid_parent_child' },
    })
    expect(applyCommandTransaction(document, 1, [invalidIndex])).toMatchObject({
      accepted: false, error: { code: 'index_out_of_bounds' },
    })
    expect(document.nodes['new-heading']).toBeUndefined()
  })

  it('rejects invalid duplicate variants with stable errors', () => {
    const base: DesignCommand = {
      ...metadata,
      type: 'DUPLICATE_NODE',
      nodeId: 'heading-1',
      newNodeId: 'heading-copy',
      targetParentId: 'container-1',
      index: 0,
    }

    expect(applyCommandTransaction(createValidDesignFixture(), 1, [{ ...base, nodeId: 'missing' }])).toMatchObject({
      accepted: false, error: { code: 'node_not_found' },
    })
    expect(applyCommandTransaction(createValidDesignFixture(), 1, [{ ...base, targetParentId: 'missing' }])).toMatchObject({
      accepted: false, error: { code: 'parent_not_found' },
    })
    expect(applyCommandTransaction(createValidDesignFixture(), 1, [{ ...base, newNodeId: 'paragraph-1' }])).toMatchObject({
      accepted: false, error: { code: 'invalid_command' },
    })
    expect(applyCommandTransaction(createValidDesignFixture(), 1, [{ ...base, targetParentId: 'page-root' }])).toMatchObject({
      accepted: false, error: { code: 'invalid_parent_child' },
    })
    expect(applyCommandTransaction(createValidDesignFixture(), 1, [{ ...base, index: 99 }])).toMatchObject({
      accepted: false, error: { code: 'index_out_of_bounds' },
    })
  })

  it('rejects invalid responsive updates and replacement restore variants', () => {
    expect(applyCommandTransaction(createValidDesignFixture(), 1, [{
      ...metadata,
      type: 'UPDATE_RESPONSIVE_STYLE',
      nodeId: 'missing',
      breakpoint: 'mobile',
      patch: { gap: 12 },
    }])).toMatchObject({ accepted: false, error: { code: 'node_not_found' } })

    const restoreBase: DesignCommand = {
      ...metadata,
      type: 'REPLACE_SUBTREE',
      nodeId: 'removed',
      rootNodeId: 'restored-heading',
      index: 0,
      nodes: [{
        id: 'restored-heading', type: 'heading', parentId: 'container-1', children: [],
        props: { text: 'Restored', level: 2 }, style: {}, responsive: {},
      }],
    }
    expect(applyCommandTransaction(createValidDesignFixture(), 1, [{ ...restoreBase, index: undefined }])).toMatchObject({
      accepted: false, error: { code: 'node_not_found' },
    })
    expect(applyCommandTransaction(createValidDesignFixture(), 1, [{
      ...restoreBase,
      nodes: [{ ...restoreBase.nodes[0]!, parentId: 'missing' }],
    }])).toMatchObject({ accepted: false, error: { code: 'parent_not_found' } })
    expect(applyCommandTransaction(createValidDesignFixture(), 1, [{
      ...restoreBase,
      nodes: [{
        id: 'restored-heading', type: 'heading', parentId: 'page-root', children: [],
        props: { text: 'Restored', level: 2 }, style: {}, responsive: {},
      }],
    }])).toMatchObject({ accepted: false, error: { code: 'invalid_parent_child' } })
    expect(applyCommandTransaction(createValidDesignFixture(), 1, [{
      ...restoreBase,
      nodes: [restoreBase.nodes[0]!, restoreBase.nodes[0]!],
    }])).toMatchObject({ accepted: false, error: { code: 'invalid_command' } })
    expect(applyCommandTransaction(createValidDesignFixture(), 1, [{
      ...restoreBase,
      rootNodeId: 'heading-1',
      nodes: [structuredClone(createValidDesignFixture().nodes['heading-1']!)],
    }])).toMatchObject({ accepted: false, error: { code: 'invalid_command' } })
  })

  it('forbids replacing the root and maps final validation failures', () => {
    const rootReplacement: DesignCommand = {
      ...metadata,
      type: 'REPLACE_SUBTREE',
      nodeId: 'page-root',
      rootNodeId: 'replacement-page',
      nodes: [{
        id: 'replacement-page', type: 'page', parentId: null, children: [],
        props: {}, style: {}, responsive: {},
      }],
    }
    expect(applyCommandTransaction(createValidDesignFixture(), 1, [rootReplacement])).toMatchObject({
      accepted: false, error: { code: 'root_operation_forbidden' },
    })

    const invalidDocument: DesignCommand = {
      ...metadata,
      type: 'UPDATE_PROPS',
      nodeId: 'heading-1',
      patch: { level: 99 },
    }
    expect(applyCommandTransaction(createValidDesignFixture(), 1, [invalidDocument])).toMatchObject({
      accepted: false, error: { code: 'document_invalid' },
    })

    const cycle: DesignCommand = {
      ...metadata,
      type: 'INSERT_NODE',
      parentId: 'page-root',
      index: 1,
      node: {
        id: 'cycle-section', type: 'section', parentId: 'page-root', children: ['cycle-section'],
        props: {}, style: {}, responsive: {},
      },
    }
    expect(applyCommandTransaction(createValidDesignFixture(), 1, [cycle])).toMatchObject({
      accepted: false, error: { code: 'cycle_detected' },
    })
  })

  it('creates, updates, reorders and restores a page atomically', () => {
    const document = migrateDesignDocumentV1ToV2(createValidDesignFixture())
    const created = applyCommandTransaction(document, 1, [{
      ...metadata,
      type: 'CREATE_PAGE',
      index: 1,
      page: { id: 'about', name: 'About', slug: '/about', rootNodeId: 'about-root' },
      nodes: [{ id: 'about-root', type: 'page', parentId: null, children: [], props: {}, style: {}, responsive: {} }],
    }])
    expect(created).toMatchObject({ accepted: true, document: { pages: [{ id: 'home' }, { id: 'about' }] } })
    if (!created.accepted) return

    const updated = applyCommandTransaction(created.document, 2, [{
      ...metadata, documentVersion: 2, type: 'UPDATE_PAGE', pageId: 'about', patch: { name: 'Company', slug: '/company' },
    }, {
      ...metadata, commandId: 'nav', documentVersion: 2, type: 'UPDATE_NAVIGATION',
      items: [{ pageId: 'about', label: 'Company' }, { pageId: 'home', label: 'Home' }],
    }, {
      ...metadata, commandId: 'move', documentVersion: 2, type: 'MOVE_PAGE', pageId: 'about', newIndex: 0,
    }])
    expect(updated).toMatchObject({
      accepted: true,
      document: {
        pages: [{ id: 'about', name: 'Company', slug: '/company' }, { id: 'home' }],
        navigation: { items: [{ pageId: 'about', label: 'Company' }, { pageId: 'home', label: 'Home' }] },
      },
    })
    if (!updated.accepted) return

    const undone = applyCommandTransaction(updated.document, 3, updated.inverseCommands)
    expect(undone).toMatchObject({ accepted: true, document: { pages: [{ id: 'home' }, { id: 'about', name: 'About', slug: '/about' }] } })
  })

  it('deep-duplicates a page and removes it with inverse restoration', () => {
    const document = migrateDesignDocumentV1ToV2(createValidDesignFixture())
    const sourceNodes = Object.values(document.nodes)
    const idMap = new Map(sourceNodes.map(node => [node.id, `copy-${node.id}`]))
    const nodes = sourceNodes.map(node => ({
      ...structuredClone(node),
      id: idMap.get(node.id)!,
      parentId: node.parentId ? idMap.get(node.parentId)! : null,
      children: node.children.map(childId => idMap.get(childId)!),
    }))
    const duplicated = applyCommandTransaction(document, 1, [{
      ...metadata,
      type: 'DUPLICATE_PAGE',
      sourcePageId: 'home',
      index: 1,
      page: { id: 'about', name: 'About', slug: '/about', rootNodeId: 'copy-page-root' },
      nodes,
    }])
    expect(duplicated).toMatchObject({ accepted: true, document: { pages: [{ id: 'home' }, { id: 'about' }] } })
    if (!duplicated.accepted) return

    const removed = applyCommandTransaction(duplicated.document, 2, [{
      ...metadata, documentVersion: 2, type: 'REMOVE_PAGE', pageId: 'about',
    }])
    expect(removed).toMatchObject({ accepted: true, document: { pages: [{ id: 'home' }] } })
    if (!removed.accepted) return
    expect(removed.document.nodes['copy-page-root']).toBeUndefined()

    const restored = applyCommandTransaction(removed.document, 3, removed.inverseCommands)
    expect(restored).toMatchObject({ accepted: true, document: { pages: [{ id: 'home' }, { id: 'about' }] } })
  })

  it('protects Home and referenced pages from destructive commands', () => {
    const document = migrateDesignDocumentV1ToV2(createValidDesignFixture())
    expect(applyCommandTransaction(document, 1, [{
      ...metadata, type: 'UPDATE_PAGE', pageId: 'home', patch: { slug: '/renamed-home' },
    }])).toMatchObject({ accepted: false, error: { code: 'root_operation_forbidden' } })
    expect(applyCommandTransaction(document, 1, [{
      ...metadata, type: 'REMOVE_PAGE', pageId: 'home',
    }])).toMatchObject({ accepted: false, error: { code: 'root_operation_forbidden' } })
  })

  it('rejects malformed and empty command batches', () => {
    expect(applyCommandTransaction(createValidDesignFixture(), 1, [])).toMatchObject({ accepted: false, error: { code: 'invalid_command' } })
    expect(applyCommandTransaction(createValidDesignFixture(), 1, [{ type: 'UNKNOWN' } as never])).toMatchObject({ accepted: false, error: { code: 'invalid_command' } })
  })
})
