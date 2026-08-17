import { describe, expect, it } from 'vitest'

import { createPreviewCsp } from '../src/server-policy.js'

describe('preview server CSP', () => {
  it('allows fonts only from the exact asset origin without weakening scripts or connections', () => {
    const csp = createPreviewCsp({
      editorOrigin: 'http://localhost:3000',
      assetOrigin: 'https://assets.example.com',
      imageSources: ['https://images.example.com'],
      nonce: 'test-nonce',
    })

    expect(csp).toContain('font-src https://assets.example.com')
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("connect-src 'none'")
    expect(csp).not.toContain('font-src *')
  })
})
