'use client'

import { useCallback, useEffect, useState } from 'react'

import type { AssetAttribution, AssetPublic } from '@zenui/asset-core'

export interface AssetSearchResult {
  resultId: string
  width: number
  height: number
  previewUrl: string
  alt: string
  attribution: AssetAttribution
}

export interface AssetLibraryApi {
  list: () => Promise<AssetPublic[]>
  upload: (file: File, defaultAlt: string) => Promise<AssetPublic>
  search: (query: string) => Promise<AssetSearchResult[]>
  importResult: (input: { requestId: string; resultId: string; defaultAlt: string }) => Promise<AssetPublic>
  createDerivative: (assetId: string, input: {
    requestId: string
    transform: { x: number; y: number; width: number; height: number; outputWidth: number; outputHeight: number }
  }) => Promise<AssetPublic>
  poll: (assetId: string) => Promise<AssetPublic>
}

interface AssetLibraryPanelProps {
  projectId: string
  workspaceId: string
  assetOrigin: string
  canManageAssets: boolean
  canApply: boolean
  targetLabel?: 'image' | 'hero-image' | null
  api: AssetLibraryApi
  onApply: (input: { assetId: string; alt: string; decorative: boolean }) => void
}

const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))
const ASSET_POLL_ATTEMPTS = 60
const ASSET_POLL_INTERVAL_MS = 500

async function waitUntilSettled(api: AssetLibraryApi, assetId: string): Promise<AssetPublic> {
  for (let attempt = 0; attempt < ASSET_POLL_ATTEMPTS; attempt += 1) {
    const record = await api.poll(assetId)
    if (record.status === 'ready' || record.status === 'failed') return record
    await sleep(ASSET_POLL_INTERVAL_MS)
  }
  throw new Error('asset_poll_timeout')
}

export function createBrowserAssetLibraryApi(projectId: string, workspaceId: string): AssetLibraryApi {
  const data = async <T,>(responseInput: Promise<Response>): Promise<T> => {
    const response = await responseInput
    const body = await response.json() as { data?: T }
    if (!response.ok || body.data === undefined) throw new Error('asset_request_failed')
    return body.data
  }
  return {
    list: () => data(fetch(`/api/v1/projects/${projectId}/assets?workspaceId=${encodeURIComponent(workspaceId)}`)),
    upload(file, defaultAlt) {
      const query = new URLSearchParams({
        workspaceId, requestId: crypto.randomUUID(), scope: 'project', filename: file.name, defaultAlt,
      })
      return data(fetch(`/api/v1/projects/${projectId}/assets/uploads?${query}`, {
        method: 'POST', headers: { 'content-type': file.type, 'content-length': String(file.size), origin: window.location.origin }, body: file,
      }))
    },
    search(query) {
      const params = new URLSearchParams({ workspaceId, query, limit: '12' })
      return data(fetch(`/api/v1/projects/${projectId}/assets/search?${params}`))
    },
    importResult(input) {
      return data(fetch(`/api/v1/projects/${projectId}/assets/imports`, {
        method: 'POST', headers: { 'content-type': 'application/json', origin: window.location.origin },
        body: JSON.stringify({ workspaceId, ...input }),
      }))
    },
    createDerivative(assetId, input) {
      return data(fetch(`/api/v1/projects/${projectId}/assets/${assetId}/derivatives`, {
        method: 'POST', headers: { 'content-type': 'application/json', origin: window.location.origin },
        body: JSON.stringify({ workspaceId, ...input }),
      }))
    },
    poll(assetId) {
      return data(fetch(`/api/v1/projects/${projectId}/assets/${assetId}?workspaceId=${encodeURIComponent(workspaceId)}`))
    },
  }
}

export function AssetLibraryPanel({ assetOrigin, canManageAssets, canApply, targetLabel = null, api, onApply }: AssetLibraryPanelProps) {
  const [assets, setAssets] = useState<AssetPublic[]>([])
  const [selected, setSelected] = useState<AssetPublic | null>(null)
  const [alt, setAlt] = useState('')
  const [decorative, setDecorative] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AssetSearchResult[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const records = await api.list()
      setAssets(records.filter(record => !record.archived))
    } catch {
      setError('Không thể tải thư viện ảnh.')
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  const select = (asset: AssetPublic) => {
    setSelected(asset)
    setAlt(asset.defaultAlt)
    setDecorative(false)
    setError('')
  }
  const settle = async (record: AssetPublic) => {
    const result = record.status === 'ready' || record.status === 'failed' ? record : await waitUntilSettled(api, record.id)
    if (result.status !== 'ready') throw new Error('asset_processing_failed')
    setAssets(current => [result, ...current.filter(item => item.id !== result.id)])
    select(result)
  }
  const crop = (preset: 'square' | 'landscape') => {
    if (!selected || selected.status !== 'ready') return
    const transform = preset === 'square'
      ? { x: 0, y: 0, width: 1, height: 1, outputWidth: 800, outputHeight: 800 }
      : { x: 0, y: 0, width: 1, height: 1, outputWidth: 1200, outputHeight: 675 }
    setBusy(true)
    setError('')
    void api.createDerivative(selected.id, { requestId: crypto.randomUUID(), transform })
      .then(settle)
      .catch(() => setError('Không thể cắt ảnh. Ảnh gốc vẫn được giữ nguyên.'))
      .finally(() => setBusy(false))
  }

  return (
    <section className="asset-library-panel" aria-labelledby="asset-library-heading">
      <h2 id="asset-library-heading">Thư viện ảnh</h2>
      {error && <p role="alert">{error}</p>}
      {error === 'Không thể tải thư viện ảnh.' && <button type="button" onClick={() => void load()}>Thử lại</button>}
      {canManageAssets && (
        <>
          <label>
            Tải ảnh của bạn
            <input aria-label="Tải ảnh của bạn" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => {
              const file = event.target.files?.[0]
              if (!file) return
              setBusy(true)
              setError('')
              void api.upload(file, file.name.replace(/\.[^.]+$/, ''))
                .then(settle)
                .catch(() => setError('Không thể xử lý ảnh. Hãy thử lại.'))
                .finally(() => setBusy(false))
            }} />
          </label>
          <p className="asset-library-format">JPEG, PNG hoặc WebP. Với ảnh Hero, nên dùng ảnh ngang 16:9 từ 1200×675.</p>
          <div>
            <label>Tìm ảnh<input aria-label="Tìm ảnh" value={query} onChange={event => setQuery(event.target.value)} /></label>
            <button type="button" disabled={busy || query.trim().length < 2} onClick={() => {
              setBusy(true)
              setError('')
              void api.search(query).then(setResults).catch(() => setError('Không thể tìm ảnh.')).finally(() => setBusy(false))
            }}>Tìm</button>
          </div>
        </>
      )}
      {canManageAssets && (
        <p className="asset-library-hint" data-target={targetLabel ?? 'none'} tabIndex={-1}>
          {targetLabel === 'hero-image'
            ? 'Đang thêm ảnh Hero'
            : targetLabel === 'image'
              ? 'Đang thay ảnh'
              : 'Chọn vùng Thêm ảnh hoặc Thay ảnh trên website trước.'}
        </p>
      )}
      {busy && <p role="status">Đang xử lý ảnh...</p>}
      {results.length > 0 && (
        <ul aria-label="Kết quả tìm ảnh">
          {results.map(result => <li key={result.resultId}>
            <img src={result.previewUrl} alt="" referrerPolicy="no-referrer" />
            <span>{result.alt}</span>
            <small>Ảnh của {result.attribution.creatorName}</small>
            <button type="button" disabled={!canManageAssets || busy} onClick={() => {
              setBusy(true)
              setError('')
              void api.importResult({ requestId: crypto.randomUUID(), resultId: result.resultId, defaultAlt: result.alt })
                .then(settle)
                .then(() => setResults([]))
                .catch(() => setError('Không thể nhập ảnh. Hãy thử lại.'))
                .finally(() => setBusy(false))
            }}>Nhập ảnh {result.alt}</button>
          </li>)}
        </ul>
      )}
      {assets.length === 0 && !error ? <p>Chưa có ảnh nào.</p> : (
        <ul aria-label="Ảnh của dự án">
          {assets.map(asset => <li key={asset.id}>
            <button type="button" aria-pressed={selected?.id === asset.id} onClick={() => select(asset)}>
              {asset.status === 'ready' && <img src={`${new URL(assetOrigin).origin}/a/${asset.id}`} alt={asset.defaultAlt} referrerPolicy="no-referrer" />}
              {asset.defaultAlt || 'Ảnh trang trí'}
            </button>
          </li>)}
        </ul>
      )}
      {selected && (
        <div>
          {canApply && (
            <>
              <label>Mô tả ảnh<input aria-label="Mô tả ảnh" value={alt} disabled={decorative} onChange={event => setAlt(event.target.value)} /></label>
              <label><input type="checkbox" aria-label="Ảnh chỉ để trang trí" checked={decorative} onChange={event => {
                setDecorative(event.target.checked)
                if (event.target.checked) setAlt('')
              }} />Ảnh chỉ để trang trí</label>
            </>
          )}
          {canManageAssets && (
            <fieldset disabled={busy}>
              <legend>Cắt ảnh không phá hủy</legend>
              <button type="button" onClick={() => crop('square')}>Cắt ảnh vuông</button>
              <button type="button" onClick={() => crop('landscape')}>Cắt ảnh ngang</button>
            </fieldset>
          )}
          {canApply && <button type="button" onClick={() => {
            if (!decorative && !alt.trim()) {
              setError('Hãy nhập mô tả ảnh hoặc đánh dấu ảnh trang trí.')
              return
            }
            onApply({ assetId: selected.id, alt: decorative ? '' : alt.trim(), decorative })
          }}>Dùng ảnh đã chọn</button>}
        </div>
      )}
    </section>
  )
}
