import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import {
  fontCatalog,
  hostedFamilyFromId,
  type FontId,
  type FontSubset,
} from '@zenui/font-library'

export const MAX_FONT_SUBSET_BYTES = 128 * 1024

const fontSubsetLoaders:
  Record<FontId, Record<FontSubset, () => Promise<Uint8Array>>> = {
    'be-vietnam-pro': {
      latin: () => readFile(
        new URL('../assets/be-vietnam-pro/latin.woff2', import.meta.url),
      ),
      vietnamese: () => readFile(
        new URL('../assets/be-vietnam-pro/vietnamese.woff2', import.meta.url),
      ),
    },
    inter: {
      latin: () => readFile(
        new URL('../assets/inter/latin.woff2', import.meta.url),
      ),
      vietnamese: () => readFile(
        new URL('../assets/inter/vietnamese.woff2', import.meta.url),
      ),
    },
    manrope: {
      latin: () => readFile(
        new URL('../assets/manrope/latin.woff2', import.meta.url),
      ),
      vietnamese: () => readFile(
        new URL('../assets/manrope/vietnamese.woff2', import.meta.url),
      ),
    },
    'noto-sans': {
      latin: () => readFile(
        new URL('../assets/noto-sans/latin.woff2', import.meta.url),
      ),
      vietnamese: () => readFile(
        new URL('../assets/noto-sans/vietnamese.woff2', import.meta.url),
      ),
    },
    'noto-serif': {
      latin: () => readFile(
        new URL('../assets/noto-serif/latin.woff2', import.meta.url),
      ),
      vietnamese: () => readFile(
        new URL('../assets/noto-serif/vietnamese.woff2', import.meta.url),
      ),
    },
  }

export interface LoadedFontSubset {
  bytes: Uint8Array
  checksum: string
}

export async function loadFontSubset(
  fontId: FontId,
  subset: FontSubset,
): Promise<LoadedFontSubset> {
  const family = hostedFamilyFromId(fontId)
  const metadata = fontCatalog[family].subsets[subset]
  const bytes = new Uint8Array(await fontSubsetLoaders[fontId][subset]())
  const checksum = createHash('sha256').update(bytes).digest('hex')
  if (
    bytes.byteLength > MAX_FONT_SUBSET_BYTES
    || bytes.byteLength !== metadata.bytes
    || checksum !== metadata.checksum
  ) {
    throw new Error('font_integrity_failed')
  }
  return { bytes, checksum }
}
