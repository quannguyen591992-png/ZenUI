import { describe, expect, it } from 'vitest'

import {
  createLeadKeyring,
  renderLeadReceiptHtml,
} from '../src/server'

const key1 = Buffer.alloc(32, 1).toString('base64')
const key2 = Buffer.alloc(32, 2).toString('base64')
const context = {
  publication: 'share' as const,
  workspaceId: '22222222-2222-4222-8222-222222222222',
  projectId: '33333333-3333-4333-8333-333333333333',
  shareLinkId: '44444444-4444-4444-8444-444444444444',
  revisionId: '55555555-5555-4555-8555-555555555555',
  formNodeId: 'lead-form-1',
  leadId: '66666666-6666-4666-8666-666666666666',
}
const deploymentContext = {
  publication: 'deployment' as const,
  workspaceId: context.workspaceId,
  projectId: context.projectId,
  deploymentId: '77777777-7777-4777-8777-777777777777',
  revisionId: context.revisionId,
  formNodeId: context.formNodeId,
  leadId: context.leadId,
}
const payload = {
  formTitle: 'Yêu cầu tư vấn',
  fields: [
    { key: 'email', type: 'email' as const, label: 'Email', value: 'visitor@example.test' },
  ],
}

describe('lead encryption keyring', () => {
  it('encrypts with random 96-bit IVs and decrypts exact-version envelopes', () => {
    const keyring = createLeadKeyring({ activeKeyVersion: 2, keys: { 1: key1, 2: key2 } })
    const first = keyring.encrypt(payload, context)
    const second = keyring.encrypt(payload, context)

    expect(first.keyVersion).toBe(2)
    expect(Buffer.from(first.iv, 'base64')).toHaveLength(12)
    expect(Buffer.from(first.authTag, 'base64')).toHaveLength(16)
    expect(first.iv).not.toBe(second.iv)
    expect(keyring.decrypt(first, context)).toEqual(payload)

    const previous = createLeadKeyring({ activeKeyVersion: 1, keys: { 1: key1 } }).encrypt(payload, context)
    expect(keyring.decrypt(previous, context)).toEqual(payload)
  })

  it('domain-separates deployment payloads while retaining the exact Share context', () => {
    const keyring = createLeadKeyring({ activeKeyVersion: 2, keys: { 1: key1, 2: key2 } })
    const shareEnvelope = keyring.encrypt(payload, context)
    const deploymentEnvelope = keyring.encrypt(payload, deploymentContext)

    expect(keyring.decrypt(shareEnvelope, context)).toEqual(payload)
    expect(keyring.decrypt(deploymentEnvelope, deploymentContext)).toEqual(payload)
    expect(() => keyring.decrypt(deploymentEnvelope, {
      ...deploymentContext,
      deploymentId: '88888888-8888-4888-8888-888888888888',
    })).toThrow('lead_decryption_failed')
    expect(() => keyring.decrypt(deploymentEnvelope, context)).toThrow('lead_decryption_failed')
    expect(() => keyring.decrypt(shareEnvelope, deploymentContext)).toThrow('lead_decryption_failed')
  })

  it('fails closed when ciphertext, AAD context, or key version changes', () => {
    const keyring = createLeadKeyring({ activeKeyVersion: 2, keys: { 1: key1, 2: key2 } })
    const envelope = keyring.encrypt(payload, context)

    expect(() => keyring.decrypt({ ...envelope, ciphertext: Buffer.from('tampered').toString('base64') }, context)).toThrow('lead_decryption_failed')
    expect(() => keyring.decrypt(envelope, { ...context, projectId: '77777777-7777-4777-8777-777777777777' })).toThrow('lead_decryption_failed')
    expect(() => keyring.decrypt({ ...envelope, keyVersion: 3 }, context)).toThrow('lead_decryption_failed')
  })

  it('rejects malformed keyring configuration', () => {
    expect(() => createLeadKeyring({ activeKeyVersion: 1, keys: {} })).toThrow('lead_active_key_missing')
    expect(() => createLeadKeyring({ activeKeyVersion: 0, keys: { 1: key1 } })).toThrow('lead_key_version_invalid')
    expect(() => createLeadKeyring({ activeKeyVersion: 1, keys: { 1: 'not-base64' } })).toThrow('lead_encryption_key_invalid')
  })
})

describe('lead receipt', () => {
  it('renders fixed safe copy without echoing submitted PII', () => {
    const html = renderLeadReceiptHtml({ successCopy: 'Cảm ơn <b>bạn</b>.', returnPath: '/s/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })
    expect(html).toContain('Cảm ơn &lt;b&gt;bạn&lt;/b&gt;.')
    expect(html).toContain('href="/s/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"')
    expect(html).not.toContain('visitor@example.test')
    expect(html).toContain("form-action 'none'")
    expect(html).toContain("script-src 'none'")
    expect(html).toContain('noindex, nofollow, noarchive')
  })

  it('rejects unsafe return paths', () => {
    expect(() => renderLeadReceiptHtml({ successCopy: 'Cảm ơn.', returnPath: '//evil.example' })).toThrow('lead_receipt_return_path_invalid')
  })
})
