import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const forbiddenRequest = /generation-runs|pexels|googleapis|provider-connections|\/share-links|\/deployments/i

function assertNoExternalProductRequests(page: Page): string[] {
  const forbidden: string[] = []
  page.on('request', request => {
    if (forbiddenRequest.test(request.url())) forbidden.push(request.url())
  })
  return forbidden
}

async function assertNoSeriousViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).analyze()
  expect(result.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
}

async function reachEditor(page: Page): Promise<void> {
  await page.goto('/prototype/non-coder')
  await expect(page.getByRole('heading', { name: 'Hãy cho chúng tôi biết website bạn muốn tạo' })).toBeVisible()
  await page.getByRole('button', { name: 'Tạo 3 hướng thiết kế' }).click()
  await expect(page.getByRole('region', { name: 'Các hướng thiết kế' }).getByTestId('direction-card')).toHaveCount(3)
  await page.getByRole('region', { name: 'Các hướng thiết kế' }).getByRole('button', { name: 'Chọn hướng này' }).first().click()
  await expect(page.getByRole('main', { name: 'Trình chỉnh sửa theo phần' })).toBeVisible()
}

test('completes the deterministic non-coder journey without provider calls', async ({ page }) => {
  const forbidden = assertNoExternalProductRequests(page)
  await reachEditor(page)

  await expect(page.getByRole('main', { name: 'Trình chỉnh sửa theo phần' })).not.toContainText(/node id|breakpoint|token count|revision id|deployment provider/i)
  const before = await page.getByTestId('accepted-document-fingerprint').textContent()
  await page.getByRole('button', { name: 'Đề xuất thay đổi' }).click()
  await expect(page.getByRole('heading', { name: 'Kiểm tra thay đổi được đề xuất' })).toBeVisible()
  await expect(page.getByTestId('accepted-document-fingerprint')).toHaveText(before ?? '')
  await page.getByRole('button', { name: 'Chấp nhận thay đổi' }).click()
  await expect(page.getByRole('main', { name: 'Trình chỉnh sửa theo phần' }).getByText('Đã lưu')).toBeVisible()
  await expect(page.getByTestId('accepted-document-fingerprint')).not.toHaveText(before ?? '')

  await page.getByRole('button', { name: 'Xem trước' }).click()
  await expect(page.getByRole('dialog', { name: 'Xem trước website của bạn' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Xem trước' })).toBeFocused()

  await page.getByRole('button', { name: 'Chia sẻ' }).click()
  await page.getByRole('button', { name: 'Tạo liên kết chia sẻ' }).click()
  await expect(page.getByText('prototype.local/share/novaflow')).toBeVisible()
  await page.getByRole('button', { name: 'Đóng chia sẻ' }).click()

  await page.getByRole('button', { name: 'Xuất bản' }).click()
  await page.getByLabel('Tôi hiểu website này sẽ được công khai.').check()
  await page.getByRole('button', { name: 'Xuất bản website' }).click()
  await expect(page.getByText('Website prototype của bạn đã hoạt động')).toBeVisible()
  expect(forbidden).toEqual([])
})

test('supports the narrow gallery and Canvas-first sheets', async ({ page }) => {
  const forbidden = assertNoExternalProductRequests(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await reachEditor(page)

  await expect(page.getByRole('button', { name: 'Câu chuyện' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Hỏi AI' })).toBeVisible()
  await page.getByRole('button', { name: 'Câu chuyện' }).click()
  await expect(page.getByRole('dialog', { name: 'Câu chuyện trang' })).toBeVisible()
  await page.getByRole('dialog', { name: 'Câu chuyện trang' }).getByRole('button', { name: /Giải thích giá trị Lợi ích/ }).click()
  await expect(page.getByRole('dialog', { name: 'Câu chuyện trang' })).toBeHidden()

  await page.getByRole('button', { name: 'Hỏi AI' }).click()
  await expect(page.getByRole('dialog', { name: 'Cùng thiết kế' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Hỏi AI' })).toBeFocused()
  expect(forbidden).toEqual([])
})

test('has no serious or critical accessibility violations on key prototype surfaces', async ({ page }) => {
  await page.goto('/prototype/non-coder')
  await assertNoSeriousViolations(page)

  await page.getByRole('button', { name: 'Tạo 3 hướng thiết kế' }).click()
  await assertNoSeriousViolations(page)

  await page.getByRole('region', { name: 'Các hướng thiết kế' }).getByRole('button', { name: 'Chọn hướng này' }).first().click()
  await assertNoSeriousViolations(page)

  await page.getByRole('button', { name: 'Đề xuất thay đổi' }).click()
  await assertNoSeriousViolations(page)

  await page.getByRole('button', { name: 'Bỏ đề xuất' }).click()
  await page.getByRole('button', { name: 'Xuất bản' }).click()
  await assertNoSeriousViolations(page)
})
