import { z } from 'zod'

import type { DesignDocument } from '@zenui/design-schema'

export const HOSTED_FONT_FAMILIES = [
  'Manrope', 'Be Vietnam Pro', 'Inter', 'Noto Sans', 'Noto Serif',
] as const
export const FONT_SUBSETS = ['latin', 'vietnamese'] as const

export type HostedFontFamily = (typeof HOSTED_FONT_FAMILIES)[number]
export type FontSubset = (typeof FONT_SUBSETS)[number]

interface FontCatalogEntry {
  id: string
  fallback: 'sans-serif' | 'serif'
  license: 'OFL-1.1'
  source: string
  subsets: Record<FontSubset, { bytes: number; checksum: string }>
}

export const fontCatalog = {
  Manrope: {
    id: 'manrope', fallback: 'sans-serif', license: 'OFL-1.1',
    source: '@fontsource/manrope@5.3.0',
    subsets: {
      latin: { bytes: 14108, checksum: '849290ef12a2eeb9af5c11924120d11aa4ae8b435ed3347d7fc8bc240c293ca3' },
      vietnamese: { bytes: 4464, checksum: 'dcb0ae6367203b04f930051188cbe02e8096c42db99d5ab6b77f16287fb4fa1b' },
    },
  },
  'Be Vietnam Pro': {
    id: 'be-vietnam-pro', fallback: 'sans-serif', license: 'OFL-1.1',
    source: '@fontsource/be-vietnam-pro@5.3.0',
    subsets: {
      latin: { bytes: 21168, checksum: '03d1b589cff172e1a670b3573e731d3380bc326f80cf83b0d3504e3188e2e074' },
      vietnamese: { bytes: 11532, checksum: 'dc085e2fba3414e5c5bf1e6172f921a9f81c5859946a4ed3d63c1e470d96a9e2' },
    },
  },
  Inter: {
    id: 'inter', fallback: 'sans-serif', license: 'OFL-1.1',
    source: '@fontsource/inter@5.3.0',
    subsets: {
      latin: { bytes: 23664, checksum: '8909904ab6c872eb994093482a88a28eca2cd95912d7b6fecd72103b0dc07edc' },
      vietnamese: { bytes: 4972, checksum: '547ad9fdaeb0ae43487f4b8a02e47c36553c0c0cb73c8aa98f93b7b615f6b55d' },
    },
  },
  'Noto Sans': {
    id: 'noto-sans', fallback: 'sans-serif', license: 'OFL-1.1',
    source: '@fontsource/noto-sans@5.3.0',
    subsets: {
      latin: { bytes: 13120, checksum: '09aee8065d25508f23a4c3d92cd777ac869c52d93fd868a88f025d888a7937d6' },
      vietnamese: { bytes: 5316, checksum: '0f0c8a4858f1f5b2701331cf0a471ee00824ed92d33ecb21c9248ded975e297f' },
    },
  },
  'Noto Serif': {
    id: 'noto-serif', fallback: 'serif', license: 'OFL-1.1',
    source: '@fontsource/noto-serif@5.3.0',
    subsets: {
      latin: { bytes: 14400, checksum: '4c0cbe3eec50d260754d681c17ee2af49a43d7fd93ce42877f665fcb1a889b87' },
      vietnamese: { bytes: 5240, checksum: '207dac0723db2e3832fb864c23a416dd953df68b27289acaec79ed94cd37b7ee' },
    },
  },
} as const satisfies Record<HostedFontFamily, FontCatalogEntry>

const fontIds = HOSTED_FONT_FAMILIES.map(family => fontCatalog[family].id) as [
  (typeof fontCatalog)[HostedFontFamily]['id'],
  ...(typeof fontCatalog)[HostedFontFamily]['id'][],
]

export const fontRequestSchema = z.object({
  fontId: z.enum(fontIds),
  subset: z.enum(FONT_SUBSETS),
}).strict()

export type FontId = z.infer<typeof fontRequestSchema>['fontId']

const familyById = Object.fromEntries(
  HOSTED_FONT_FAMILIES.map(family => [fontCatalog[family].id, family]),
) as Record<FontId, HostedFontFamily>

export function hostedFamilyFromId(fontId: FontId): HostedFontFamily {
  return familyById[fontId]
}

export function collectHostedFontFamilies(
  theme: DesignDocument['theme'],
): HostedFontFamily[] {
  const hosted = new Set<HostedFontFamily>()
  for (const family of [theme.fonts.heading, theme.fonts.body]) {
    if ((HOSTED_FONT_FAMILIES as readonly string[]).includes(family)) {
      hosted.add(family as HostedFontFamily)
    }
  }
  return [...hosted]
}

export interface FontSubsetPaths {
  latin: string
  vietnamese: string
}

export type FontPathResolver = (
  fontId: FontId,
  family: HostedFontFamily,
) => FontSubsetPaths

const unicodeRanges = {
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  vietnamese: 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
} as const

export function fontFaceCss(
  theme: DesignDocument['theme'],
  resolvePaths: FontPathResolver,
): string {
  return collectHostedFontFamilies(theme).flatMap(family => {
    const entry = fontCatalog[family]
    const paths = resolvePaths(entry.id, family)
    return FONT_SUBSETS.map(subset => (
      `@font-face{font-family:'${family}';font-style:normal;font-weight:400;font-display:swap;src:url('${paths[subset]}') format('woff2');unicode-range:${unicodeRanges[subset]}}`
    ))
  }).join('')
}

export function themeFontFamily(
  family: DesignDocument['theme']['fonts']['heading'],
): string {
  if ((HOSTED_FONT_FAMILIES as readonly string[]).includes(family)) {
    const hosted = family as HostedFontFamily
    return `'${hosted}',${fontCatalog[hosted].fallback}`
  }
  return family === 'Georgia' ? 'Georgia,serif' : `${family},sans-serif`
}
