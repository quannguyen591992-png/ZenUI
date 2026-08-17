import { loadFontSubset } from '@zenui/font-library/server'

import { validateAssetOrigin } from './public-asset-api'

import type { PublicFontDependencies } from './public-font-api'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

export function createPublicFontRouteDependencies(): PublicFontDependencies {
  return {
    assetOrigin: validateAssetOrigin(
      required('ASSET_ORIGIN'),
      required('APP_ORIGIN'),
    ),
    load: loadFontSubset,
  }
}
