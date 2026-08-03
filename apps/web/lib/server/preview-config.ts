export function validatePreviewOrigin(previewOrigin: string, editorOrigin: string): string {
  let preview: URL
  let editor: URL
  try {
    preview = new URL(previewOrigin)
    editor = new URL(editorOrigin)
  } catch {
    throw new Error('PREVIEW_ORIGIN is invalid')
  }
  if (!['http:', 'https:'].includes(preview.protocol)) throw new Error('PREVIEW_ORIGIN is invalid')
  if (preview.origin === editor.origin || preview.hostname === editor.hostname) {
    throw new Error('PREVIEW_ORIGIN must be isolated from APP_ORIGIN')
  }
  return preview.origin
}
