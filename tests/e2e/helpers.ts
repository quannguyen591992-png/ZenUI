import type { Page, APIRequestContext } from '@playwright/test'

export const workspaceId = '22222222-2222-4222-8222-222222222222'

export async function resetE2e(request: APIRequestContext): Promise<void> {
  const response = await request.delete('/api/e2e/session')
  if (!response.ok()) throw new Error(`E2E reset failed: ${response.status()}`)
}

export async function signIn(page: Page, identity: 'owner' | 'outsider' = 'owner'): Promise<void> {
  const response = await page.request.post('/api/e2e/session', { data: { identity } })
  if (!response.ok()) throw new Error(`E2E sign-in failed: ${response.status()}`)
}

export async function createProject(page: Page, name = 'E2E landing'): Promise<string> {
  await page.goto('/')
  await page.getByLabel('Project name').fill(name)
  await page.getByRole('button', { name: 'Create project' }).click()
  const link = page.getByRole('link', { name: `Open ${name}` })
  await link.waitFor()
  const href = await link.getAttribute('href')
  if (!href) throw new Error('Created project link is missing')
  return href.split('/').at(-1)!
}
