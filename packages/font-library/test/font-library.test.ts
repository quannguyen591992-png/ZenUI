import { describe, expect, it } from 'vitest'

import {
  collectHostedFontFamilies,
  fontCatalog,
  fontFaceCss,
  fontRequestSchema,
  hostedFamilyFromId,
  HOSTED_FONT_FAMILIES,
  themeFontFamily,
} from '../src/index.js'
import { loadFontSubset } from '../src/server.js'

import type { DesignDocument } from '@zenui/design-schema'

const theme = (heading: string, body: string) => ({
  colors: { primary: '#2563eb', background: '#ffffff', text: '#0f172a' },
  fonts: { heading, body },
  radius: { sm: 6, md: 12, lg: 20 },
}) as unknown as DesignDocument['theme']

describe('server-owned Vietnamese font library', () => {
  it('exposes only the bounded hosted family catalog', () => {
    expect(HOSTED_FONT_FAMILIES).toEqual([
      'Manrope', 'Be Vietnam Pro', 'Inter', 'Noto Sans', 'Noto Serif',
    ])
    expect(fontRequestSchema.safeParse({ fontId: 'be-vietnam-pro', subset: 'vietnamese' }).success).toBe(true)
    expect(fontRequestSchema.safeParse({ fontId: '../private', subset: 'vietnamese' }).success).toBe(false)
    expect(fontRequestSchema.safeParse({ fontId: 'be-vietnam-pro', subset: 'all.css' }).success).toBe(false)
  })

  it('collects at most the two allowlisted hosted families used by a document', () => {
    expect(collectHostedFontFamilies(theme('Noto Serif', 'Be Vietnam Pro'))).toEqual([
      'Noto Serif', 'Be Vietnam Pro',
    ])
    expect(collectHostedFontFamilies(theme('Noto Serif', 'Noto Serif'))).toEqual(['Noto Serif'])
    expect(collectHostedFontFamilies(theme('Georgia', 'system-ui'))).toEqual([])
    expect(hostedFamilyFromId('noto-serif')).toBe('Noto Serif')
  })

  it('maps hosted and system families to deterministic fallback stacks', () => {
    expect(themeFontFamily('Noto Serif')).toBe("'Noto Serif',serif")
    expect(themeFontFamily('Be Vietnam Pro')).toBe("'Be Vietnam Pro',sans-serif")
    expect(themeFontFamily('Georgia')).toBe('Georgia,serif')
    expect(themeFontFamily('Arial')).toBe('Arial,sans-serif')
    expect(themeFontFamily('system-ui')).toBe('system-ui,sans-serif')
  })

  it('emits deterministic latin and Vietnamese faces without remote authority', () => {
    const css = fontFaceCss(theme('Noto Serif', 'Be Vietnam Pro'), family => ({
      latin: `https://assets.example.com/f/${family}/latin.woff2`,
      vietnamese: `https://assets.example.com/f/${family}/vietnamese.woff2`,
    }))

    expect(css).toContain("font-family:'Noto Serif'")
    expect(css).toContain('/f/noto-serif/vietnamese.woff2')
    expect(css).toContain('/f/be-vietnam-pro/latin.woff2')
    expect(css).toContain('unicode-range:U+0102-0103')
    expect(css).not.toMatch(/fonts\.google|@import|javascript:/i)
  })

  it('loads only integrity-checked bounded WOFF2 assets with OFL provenance', async () => {
    for (const family of HOSTED_FONT_FAMILIES) {
      const entry = fontCatalog[family]
      expect(entry.license).toBe('OFL-1.1')
      expect(entry.source).toMatch(/^@fontsource\//)
      for (const subset of ['latin', 'vietnamese'] as const) {
        const loaded = await loadFontSubset(entry.id, subset)
        expect(loaded.bytes.byteLength).toBe(entry.subsets[subset].bytes)
        expect(loaded.checksum).toBe(entry.subsets[subset].checksum)
        expect(Array.from(loaded.bytes.slice(0, 4))).toEqual([0x77, 0x4f, 0x46, 0x32])
      }
    }
  })
})
