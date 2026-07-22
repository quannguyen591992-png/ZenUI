import { describe, expect, it } from 'vitest'

import { ApiError, errorResponse, parseJsonBody, successResponse } from '../lib/server/api'

describe('API v1 envelopes', () => {
  it('creates stable success and safe error responses', async () => {
    const success = successResponse({ id: 'project-1' }, { status: 201 })
    expect(success.status).toBe(201)
    await expect(success.json()).resolves.toEqual({ data: { id: 'project-1' } })

    const error = errorResponse(new ApiError('stale_document_version', 'Document conflict', 409, [
      { path: 'expectedVersion', code: 'stale_document_version', message: 'Expected version 2' },
    ]))
    expect(error.status).toBe(409)
    await expect(error.json()).resolves.toEqual({
      error: {
        code: 'stale_document_version',
        message: 'Document conflict',
        details: [{ path: 'expectedVersion', code: 'stale_document_version', message: 'Expected version 2' }],
      },
    })
  })

  it('maps unexpected errors to a generic response without stack or SQL details', async () => {
    const response = errorResponse(new Error('SELECT secret FROM provider_tokens'))
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: { code: 'internal_error', message: 'An unexpected error occurred' },
    })
  })

  it('distinguishes malformed JSON from schema validation', async () => {
    const request = new Request('http://localhost/api/v1/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    })
    await expect(parseJsonBody(request)).rejects.toMatchObject({ code: 'invalid_json', status: 400 })
  })
})
