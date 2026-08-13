import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto'

import {
  leadPayloadSchema,
  type LeadPayload,
} from './index'

export interface EncryptedLeadPayload {
  ciphertext: string
  iv: string
  authTag: string
  keyVersion: number
}

export interface LeadEncryptionContext {
  workspaceId: string
  projectId: string
  shareLinkId: string
  revisionId: string
  formNodeId: string
  leadId: string
}

function leadAad(
  context: LeadEncryptionContext,
  keyVersion: number,
): Buffer {
  return Buffer.from([
    'zenui-lead-payload-v1',
    context.workspaceId,
    context.projectId,
    context.shareLinkId,
    context.revisionId,
    context.formNodeId,
    context.leadId,
    String(keyVersion),
  ].join('\0'), 'utf8')
}

function decodeEncryptionKey(keyInput: string): Buffer {
  if (
    !/^[A-Za-z0-9+/]{43}=$/.test(keyInput)
    && !/^[A-Za-z0-9_-]{43}$/.test(keyInput)
  ) {
    throw new Error('lead_encryption_key_invalid')
  }
  const key = Buffer.from(keyInput, 'base64')
  if (key.byteLength !== 32) {
    throw new Error('lead_encryption_key_invalid')
  }
  return key
}

function createLeadCipher(config: {
  key: string
  keyVersion: number
}) {
  if (
    !Number.isInteger(config.keyVersion)
    || config.keyVersion < 1
  ) {
    throw new Error('lead_key_version_invalid')
  }
  const key = decodeEncryptionKey(config.key)

  return {
    encrypt(
      payloadInput: LeadPayload,
      context: LeadEncryptionContext,
    ): EncryptedLeadPayload {
      const payload = leadPayloadSchema.parse(payloadInput)
      const iv = randomBytes(12)
      const cipher = createCipheriv(
        'aes-256-gcm',
        key,
        iv,
      )
      cipher.setAAD(leadAad(context, config.keyVersion))
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(payload), 'utf8'),
        cipher.final(),
      ])
      return {
        ciphertext: ciphertext.toString('base64'),
        iv: iv.toString('base64'),
        authTag: cipher.getAuthTag().toString('base64'),
        keyVersion: config.keyVersion,
      }
    },

    decrypt(
      envelope: EncryptedLeadPayload,
      context: LeadEncryptionContext,
    ): LeadPayload {
      try {
        if (envelope.keyVersion !== config.keyVersion) {
          throw new Error('version')
        }
        const iv = Buffer.from(envelope.iv, 'base64')
        const authTag = Buffer.from(
          envelope.authTag,
          'base64',
        )
        if (iv.byteLength !== 12 || authTag.byteLength !== 16) {
          throw new Error('envelope')
        }
        const decipher = createDecipheriv(
          'aes-256-gcm',
          key,
          iv,
        )
        decipher.setAAD(
          leadAad(context, envelope.keyVersion),
        )
        decipher.setAuthTag(authTag)
        const plaintext = Buffer.concat([
          decipher.update(
            Buffer.from(envelope.ciphertext, 'base64'),
          ),
          decipher.final(),
        ]).toString('utf8')
        return leadPayloadSchema.parse(JSON.parse(plaintext))
      } catch {
        throw new Error('lead_decryption_failed')
      }
    },
  }
}

export function createLeadKeyring(config: {
  activeKeyVersion: number
  keys: Record<number, string>
}) {
  if (
    !Number.isInteger(config.activeKeyVersion)
    || config.activeKeyVersion < 1
  ) {
    throw new Error('lead_key_version_invalid')
  }

  const ciphers = new Map<
    number,
    ReturnType<typeof createLeadCipher>
  >()
  for (const [versionInput, key] of Object.entries(config.keys)) {
    const version = Number(versionInput)
    if (!Number.isInteger(version) || version < 1) {
      throw new Error('lead_key_version_invalid')
    }
    ciphers.set(version, createLeadCipher({
      key,
      keyVersion: version,
    }))
  }

  const active = ciphers.get(config.activeKeyVersion)
  if (!active) throw new Error('lead_active_key_missing')

  return {
    activeKeyVersion: config.activeKeyVersion,
    encrypt(
      payload: LeadPayload,
      context: LeadEncryptionContext,
    ): EncryptedLeadPayload {
      return active.encrypt(payload, context)
    },
    decrypt(
      envelope: EncryptedLeadPayload,
      context: LeadEncryptionContext,
    ): LeadPayload {
      const cipher = ciphers.get(envelope.keyVersion)
      if (!cipher) throw new Error('lead_decryption_failed')
      return cipher.decrypt(envelope, context)
    },
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!)
}

const SAFE_RETURN_PATH = /^\/s\/[A-Za-z0-9_-]{32}(?:\/[A-Za-z0-9_-]+)*$/

export function renderLeadReceiptHtml(input: {
  successCopy: string
  returnPath: string
}): string {
  if (!SAFE_RETURN_PATH.test(input.returnPath)) {
    throw new Error('lead_receipt_return_path_invalid')
  }
  const successCopy = escapeHtml(input.successCopy)
  const returnPath = escapeHtml(input.returnPath)
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow, noarchive"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; script-src 'none'; style-src 'none'; img-src 'none'; font-src 'none'; connect-src 'none'"><title>Đã nhận thông tin</title></head><body><main><h1>Đã nhận thông tin</h1><p>${successCopy}</p><a href="${returnPath}">Quay lại website</a></main></body></html>`
}
