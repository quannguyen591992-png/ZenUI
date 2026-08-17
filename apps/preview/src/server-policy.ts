interface PreviewCspOptions {
  editorOrigin: string
  assetOrigin: string
  imageSources: readonly string[]
  nonce: string
}

export function createPreviewCsp(options: PreviewCspOptions): string {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    `frame-ancestors ${options.editorOrigin}`,
    "form-action 'none'",
    "script-src 'self'",
    `style-src 'nonce-${options.nonce}'`,
    `img-src ${[options.assetOrigin, ...options.imageSources].join(' ')}`,
    "connect-src 'none'",
    `font-src ${options.assetOrigin}`,
  ].join('; ')
}
