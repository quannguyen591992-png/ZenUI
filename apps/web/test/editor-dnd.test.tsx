import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EditorApp } from '../app/editor/editor-app'

import type * as DndKitCore from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import type { ReactNode } from 'react'

const dragEvents: DragEndEvent[] = [
  { active: { id: 'palette:heading', data: { current: { kind: 'palette', type: 'heading' } } }, over: null } as unknown as DragEndEvent,
  { active: { id: 'palette:heading', data: { current: { kind: 'palette', type: 'heading' } } }, over: { id: 'node:container-1' } } as unknown as DragEndEvent,
  { active: { id: 'move:heading-1', data: { current: { kind: 'move', nodeId: 'heading-1' } } }, over: { id: 'node:section-1' } } as unknown as DragEndEvent,
  { active: { id: 'move:heading-1', data: { current: { kind: 'move', nodeId: 'heading-1' } } }, over: { id: 'node:page-root' } } as unknown as DragEndEvent,
]

vi.mock('@dnd-kit/core', async importOriginal => {
  const original = await importOriginal<typeof DndKitCore>()
  return {
    ...original,
    DndContext: ({ children, onDragEnd }: { children: ReactNode; onDragEnd: (event: DragEndEvent) => void }) => (
      <>
        {children}
        {dragEvents.map((event, index) => (
          <button key={`${String(event.active.id)}-${index}`} type="button" onClick={() => onDragEnd(event)}>
            Simulate drag {index + 1}
          </button>
        ))}
      </>
    ),
    useDraggable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      isDragging: false,
    }),
    useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
    useSensor: vi.fn(),
    useSensors: vi.fn(() => []),
  }
})

describe('ZenUI editor drag outcomes', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('announces cancellation when a drag has no target', async () => {
    const user = userEvent.setup()
    render(<EditorApp />)

    await user.click(screen.getByRole('button', { name: 'Simulate drag 1' }))

    expect(screen.getByText('Đã hủy thao tác kéo')).toBeVisible()
  })

  it('inserts a palette node into the dropped container', async () => {
    const user = userEvent.setup()
    render(<EditorApp />)

    await user.click(screen.getByRole('button', { name: 'Simulate drag 2' }))

    expect(screen.getByRole('button', { name: 'Chọn Tiêu đề mới' })).toBeVisible()
    expect(screen.getByText('Đã thêm Tiêu đề')).toBeVisible()
  })

  it('moves an existing node to a valid container and rejects an invalid root target', async () => {
    const user = userEvent.setup()
    render(<EditorApp />)

    await user.click(screen.getByRole('button', { name: 'Simulate drag 3' }))
    expect(screen.getByText('Đã áp dụng thay đổi')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Simulate drag 4' }))
    expect(screen.getByText('Không thể đặt thành phần vào vị trí này.')).toBeVisible()
  })
})
