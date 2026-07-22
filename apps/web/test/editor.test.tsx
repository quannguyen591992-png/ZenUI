import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createValidDesignFixture } from '@zenui/design-schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EditorApp } from '../app/editor/editor-app'

import type { EditorApi } from '../app/editor/editor-app'

const projectId = '55555555-5555-4555-8555-555555555555'
const workspaceId = '22222222-2222-4222-8222-222222222222'

function serverEditor(api: EditorApi) {
  const document = createValidDesignFixture()
  document.projectId = projectId
  return <EditorApp projectId={projectId} workspaceId={workspaceId} initialDocument={document} initialVersion={1} api={api} />
}

function api(overrides: Partial<EditorApi> = {}): EditorApi {
  return {
    saveCommands: (_projectId, _workspaceId, expectedVersion) => Promise.resolve({ accepted: true, version: expectedVersion + 1 }),
    loadDocument: () => Promise.resolve({ version: 1, document: { ...createValidDesignFixture(), projectId } }),
    listRevisions: () => Promise.resolve([]),
    createRevision: (_projectId, _workspaceId, summary) => Promise.resolve({ id: 'revision-1', summary, source: 'manual', createdAt: new Date().toISOString() }),
    restoreRevision: () => Promise.resolve({ accepted: true, version: 2, document: { ...createValidDesignFixture(), projectId, version: 2 } }),
    ...overrides,
  }
}

describe('ZenUI editor', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('renders the registry palette and selects a canvas node', async () => {
    const user = userEvent.setup()
    render(<EditorApp />)

    expect(screen.getByRole('heading', { name: 'Components' })).toBeVisible()
    expect(screen.getAllByRole('button', { name: /add heading/i })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: /select build your next product/i }))
    expect(screen.getByLabelText('Text')).toHaveValue('Build your next product')
  })

  it('adds a heading, edits text and color, then undoes and redoes', async () => {
    const user = userEvent.setup()
    render(<EditorApp />)

    await user.click(screen.getByRole('button', { name: /select section/i }))
    await user.click(screen.getByRole('button', { name: /add heading/i }))
    const text = screen.getByLabelText('Text')
    await user.clear(text)
    await user.type(text, 'Phase 1 heading')
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#112233' } })

    expect(screen.getByText('Phase 1 heading')).toHaveStyle({ color: '#112233' })
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByText('Phase 1 heading')).not.toHaveStyle({ color: '#112233' })
    await user.click(screen.getByRole('button', { name: 'Redo' }))
    expect(screen.getByText('Phase 1 heading')).toHaveStyle({ color: '#112233' })
  })

  it('rejects an invalid add with an accessible explanation', async () => {
    const user = userEvent.setup()
    render(<EditorApp />)

    await user.click(screen.getByRole('button', { name: /select page/i }))
    await user.click(screen.getByRole('button', { name: /add button/i }))

    expect(screen.getByText('button is not allowed inside page')).toBeVisible()
  })

  it('persists accepted edits and restores them after remount', async () => {
    const user = userEvent.setup()
    const rendered = render(<EditorApp />)
    await user.click(screen.getByRole('button', { name: /select build your next product/i }))
    const text = screen.getByLabelText('Text')
    await user.clear(text)
    await user.type(text, 'Saved heading')
    rendered.unmount()

    render(<EditorApp />)
    expect(screen.getByText('Saved heading')).toBeVisible()
  })

  it('keeps the accessible Layers tree synchronized with Canvas selection and reorder', async () => {
    const user = userEvent.setup()
    render(<EditorApp />)

    const tree = screen.getByRole('tree', { name: 'Layers' })
    expect(tree).toBeVisible()
    expect(screen.getByRole('treeitem', { name: 'Heading: Build your next product' })).toHaveAttribute('aria-selected', 'false')

    await user.click(screen.getByRole('button', { name: /select build your next product/i }))
    expect(screen.getByRole('treeitem', { name: 'Heading: Build your next product' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Text')).toBeVisible()

    await user.click(screen.getByRole('treeitem', { name: 'Paragraph: Launch a structured landing page.' }))
    expect(screen.getByRole('button', { name: /select launch a structured landing page/i })).toHaveAttribute('data-selected', 'true')

    await user.click(screen.getByRole('button', { name: 'Move Launch a structured landing page. up' }))
    expect(screen.getByText('Change applied')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled()
    const items = screen.getAllByRole('treeitem')
    expect(items.findIndex(item => item.getAttribute('aria-label')?.startsWith('Paragraph'))).toBeLessThan(
      items.findIndex(item => item.getAttribute('aria-label')?.startsWith('Heading')),
    )
  })

  it('supports keyboard selection and layer navigation', async () => {
    const user = userEvent.setup()
    render(<EditorApp />)

    const heading = screen.getByRole('treeitem', { name: 'Heading: Build your next product' })
    heading.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByLabelText('Text')).toBeVisible()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('treeitem', { name: 'Paragraph: Launch a structured landing page.' })).toHaveFocus()
  })

  it('keeps selection and drag controls as separate interactive elements', () => {
    const { container } = render(<EditorApp />)

    expect(container.querySelector(
      'button button, button [role="button"], [role="button"] button, [role="button"] [role="button"]',
    )).toBeNull()
  })

  it('edits allowlisted layout and responsive styles per viewport', async () => {
    const user = userEvent.setup()
    render(<EditorApp />)

    await user.click(screen.getByRole('button', { name: /select build your next product/i }))
    await user.selectOptions(screen.getByLabelText('Viewport'), 'mobile')
    await user.clear(screen.getByLabelText('Font size'))
    await user.type(screen.getByLabelText('Font size'), '24')
    await user.tab()

    expect(screen.getByText('Build your next product')).toHaveStyle({ fontSize: '24px' })
    await user.selectOptions(screen.getByLabelText('Viewport'), 'desktop')
    expect(screen.getByText('Build your next product')).not.toHaveStyle({ fontSize: '24px' })

    await user.click(screen.getByRole('button', { name: /select container/i }))
    await user.clear(screen.getByLabelText('Gap'))
    await user.type(screen.getByLabelText('Gap'), '32')
    await user.tab()
    expect(screen.getByText('Change applied')).toBeVisible()
  })

  it('rejects invalid Inspector input without changing document history', async () => {
    const user = userEvent.setup()
    render(<EditorApp />)

    await user.click(screen.getByRole('button', { name: /select build your next product/i }))
    await user.clear(screen.getByLabelText('Font size'))
    await user.type(screen.getByLabelText('Font size'), '999')
    await user.tab()

    expect(screen.getByText('Font size must be between 10 and 160')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })

  it('supports global undo shortcuts outside form controls', async () => {
    const user = userEvent.setup()
    render(<EditorApp />)

    await user.click(screen.getByRole('button', { name: /select build your next product/i }))
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#112233' } })
    expect(screen.getByText('Build your next product')).toHaveStyle({ color: '#112233' })

    screen.getByRole('heading', { name: 'Components' }).focus()
    await user.keyboard('{Control>}z{/Control}')
    expect(screen.getByText('Build your next product')).not.toHaveStyle({ color: '#112233' })
  })

  it('requires an explicit reset before replacing a corrupt local draft', async () => {
    localStorage.setItem('zenui:draft:project-1', '{not-json')
    const user = userEvent.setup()
    render(<EditorApp />)

    expect(screen.getByText('Draft recovery required: invalid_json')).toBeVisible()
    expect(localStorage.getItem('zenui:draft:project-1')).toBe('{not-json')

    await user.click(screen.getByRole('button', { name: 'Reset local draft' }))

    expect(screen.getByText('Local draft reset')).toBeVisible()
    expect(localStorage.getItem('zenui:draft:project-1')).not.toBe('{not-json')
  })

  it('autosaves accepted commands sequentially and exposes saved state', async () => {
    const saveCommands = vi.fn<EditorApi['saveCommands']>((_projectId, _workspaceId, expectedVersion) => (
      Promise.resolve({ accepted: true, version: expectedVersion + 1 })
    ))
    const user = userEvent.setup()
    render(serverEditor(api({ saveCommands })))

    await user.click(screen.getByRole('button', { name: /select build your next product/i }))
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#112233' } })

    expect(await screen.findByText('Saved')).toBeVisible()
    expect(saveCommands).toHaveBeenCalledTimes(1)
    expect(saveCommands.mock.calls[0]?.[2]).toBe(1)
    expect(saveCommands.mock.calls[0]?.[3]).toHaveLength(1)
  })

  it('preserves recovery state for offline autosave failures', async () => {
    render(serverEditor(api({
      saveCommands: () => Promise.resolve({ accepted: false, code: 'offline' }),
    })))

    await userEvent.setup().click(screen.getByRole('treeitem', { name: 'Heading: Build your next product' }))
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#112233' } })

    expect(await screen.findByText('Offline: local recovery is preserved')).toBeVisible()
    expect(localStorage.getItem(`zenui:recovery:${projectId}`)).not.toBeNull()
  })

  it('keeps local work on conflict and can reload the canonical server document', async () => {
    const serverDocument = { ...createValidDesignFixture(), projectId, version: 2 }
    serverDocument.nodes['heading-1']!.props = { text: 'Server heading', level: 1 }
    const user = userEvent.setup()
    render(serverEditor(api({
      saveCommands: () => Promise.resolve({ accepted: false, code: 'stale_document_version', currentVersion: 2 }),
      loadDocument: () => Promise.resolve({ version: 2, document: serverDocument }),
    })))

    await user.click(screen.getByRole('button', { name: /select build your next product/i }))
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Unsynced local heading' } })

    expect(await screen.findByText('Conflict: local work is preserved')).toBeVisible()
    expect(screen.getByText('Unsynced local heading')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Download recovery copy' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Reload server version' }))
    expect(await screen.findByText('Server heading')).toBeVisible()
    expect(screen.queryByText('Unsynced local heading')).toBeNull()
  })

  it('creates and restores revisions from the current saved version', async () => {
    const createRevision = vi.fn<EditorApi['createRevision']>((_projectId, _workspaceId, summary) => (
      Promise.resolve({ id: 'revision-2', summary, source: 'manual', createdAt: new Date().toISOString() })
    ))
    const restoredDocument = { ...createValidDesignFixture(), projectId, version: 3 }
    restoredDocument.nodes['heading-1']!.props = { text: 'Restored heading', level: 1 }
    const restoreRevision = vi.fn<EditorApi['restoreRevision']>(() => Promise.resolve({
      accepted: true, version: 3, document: restoredDocument,
    }))
    const user = userEvent.setup()
    render(serverEditor(api({
      listRevisions: () => Promise.resolve([{ id: 'revision-1', summary: 'Initial', source: 'manual', createdAt: new Date().toISOString() }]),
      createRevision,
      restoreRevision,
    })))

    expect(await screen.findByText('Initial')).toBeVisible()
    await user.type(screen.getByLabelText('Revision summary'), 'Before redesign')
    await user.click(screen.getByRole('button', { name: 'Create revision' }))
    expect(await screen.findByText('Before redesign')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Restore Initial' }))
    expect(await screen.findByText('Restored heading')).toBeVisible()
    await waitFor(() => expect(restoreRevision).toHaveBeenCalledWith(projectId, workspaceId, 'revision-1', 1))
  })

  it('exports the current validated document', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const createObjectURL = vi.fn(() => 'blob:zenui')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    const user = userEvent.setup()
    render(<EditorApp />)

    await user.click(screen.getByRole('button', { name: 'Export HTML' }))

    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:zenui')
  })
})
