'use client'

import { brandKitValuesSchema, type BrandKit } from '@zenui/asset-core'
import { FONT_ALLOWLIST, type DesignDocument } from '@zenui/design-schema'
import { useCallback, useEffect, useState } from 'react'

export interface BrandKitApi {
  load: () => Promise<BrandKit | null>
  save: (input: Omit<BrandKit, 'version'> & { expectedVersion: number }) => Promise<BrandKit>
  apply: (input: { expectedBrandKitVersion: number; expectedDocumentVersion: number }) => Promise<{ version: number; document: DesignDocument }>
}

interface BrandKitPanelProps {
  projectId: string
  workspaceId: string
  expectedDocumentVersion: number
  canManage: boolean
  api: BrandKitApi
  onApplied: (input: { version: number; document: DesignDocument }) => void
}

const defaults: Omit<BrandKit, 'version'> = {
  name: 'Thương hiệu của tôi',
  logoAssetId: null,
  colors: { primary: '#2563eb', background: '#ffffff', text: '#0f172a' },
  fonts: { heading: 'Manrope', body: 'Arial' },
}

export function createBrowserBrandKitApi(projectId: string, workspaceId: string): BrandKitApi {
  const data = async <T,>(responseInput: Promise<Response>): Promise<T> => {
    const response = await responseInput
    const body = await response.json() as { data?: T }
    if (!response.ok || body.data === undefined) throw new Error('brand_request_failed')
    return body.data
  }
  return {
    load: () => data(fetch(`/api/v1/workspaces/${workspaceId}/brand-kit?workspaceId=${encodeURIComponent(workspaceId)}`)),
    save(input) {
      return data(fetch(`/api/v1/workspaces/${workspaceId}/brand-kit`, {
        method: 'PUT', headers: { 'content-type': 'application/json', origin: window.location.origin }, body: JSON.stringify(input),
      }))
    },
    apply(input) {
      return data(fetch(`/api/v1/projects/${projectId}/brand-kit/apply`, {
        method: 'POST', headers: { 'content-type': 'application/json', origin: window.location.origin }, body: JSON.stringify({ workspaceId, ...input }),
      }))
    },
  }
}

export function BrandKitPanel({ expectedDocumentVersion, canManage, api, onApplied }: BrandKitPanelProps) {
  const [version, setVersion] = useState(0)
  const [values, setValues] = useState(defaults)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const kit = await api.load()
      if (kit) {
        const { version: loadedVersion, ...loadedValues } = kit
        setVersion(loadedVersion)
        setValues(loadedValues)
      }
    } catch {
      setError('Không thể tải Brand Kit.')
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  const updateColor = (key: keyof BrandKit['colors'], value: string) => {
    setValues(current => ({ ...current, colors: { ...current.colors, [key]: value } }))
  }

  return (
    <section className="brand-kit-panel" aria-labelledby="brand-kit-heading">
      <h2 id="brand-kit-heading">Brand Kit</h2>
      {error && <p role="alert">{error}</p>}
      <label>Tên thương hiệu<input aria-label="Tên thương hiệu" disabled={!canManage} value={values.name} onChange={event => setValues(current => ({ ...current, name: event.target.value }))} /></label>
      <label>Màu chính thương hiệu<input aria-label="Màu chính thương hiệu" disabled={!canManage} value={values.colors.primary} onChange={event => updateColor('primary', event.target.value)} /></label>
      <label>Màu nền thương hiệu<input aria-label="Màu nền thương hiệu" disabled={!canManage} value={values.colors.background} onChange={event => updateColor('background', event.target.value)} /></label>
      <label>Màu chữ thương hiệu<input aria-label="Màu chữ thương hiệu" disabled={!canManage} value={values.colors.text} onChange={event => updateColor('text', event.target.value)} /></label>
      <label>Font tiêu đề<select aria-label="Font tiêu đề" disabled={!canManage} value={values.fonts.heading} onChange={event => setValues(current => ({ ...current, fonts: { ...current.fonts, heading: event.target.value as BrandKit['fonts']['heading'] } }))}>{FONT_ALLOWLIST.map(font => <option key={font}>{font}</option>)}</select></label>
      <label>Font nội dung<select aria-label="Font nội dung" disabled={!canManage} value={values.fonts.body} onChange={event => setValues(current => ({ ...current, fonts: { ...current.fonts, body: event.target.value as BrandKit['fonts']['body'] } }))}>{FONT_ALLOWLIST.map(font => <option key={font}>{font}</option>)}</select></label>
      <article
        data-testid="brand-preview"
        style={{ background: values.colors.background, color: values.colors.text, fontFamily: values.fonts.body }}
      >
        <h3 style={{ fontFamily: values.fonts.heading }}>{values.name}</h3>
        <button type="button" style={{ background: values.colors.primary }}>Hành động chính</button>
      </article>
      {canManage && (
        <>
          <button type="button" disabled={busy} onClick={() => {
            const parsed = brandKitValuesSchema.safeParse(values)
            if (!parsed.success) {
              setError(parsed.error.issues.some(issue => issue.message.includes('contrast'))
                ? 'Độ tương phản chưa đạt yêu cầu. Hãy chọn màu dễ đọc hơn.'
                : 'Brand Kit chưa hợp lệ.')
              return
            }
            setBusy(true)
            setError('')
            void api.save({ expectedVersion: version, ...parsed.data })
              .then(saved => {
                const { version: savedVersion, ...savedValues } = saved
                setVersion(savedVersion)
                setValues(savedValues)
              })
              .catch(() => setError('Không thể lưu Brand Kit. Hãy thử lại.'))
              .finally(() => setBusy(false))
          }}>Lưu Brand Kit</button>
          <button type="button" disabled={busy || version === 0} onClick={() => {
            setBusy(true)
            setError('')
            void api.apply({ expectedBrandKitVersion: version, expectedDocumentVersion })
              .then(onApplied)
              .catch(() => setError('Không thể áp dụng Brand Kit. Website chưa bị thay đổi.'))
              .finally(() => setBusy(false))
          }}>Áp dụng cho website</button>
        </>
      )}
    </section>
  )
}
