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
  onClose?: () => void
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
  onClose,
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
    <aside className="page-manager-pro" aria-label="Quản lý trang">
      <header className="pm-header">
        <h1>Quản lý Trang</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="pm-badge">{document.pages.length}/20</span>
          {onClose && (
            <button type="button" aria-label="Đóng bảng quản lý trang" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#64748b' }}>×</button>
          )}
        </div>
      </header>

      <div className="pm-layout">
        <div className="pm-card pm-list-card">
          <h2>Danh sách trang</h2>
          <ol aria-label="Danh sách trang" className="pm-list">
            {document.pages.map((page, index) => (
              <li key={page.id} className="pm-list-item">
                <button
                  className={`pm-page-btn ${page.id === active.id ? 'active' : ''}`}
                  type="button"
                  aria-current={page.id === active.id ? 'page' : undefined}
                  onClick={() => onSelect(page.id)}
                >
                  <span className="pm-page-name">{page.name}</span>
                  <small className="pm-page-slug">{page.slug}</small>
                </button>
                <div className="pm-item-actions">
                  <button type="button" aria-label={`Di chuyển ${page.name} lên`} disabled={!canMutate || index === 0} onClick={() => onMove(page.id, -1)}>↑</button>
                  <button type="button" aria-label={`Di chuyển ${page.name} xuống`} disabled={!canMutate || index === document.pages.length - 1} onClick={() => onMove(page.id, 1)}>↓</button>
                  <button type="button" aria-label={`Nhân bản ${page.name}`} disabled={!canMutate} onClick={() => onDuplicate(page.id)}>Nhân bản</button>
                  <button type="button" className="danger" aria-label={`Xóa ${page.name}`} disabled={!canMutate || page.slug === '/'} onClick={() => onDelete(page.id)}>Xóa</button>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="pm-side-cards">
          {canMutate && (
            <div className="pm-card">
              <h2>Thêm trang mới</h2>
              <form className="pm-form" onSubmit={event => {
                event.preventDefault()
                if (!name.trim() || !slug.trim()) return
                onCreate({ name: name.trim(), slug: slug.trim() })
                setName('')
                setSlug('')
              }}>
                <label>Tên trang<input aria-label="Tên trang mới" placeholder="Ví dụ: Giới thiệu" value={name} maxLength={100} onChange={event => setName(event.target.value)} /></label>
                <label>Đường dẫn<input aria-label="Đường dẫn trang mới" placeholder="Ví dụ: /gioi-thieu" value={slug} maxLength={80} onChange={event => setSlug(event.target.value)} /></label>
                <button type="submit" className="pm-submit-btn">Thêm trang</button>
              </form>
            </div>
          )}

          {canMutate && (
            <div className="pm-card">
              <h2>Đang chọn: {active.name}</h2>
              {editingPageId === active.id ? (
                <form className="pm-form" onSubmit={event => {
                  event.preventDefault()
                  const nextName = editName.trim()
                  const nextSlug = active.slug === '/' ? '/' : editSlug.trim()
                  if (!nextName || !nextSlug) return
                  onRename(active.id, { name: nextName, slug: nextSlug })
                  setEditingPageId(null)
                }}>
                  <label>Đổi tên<input aria-label="Tên trang đang chọn" value={editName} maxLength={100} onChange={event => setEditName(event.target.value)} /></label>
                  <label>Đường dẫn<input aria-label="Đường dẫn trang đang chọn" value={editSlug} maxLength={80} disabled={active.slug === '/'} onChange={event => setEditSlug(event.target.value)} /></label>
                  <div className="pm-form-actions">
                    <button type="submit" className="pm-submit-btn">Lưu</button>
                    <button type="button" className="pm-cancel-btn" onClick={() => setEditingPageId(null)}>Hủy</button>
                  </div>
                </form>
              ) : (
                <button type="button" className="pm-outline-btn" onClick={() => {
                  setEditName(active.name)
                  setEditSlug(active.slug)
                  setEditingPageId(active.id)
                }}>Đổi tên và đường dẫn</button>
              )}
            </div>
          )}

          {document.schemaVersion === 2 && (
            <div className="pm-card">
              <h2>Điều hướng Website</h2>
              <ul className="pm-nav-list">
                {document.pages.map(page => {
                  const index = navigation.findIndex(candidate => candidate.pageId === page.id)
                  const item = index < 0 ? undefined : navigation[index]
                  return (
                    <li key={page.id} className="pm-nav-item">
                      <label className="pm-checkbox">
                        <input
                          type="checkbox"
                          checked={Boolean(item)}
                          disabled={!canMutate}
                          onChange={event => onNavigation(event.target.checked
                            ? [...navigation, { pageId: page.id, label: page.name }]
                            : navigation.filter(candidate => candidate.pageId !== page.id))}
                        />
                        <span>{page.name}</span>
                      </label>
                      {item && (
                        <div className="pm-nav-actions">
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
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
