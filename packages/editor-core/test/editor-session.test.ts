import { createValidDesignFixture, validateDesignDocument } from '@zenui/design-schema'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  createAutosaveState,
  createEditorState,
  executeCommands,
  loadDraft,
  planInsert,
  planMove,
  queueAutosave,
  redo,
  resolveAutosave,
  saveDraft,
  startAutosave,
  selectNode,
  undo,
  type DraftStorage,
} from '../src/index'

describe('autosave coordinator', () => {
  it('queues edits that arrive while a save is in flight', () => {
    let state = createAutosaveState(1)
    state = queueAutosave(state, [{
      commandId: 'first', documentVersion: 1, source: 'user', type: 'UPDATE_STYLE',
      nodeId: 'heading-1', patch: { color: '#112233' },
    }])
    const started = startAutosave(state)
    expect(started).toMatchObject({
      state: { status: 'saving', serverVersion: 1 },
      request: { expectedVersion: 1 },
    })
    if (!started.request) throw new Error('Expected save request')

    const queued = queueAutosave(started.state, [{
      commandId: 'second', documentVersion: 1, source: 'user', type: 'UPDATE_PROPS',
      nodeId: 'heading-1', patch: { text: 'Queued' },
    }])
    const saved = resolveAutosave(queued, { requestId: started.request.requestId, accepted: true, version: 2 })
    expect(saved).toMatchObject({ status: 'dirty', serverVersion: 2 })
    expect(saved.pending).toHaveLength(1)
  })

  it('preserves pending work on conflict and ignores stale responses', () => {
    const dirty = queueAutosave(createAutosaveState(4), [{
      commandId: 'edit', documentVersion: 4, source: 'user', type: 'UPDATE_STYLE',
      nodeId: 'heading-1', patch: { color: '#112233' },
    }])
    const started = startAutosave(dirty)
    if (!started.request) throw new Error('Expected save request')

    expect(resolveAutosave(started.state, {
      requestId: 'older-request', accepted: true, version: 5,
    })).toEqual(started.state)
    expect(resolveAutosave(started.state, {
      requestId: started.request.requestId, accepted: false, code: 'stale_document_version', currentVersion: 8,
    })).toMatchObject({ status: 'conflict', serverVersion: 8, recoveryRequired: true })
  })

  it('classifies offline and terminal errors without silent retries', () => {
    const dirty = queueAutosave(createAutosaveState(1), [{
      commandId: 'edit', documentVersion: 1, source: 'user', type: 'UPDATE_STYLE',
      nodeId: 'heading-1', patch: { color: '#112233' },
    }])
    const started = startAutosave(dirty)
    if (!started.request) throw new Error('Expected save request')

    expect(resolveAutosave(started.state, {
      requestId: started.request.requestId, accepted: false, code: 'offline',
    })).toMatchObject({ status: 'offline', recoveryRequired: true })
    expect(resolveAutosave(started.state, {
      requestId: started.request.requestId, accepted: false, code: 'unauthorized',
    })).toMatchObject({ status: 'error', recoveryRequired: true })
  })
})

describe('editor session', () => {
  it('executes commands and provides exact undo/redo with a cleared redo branch', () => {
    let state = createEditorState(createValidDesignFixture())
    state = executeCommands(state, [{
      commandId: 'edit-1', documentVersion: 1, source: 'user', type: 'UPDATE_STYLE',
      nodeId: 'paragraph-1', patch: { color: '#112233' },
    }])

    expect(state.document.nodes['paragraph-1']?.style.color).toBe('#112233')
    expect(state.undoStack).toHaveLength(1)

    state = undo(state)
    expect(state.document.nodes['paragraph-1']?.style).toEqual({})
    expect(state.redoStack).toHaveLength(1)

    state = redo(state)
    expect(state.document.nodes['paragraph-1']?.style.color).toBe('#112233')

    state = undo(state)
    state = executeCommands(state, [{
      commandId: 'edit-2', documentVersion: state.document.version, source: 'user', type: 'UPDATE_PROPS',
      nodeId: 'paragraph-1', patch: { text: 'New branch' },
    }])
    expect(state.redoStack).toHaveLength(0)
  })

  it('selects only existing nodes', () => {
    const state = createEditorState(createValidDesignFixture())
    expect(selectNode(state, 'heading-1').selectedNodeId).toBe('heading-1')
    expect(selectNode(state, 'missing').selectedNodeId).toBeNull()
  })

  it('plans registry-backed insert and rejects invalid targets', () => {
    const document = createValidDesignFixture()
    const valid = planInsert(document, 'heading', 'container-1', 1, () => 'heading-new')
    const invalid = planInsert(document, 'button', 'page-root', 0, () => 'button-new')

    expect(valid).toMatchObject({ accepted: true, command: { type: 'INSERT_NODE', node: { id: 'heading-new' } } })
    expect(invalid).toMatchObject({ accepted: false, code: 'invalid_parent_child' })
  })

  it('plans safe moves and reports invalid nodes, parents, indexes and descendants', () => {
    const document = createValidDesignFixture()
    expect(planMove(document, 'heading-1', 'section-1', 1)).toMatchObject({ accepted: true })
    expect(planMove(document, 'section-1', 'container-1', 0)).toMatchObject({ accepted: false, code: 'cycle_detected' })
    expect(planMove(document, 'missing', 'container-1', 0)).toMatchObject({ accepted: false, code: 'node_not_found' })
    expect(planMove(document, 'heading-1', 'missing', 0)).toMatchObject({ accepted: false, code: 'parent_not_found' })
    expect(planMove(document, 'page-root', 'section-1', 0)).toMatchObject({ accepted: false, code: 'root_operation_forbidden' })
    expect(planMove(document, 'button-1', 'page-root', 0)).toMatchObject({ accepted: false, code: 'invalid_parent_child' })
    expect(planMove(document, 'heading-1', 'container-1', 99)).toMatchObject({ accepted: false, code: 'index_out_of_bounds' })
  })

  it('reports duplicate IDs and invalid insert indexes', () => {
    const document = createValidDesignFixture()
    expect(planInsert(document, 'heading', 'container-1', 99, () => 'new')).toMatchObject({ accepted: false, code: 'index_out_of_bounds' })
    expect(planInsert(document, 'heading', 'container-1', 0, () => 'heading-1')).toMatchObject({ accepted: false, code: 'invalid_command' })
  })

  it('persists a versioned validated draft and recovers from invalid payloads', () => {
    let value: string | null = null
    const storage: DraftStorage = {
      getItem: () => value,
      setItem: (_key, next) => { value = next },
      removeItem: () => { value = null },
    }
    const document = createValidDesignFixture()

    expect(saveDraft(storage, document)).toEqual({ success: true })
    expect(loadDraft(storage)).toEqual({ success: true, document })

    value = '{bad json'
    expect(loadDraft(storage)).toMatchObject({ success: false, code: 'invalid_json' })

    value = JSON.stringify({ storageVersion: 2, document })
    expect(loadDraft(storage)).toMatchObject({ success: false, code: 'unsupported_version' })

    const unsafe = createValidDesignFixture()
    unsafe.nodes['image-1']!.props = { src: 'javascript:alert(1)', alt: 'Unsafe' }
    value = JSON.stringify({ storageVersion: 1, document: unsafe })
    expect(loadDraft(storage)).toMatchObject({ success: false, code: 'invalid_document' })
  })

  it('handles unavailable storage and missing drafts', () => {
    const missing: DraftStorage = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    }
    expect(loadDraft(missing)).toEqual({ success: true, document: null })

    const failing: DraftStorage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('quota') },
      removeItem: () => undefined,
    }
    expect(loadDraft(failing)).toEqual({ success: false, code: 'storage_failed' })
    expect(saveDraft(failing, createValidDesignFixture())).toEqual({ success: false, code: 'storage_failed' })
  })

  it('keeps generated edit and history transitions structurally valid', () => {
    fc.assert(fc.property(
      fc.array(fc.record({
        fontSize: fc.integer({ min: 10, max: 160 }),
        historyAction: fc.constantFrom('execute', 'undo', 'redo'),
      }), { minLength: 1, maxLength: 80 }),
      operations => {
        let state = createEditorState(createValidDesignFixture())
        operations.forEach((operation, index) => {
          if (operation.historyAction === 'undo') state = undo(state)
          else if (operation.historyAction === 'redo') state = redo(state)
          else {
            state = executeCommands(state, [{
              commandId: `property-${index}`,
              documentVersion: state.document.version,
              source: 'user',
              type: 'UPDATE_STYLE',
              nodeId: 'heading-1',
              patch: { fontSize: operation.fontSize },
            }])
          }
          expect(validateDesignDocument(state.document).success).toBe(true)
          expect(new Set(Object.keys(state.document.nodes)).size).toBe(Object.keys(state.document.nodes).length)
        })
      },
    ), { numRuns: 100 })
  })
})
