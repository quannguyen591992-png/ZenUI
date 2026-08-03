import { z } from 'zod'

const projectCallbackSchema = z.string().regex(
  /^\/projects\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
)

export function safeAuthCallbackPath(input: unknown): string {
  if (input === '/dashboard') return input
  const project = projectCallbackSchema.safeParse(input)
  return project.success ? project.data : '/dashboard'
}

export function requireExactAppOrigin(request: Request, appOriginInput: string | undefined): boolean {
  if (!appOriginInput) return false
  const origin = request.headers.get('origin')
  if (!origin || origin === 'null') return false
  try {
    return new URL(origin).origin === new URL(appOriginInput).origin
  } catch {
    return false
  }
}
