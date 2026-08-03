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

export async function createOnboardingProject(page: Page, name = 'E2E landing'): Promise<string> {
  await page.goto('/dashboard')
  await page.getByLabel('Tên dự án').fill(name)
  await page.getByRole('button', { name: 'Tạo dự án' }).click()
  const link = page.getByRole('link', { name: `Mở ${name}` })
  await link.waitFor()
  const href = await link.getAttribute('href')
  if (!href) throw new Error('Created project link is missing')
  return href.split('/').at(-1)!
}

export async function openAdvancedEditor(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Mở điều khiển nâng cao' }).click()
  await page.getByRole('button', { name: 'Xác nhận mở nâng cao' }).click()
  await page.getByRole('tab', { name: 'Lớp' }).waitFor()
}

export async function acceptGuidedDirection(page: Page): Promise<void> {
  await page.getByLabel('Bạn cung cấp sản phẩm hoặc dịch vụ gì?').fill('ZenUI giúp nhóm sản phẩm tạo website rõ ràng')
  await page.getByLabel('Website này dành cho ai?').fill('Nhóm sản phẩm nhỏ')
  await page.getByLabel('Website này cần đạt được điều gì?').fill('Nhận lịch tư vấn phù hợp')
  await page.getByLabel('Khách truy cập nên làm gì tiếp theo?').fill('Đặt lịch tư vấn')
  await page.getByLabel('Website nên mang lại cảm giác như thế nào?').fill('Rõ ràng và hiện đại')
  await page.getByRole('button', { name: 'Tạo 3 hướng thiết kế' }).click()
  await page.getByTestId('production-direction-card').first().waitFor()
  await page.getByRole('button', { name: 'Chọn hướng này' }).first().click()
  await page.getByRole('heading', { name: 'Câu chuyện trang' }).waitFor()
}

export async function createProject(page: Page, name = 'E2E landing'): Promise<string> {
  const projectId = await createOnboardingProject(page, name)
  const accepted = await page.request.post(`/api/e2e/projects/${projectId}/accept-starter`)
  if (!accepted.ok()) throw new Error(`E2E starter acceptance failed: ${accepted.status()}`)
  return projectId
}
