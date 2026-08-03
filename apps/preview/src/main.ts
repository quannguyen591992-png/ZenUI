import { createPreviewRuntime } from './runtime'

const editorOrigin = new URLSearchParams(location.search).get('editorOrigin')
const channelId = new URLSearchParams(location.search).get('channelId')
const nonce = document.documentElement.dataset.nonce

if (!editorOrigin || !channelId) throw new Error('preview_configuration_missing')

const remoteImageHostAllowlist = document.documentElement.dataset.remoteImageHostAllowlist
const assetOrigin = document.documentElement.dataset.assetOrigin
if (!remoteImageHostAllowlist) throw new Error('preview_image_policy_missing')
if (!assetOrigin) throw new Error('preview_asset_origin_missing')

createPreviewRuntime({
  editorOrigin: new URL(editorOrigin).origin,
  channelId,
  parentWindow: window.parent,
  document,
  remoteImageHostAllowlist,
  assetOrigin: new URL(assetOrigin).origin,
  ...(nonce ? { nonce } : {}),
})
