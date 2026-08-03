import type { NextAuthConfig } from 'next-auth'

interface AuthEnvironment {
  AUTH_SECRET?: string | undefined
  AUTH_GITHUB_ID?: string | undefined
  AUTH_GITHUB_SECRET?: string | undefined
  BETA_ALLOWED_EMAILS?: string | undefined
}

interface ValidatedAuthEnvironment {
  AUTH_SECRET: string
  AUTH_GITHUB_ID: string
  AUTH_GITHUB_SECRET: string
  BETA_ALLOWED_EMAILS: string
}

export function createBetaEmailPolicy(input: string) {
  if (!input.trim()) throw new Error('BETA_ALLOWED_EMAILS is required')
  const emails = input.split(',').map(value => value.trim().toLowerCase())
  if (emails.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error('invalid_beta_email')
  if (new Set(emails).size !== emails.length) throw new Error('duplicate_beta_email')
  const sorted = [...emails].sort()
  const allowed = new Set(sorted)
  return {
    emails: sorted,
    allows(email: string | null | undefined): boolean {
      return typeof email === 'string' && allowed.has(email.trim().toLowerCase())
    },
  }
}

export function isConfiguredBetaEmailAllowed(email: string | null | undefined): boolean {
  return createBetaEmailPolicy(process.env.BETA_ALLOWED_EMAILS ?? '').allows(email)
}

export function validateAuthEnvironment(environment: AuthEnvironment): ValidatedAuthEnvironment {
  if (!environment.AUTH_SECRET) throw new Error('AUTH_SECRET is required')
  if (!environment.AUTH_GITHUB_ID || !environment.AUTH_GITHUB_SECRET) {
    throw new Error('AUTH_GITHUB_ID and AUTH_GITHUB_SECRET are required')
  }
  if (!environment.BETA_ALLOWED_EMAILS) throw new Error('BETA_ALLOWED_EMAILS is required')
  createBetaEmailPolicy(environment.BETA_ALLOWED_EMAILS)
  return {
    AUTH_SECRET: environment.AUTH_SECRET,
    AUTH_GITHUB_ID: environment.AUTH_GITHUB_ID,
    AUTH_GITHUB_SECRET: environment.AUTH_GITHUB_SECRET,
    BETA_ALLOWED_EMAILS: environment.BETA_ALLOWED_EMAILS,
  }
}

export function createAuthConfig(environment: AuthEnvironment): NextAuthConfig {
  const validated = validateAuthEnvironment(environment)
  const betaEmails = createBetaEmailPolicy(validated.BETA_ALLOWED_EMAILS)
  return {
    secret: validated.AUTH_SECRET,
    session: { strategy: 'database' },
    providers: [{
      id: 'github',
      name: 'GitHub',
      type: 'oauth',
      clientId: validated.AUTH_GITHUB_ID,
      clientSecret: validated.AUTH_GITHUB_SECRET,
      authorization: 'https://github.com/login/oauth/authorize',
      token: 'https://github.com/login/oauth/access_token',
      userinfo: 'https://api.github.com/user',
      profile(profile: { id: number; name?: string; login: string; email?: string; avatar_url?: string }) {
        return {
          id: String(profile.id),
          name: profile.name ?? profile.login,
          email: profile.email ?? null,
          image: profile.avatar_url ?? null,
        }
      },
    }],
    cookies: {
      sessionToken: {
        name: '__Secure-authjs.session-token',
        options: {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          secure: true,
        },
      },
    },
    pages: { signIn: '/login', error: '/auth-error' },
    callbacks: {
      signIn({ user }) {
        return betaEmails.allows(user.email)
      },
    },
  }
}
