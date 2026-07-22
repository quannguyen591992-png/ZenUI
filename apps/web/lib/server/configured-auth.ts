import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { accounts, sessions, users, verificationTokens } from '@zenui/database/schema'
import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'

import { validateAuthEnvironment } from '../../auth'

import { getDatabase } from './database'

export function createConfiguredAuth() {
  const environment = validateAuthEnvironment({
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID,
    AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET,
  })
  return NextAuth({
    adapter: DrizzleAdapter(getDatabase(), {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    secret: environment.AUTH_SECRET,
    session: { strategy: 'database' },
    providers: [GitHub({
      clientId: environment.AUTH_GITHUB_ID,
      clientSecret: environment.AUTH_GITHUB_SECRET,
    })],
    cookies: {
      sessionToken: {
        name: '__Secure-authjs.session-token',
        options: { httpOnly: true, sameSite: 'lax', path: '/', secure: true },
      },
    },
    callbacks: {
      session({ session, user }) {
        if (session.user) session.user.id = user.id
        return session
      },
    },
  })
}
