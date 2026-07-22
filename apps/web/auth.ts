import type { NextAuthConfig } from 'next-auth'

interface AuthEnvironment {
  AUTH_SECRET?: string | undefined
  AUTH_GITHUB_ID?: string | undefined
  AUTH_GITHUB_SECRET?: string | undefined
}

interface ValidatedAuthEnvironment {
  AUTH_SECRET: string
  AUTH_GITHUB_ID: string
  AUTH_GITHUB_SECRET: string
}

export function validateAuthEnvironment(environment: AuthEnvironment): ValidatedAuthEnvironment {
  if (!environment.AUTH_SECRET) throw new Error('AUTH_SECRET is required')
  if (!environment.AUTH_GITHUB_ID || !environment.AUTH_GITHUB_SECRET) {
    throw new Error('AUTH_GITHUB_ID and AUTH_GITHUB_SECRET are required')
  }
  return {
    AUTH_SECRET: environment.AUTH_SECRET,
    AUTH_GITHUB_ID: environment.AUTH_GITHUB_ID,
    AUTH_GITHUB_SECRET: environment.AUTH_GITHUB_SECRET,
  }
}

export function createAuthConfig(environment: AuthEnvironment): NextAuthConfig {
  const validated = validateAuthEnvironment(environment)
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
  }
}
