import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

process.env.AUTH_SECRET ??= 'test-only-auth-secret-at-least-32-characters'
process.env.AUTH_GITHUB_ID ??= 'test-github-client-id'
process.env.AUTH_GITHUB_SECRET ??= 'test-github-client-secret'
process.env.BETA_ALLOWED_EMAILS ??= 'owner@example.test,editor@example.test,viewer@example.test'
