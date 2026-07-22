import '@testing-library/jest-dom/vitest'

process.env.AUTH_SECRET ??= 'test-only-auth-secret-at-least-32-characters'
process.env.AUTH_GITHUB_ID ??= 'test-github-client-id'
process.env.AUTH_GITHUB_SECRET ??= 'test-github-client-secret'
