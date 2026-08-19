import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @zenui/preview build && pnpm --filter @zenui/preview start',
      env: {
        EDITOR_ORIGIN: 'http://localhost:3000',
        PREVIEW_PORT: '3001',
        REMOTE_IMAGE_HOST_ALLOWLIST: 'images.example.com,images.unsplash.com',
        ASSET_ORIGIN: 'http://127.0.0.1:3000',
      },
      url: 'http://127.0.0.1:3001',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @zenui/web exec next dev --webpack',
      env: {
        APP_ORIGIN: 'http://localhost:3000',
        PREVIEW_ORIGIN: 'http://127.0.0.1:3001',
        SHARE_ORIGIN: 'http://127.0.0.1:3000',
        ASSET_ORIGIN: 'http://127.0.0.1:3000',
        REMOTE_IMAGE_HOST_ALLOWLIST: 'images.example.com,images.unsplash.com',
        AUTH_SECRET: 'e2e-only-auth-secret-at-least-32-characters',
        BETA_ALLOWED_EMAILS: 'owner@example.test,editor@example.test,viewer@example.test',
        ZENUI_E2E_ENABLED: 'true',
      },
      url: 'http://localhost:3000',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
