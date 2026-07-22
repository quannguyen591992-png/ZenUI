import { NextResponse } from 'next/server'

export interface ApiErrorDetail {
  path: string
  code: string
  message: string
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: readonly ApiErrorDetail[],
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function successResponse<T>(data: T, init?: ResponseInit): NextResponse<{ data: T }> {
  return NextResponse.json({ data }, init)
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    }, { status: error.status })
  }

  return NextResponse.json({
    error: { code: 'internal_error', message: 'An unexpected error occurred' },
  }, { status: 500 })
}

export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new ApiError('invalid_json', 'Request body must be valid JSON', 400)
  }
}
