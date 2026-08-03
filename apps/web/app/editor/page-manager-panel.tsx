'use client'

import { useEffect, useState } from 'react'

import type { DesignDocument } from '@zenui/design-schema'

interface PageManagerPanelProps {
  document: DesignDocument
  activePageId: string
  canMutate: boolean
  onSelect: (pageId: string) => void
  onCreate: (input: { name: string; slug: string }) => void
  onRename: (pageId: string, input: { name: string; slug: string }) => void
  onMove: (pageId: string, direction: -1 | 1) => void
  onDuplicate: (pageId: string) => void
  onDelete: (pageId: string) => void
  onNavigation: (items: { pageId: string; label: string }[]) => void
}

export function PageManagerPanel({
  document,
  activePageId,
  canMutate,
  onSelect,
  onCreate,
  onRename,
  onMove,
  onDuplicate,
  onDelete,
  onNavigation,
}: PageManagerPanelProps) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const navigation = document.schemaVersion === 2 ? document.navigation.items : []
  const active = document.pages.find(page => page.id === activePageId) ?? document.pages[0]!
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [editingPageId, setEditingPageId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editSlug, setEditSlug] = useState('')

  useEffect(() => {
    setLabels(Object.fromEntries(navigation.map(item => [item.pageId, item.label])))
  }, [navigation])

  const moveNavigation = (pageId: string, direction: -1 | 1): void => {
    const index = navigation.findIndex(item => item.pageId === pageId)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= navigation.length) return
    const items = [...navigation]
    const [item] = items.splice(index, 1)
    items.splice(nextIndex, 0, item!)
    onNavigation(items)
  }

  return (
    <aside className="page-manager-panel" aria-label="Quản lý trang">
      <header>
        <h1>Trang</h1>
        <span>{document.pages.length}/20 trang</span>
      </header>
      <div className="page-manager-list">
        <ol aria-label="Danh sách trang">
          {document.pages.map((page, index) => (
            <li key={page.id}>
              <button
                type="button"
                aria-current={page.id === active.id ? 'page' : undefined}
                onClick={() => onSelect(page.id)}
              >
                {page.name} <small>{page.slug}</small>
              </button>
              <button type="button" aria-label={`Di chuyển ${page.name} lên`} disabled={!canMutate || index === 0} onClick={() => onMove(page.id, -1)}>↑</button>
              <button type="button" aria-label={`Di chuyển ${page.name} xuống`} disabled={!canMutate || index === document.pages.length - 1} onClick={() => onMove(page.id, 1)}>↓</button>
              <button type="button" aria-label={`Nhân bản ${page.name}`} disabled={!canMutate} onClick={() => onDuplicate(page.id)}>Nhân bản</button>
              <button type="button" aria-label={`Xóa ${page.name}`} disabled={!canMutate || page.slug === '/'} onClick={() => onDelete(page.id)}>Xóa</button>
            </li>
          ))}
        </ol>
      </div>
      {canMutate && (
        <form onSubmit={event => {
          event.preventDefault()
          if (!name.trim() || !slug.trim()) return
          onCreate({ name: name.trim(), slug: slug.trim() })
          setName('')
          setSlug('')
        }}>
          <label>Tên trang<input aria-label="Tên trang mới" value={name} maxLength={100} onChange={event => setName(event.target.value)} /></label>
          <label>Đường dẫn<input aria-label="Đường dẫn trang mới" value={slug} maxLength={80} onChange={event => setSlug(event.target.value)} /></label>
          <button type="submit">Thêm trang</button>
        </form>
      )}
      {canMutate && (
        <section aria-label="Chỉnh sửa trang đang chọn">
          <h2>Trang đang chọn</h2>
          {editingPageId === active.id ? (
            <form onSubmit={event => {
              event.preventDefault()
              const nextName = editName.trim()
              const nextSlug = active.slug === '/' ? '/' : editSlug.trim()
              if (!nextName || !nextSlug) return
              onRename(active.id, { name: nextName, slug: nextSlug })
              setEditingPageId(null)
            }}>
              <label>Tên trang<input aria-label="Tên trang đang chọn" value={editName} maxLength={100} onChange={event => setEditName(event.target.value)} /></label>
              <label>Đường dẫn<input aria-label="Đường dẫn trang đang chọn" value={editSlug} maxLength={80} disabled={active.slug === '/'} onChange={event => setEditSlug(event.target.value)} /></label>
              <button type="submit">Lưu trang</button>
              <button type="button" onClick={() => setEditingPageId(null)}>Hủy</button>
            </form>
          ) : (
            <button type="button" onClick={() => {
              setEditName(active.name)
              setEditSlug(active.slug)
              setEditingPageId(active.id)
            }}>Đổi tên và đường dẫn</button>
          )}
        </section>
      )}
      {document.schemaVersion === 2 && (
        <section aria-label="Điều hướng website">
          <h2>Điều hướng</h2>
          <ul>
            {document.pages.map(page => {
              const index = navigation.findIndex(candidate => candidate.pageId === page.id)
              const item = index < 0 ? undefined : navigation[index]
              return (
                <li key={page.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(item)}
                      disabled={!canMutate}
                      onChange={event => onNavigation(event.target.checked
                        ? [...navigation, { pageId: page.id, label: page.name }]
                        : navigation.filter(candidate => candidate.pageId !== page.id))}
                    />
                    {page.name}
                  </label>
                  {item && (
                    <>
                      <input
                        aria-label={`Nhãn điều hướng ${page.name}`}
                        value={labels[page.id] ?? item.label}
                        maxLength={100}
                        disabled={!canMutate}
                        onChange={event => setLabels(current => ({ ...current, [page.id]: event.target.value }))}
                      />
                      <button
                        type="button"
                        aria-label={`Lưu nhãn ${page.name}`}
                        disabled={!canMutate || !(labels[page.id] ?? '').trim()}
                        onClick={() => onNavigation(navigation.map(candidate => candidate.pageId === page.id
                          ? { ...candidate, label: labels[page.id]!.trim() }
                          : candidate))}
                      >Lưu</button>
                      <button type="button" aria-label={`Đưa ${page.name} lên trong điều hướng`} disabled={!canMutate || index === 0} onClick={() => moveNavigation(page.id, -1)}>↑</button>
                      <button type="button" aria-label={`Đưa ${page.name} xuống trong điều hướng`} disabled={!canMutate || index === navigation.length - 1} onClick={() => moveNavigation(page.id, 1)}>↓</button>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </aside>
  )
}
