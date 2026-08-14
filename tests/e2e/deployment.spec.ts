import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { createProject, openAdvancedEditor, resetE2e, signIn, workspaceId } from './helpers'

test.beforeEach(async ({ page, request }) => {
  await resetE2e(request)
  await signIn(page)
})

async function createRevision(page: import('@playwright/test').Page, projectId: string) {
  await page.goto(`/projects/${projectId}`)
  await openAdvancedEditor(page)
  await page.getByLabel('Tên phiên bản').fill('Launch revision')
  await page.getByRole('button', { name: 'Tạo phiên bản' }).click()
  await expect(page.getByText('Launch revision')).toBeVisible()
}

test('connects Vercel and deploys one immutable revision safely', async ({ page, browser }) => {
  const projectId = await createProject(page, 'Immutable deploy')
  await createRevision(page, projectId)

  await page.getByRole('button', { name: 'Triển khai' }).click()
  await expect(page.getByText('Kết nối Vercel để triển khai một phiên bản.')).toBeVisible()
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Kết nối Vercel' }).click()
  await popupPromise
  await expect(page.getByText('Vercel đã kết nối')).toBeVisible({ timeout: 10_000 })

  const results = await new AxeBuilder({ page }).include('.deploy-popover').analyze()
  expect(results.violations.filter(violation => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([])

  const revisionResponse = await page.request.get(`/api/v1/projects/${projectId}/revisions?workspaceId=${workspaceId}`)
  const revisionId = (await revisionResponse.json()).data[0].id as string

  await page.getByRole('treeitem', { name: /^Tiêu đề: Biến ý tưởng thành website của riêng bạn/ }).click()
  await page.getByRole('textbox', { name: 'Nội dung', exact: true }).fill('Changed after revision')
  await expect(page.locator('footer').getByText('Đã lưu')).toBeVisible()

  await page.getByLabel('Môi trường triển khai').selectOption('preview')
  await page.getByRole('checkbox', { name: /xác nhận triển khai/i }).check()
  await page.getByRole('button', { name: 'Bắt đầu triển khai' }).dblclick()
  await expect(page.getByText('Triển khai đã sẵn sàng')).toBeVisible({ timeout: 15_000 })

  const deploymentsResponse = await page.request.get(`/api/v1/projects/${projectId}/deployments?workspaceId=${workspaceId}`)
  const deploymentsBody = await deploymentsResponse.json()
  expect(deploymentsBody.data).toHaveLength(1)
  expect(deploymentsBody.data[0]).toMatchObject({ revisionId, status: 'ready', target: 'preview' })
  expect(JSON.stringify(deploymentsBody)).not.toMatch(/providerDeploymentId|artifactKey|connectionId|workspaceId|projectId/i)

  const artifact = await page.request.get(`/api/e2e/deployments/${deploymentsBody.data[0].id}`)
  expect(artifact.status()).toBe(200)
  expect(artifact.headers()['content-type']).toContain('application/zip')
  const bundle = Buffer.from(await artifact.body())
  expect([...bundle.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
  expect(bundle.toString('utf8')).toContain('Biến ý tưởng thành website của riêng bạn')
  expect(bundle.toString('utf8')).not.toContain('Changed after revision')
  expect(bundle.toString('utf8')).not.toMatch(/<script|\son\w+=/i)

  const outsider = await browser.newPage()
  await signIn(outsider, 'outsider')
  const hidden = await outsider.request.get(`/api/v1/projects/${projectId}/deployments/${deploymentsBody.data[0].id}?workspaceId=${workspaceId}`)
  expect(hidden.status()).toBe(404)
  await outsider.close()
})

test('collects a Deployment lead in Customer Leads and disables future intake', async ({ page, browser }) => {
  test.setTimeout(90_000)
  const projectId = await createProject(page, 'Deployment Customer Leads')
  await page.goto(`/projects/${projectId}`)
  await openAdvancedEditor(page)
  await page.getByRole('treeitem', {
    name: /^Khung chứa: Khung chứa/,
  }).click()
  await page.getByRole('tab', { name: 'Thành phần' }).click()
  await page.getByRole('button', {
    name: 'Thêm Biểu mẫu khách hàng',
  }).click()
  const builder = page.getByRole('region', {
    name: 'Trình tạo biểu mẫu khách hàng',
  })
  await builder.getByLabel('Tiêu đề biểu mẫu').fill(
    'Nhận tư vấn Deployment E2E',
  )
  await builder.getByLabel('Nhãn nút gửi').fill(
    'Gửi Deployment E2E',
  )
  await builder.getByRole('button', { name: 'Lưu biểu mẫu' }).click()
  await expect(page.locator('footer').getByText('Đã lưu')).toBeVisible()
  await createRevision(page, projectId)

  await page.getByRole('button', { name: 'Triển khai' }).click()
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Kết nối Vercel' }).click()
  await popupPromise
  await expect(page.getByText('Vercel đã kết nối')).toBeVisible({
    timeout: 10_000,
  })
  await page.getByRole('checkbox', { name: /xác nhận triển khai/i }).check()
  await page.getByRole('button', { name: 'Bắt đầu triển khai' }).click()
  await expect(page.getByText('Triển khai đã sẵn sàng')).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText(/Lead Form đang gửi thông tin/)).toBeVisible()

  const deploymentsResponse = await page.request.get(
    `/api/v1/projects/${projectId}/deployments?workspaceId=${workspaceId}`,
  )
  const deployment = (await deploymentsResponse.json()).data[0] as {
    id: string
    leadFormsLive: boolean
    url: string
  }
  expect(deployment).toMatchObject({ leadFormsLive: true })
  expect(JSON.stringify(deployment)).not.toMatch(
    /publicBindingId|bindingId|workspaceId|projectId/i,
  )

  const artifact = await page.request.get(
    `/api/e2e/deployments/${deployment.id}`,
  )
  const archive = Buffer.from(await artifact.body()).toString('utf8')
  const action = archive.match(
    /action="(http:\/\/127\.0\.0\.1:3000\/d\/[A-Za-z0-9_-]{32})"/,
  )?.[1]
  expect(action).toBeTruthy()
  expect(archive).not.toContain('__zenui_request_id')
  expect(archive).toContain("script-src 'none'")
  const formNodeId = archive.match(
    /name="__zenui_form_node_id" type="hidden" value="([A-Za-z0-9_-]+)"/,
  )?.[1]
  expect(formNodeId).toBeTruthy()

  const visitor = await browser.newContext()
  const submission = await visitor.request.post(action!, {
    headers: {
      host: '127.0.0.1:3000',
      origin: new URL(deployment.url).origin,
      'content-type': 'application/x-www-form-urlencoded',
    },
    form: {
      __zenui_form_node_id: formNodeId!,
      __zenui_page_route: '/',
      name: 'Khách Deployment E2E',
      email: 'deployment-lead@example.test',
    },
    maxRedirects: 0,
  })
  expect(submission.status()).toBe(303)
  expect(submission.headers().location).toMatch(
    /^\/d\/[A-Za-z0-9_-]{32}\/__zenui\/receipt$/,
  )
  const receipt = await visitor.request.get(
    `http://127.0.0.1:3000${submission.headers().location}`,
  )
  expect(receipt.status()).toBe(200)
  expect(await receipt.text()).not.toContain('deployment-lead@example.test')
  await visitor.close()

  await page.bringToFront()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  const leadsTab = page.getByRole('tab', { name: /Khách hàng/ })
  await expect(leadsTab).toContainText('1')
  await leadsTab.click()
  await page.getByRole('button', {
    name: /Nhận tư vấn Deployment E2E/,
  }).click()
  await expect(page.getByText('deployment-lead@example.test')).toBeVisible()
  await page.getByRole('button', { name: 'Đánh dấu đã liên hệ' }).click()
  await expect(leadsTab).not.toContainText('1')
  await page.reload()
  await page.getByRole('tab', { name: /Khách hàng/ }).click()
  await page.getByRole('button', {
    name: /Nhận tư vấn Deployment E2E/,
  }).click()
  await expect(page.getByText('Đã liên hệ').first()).toBeVisible()

  const disabledManagement = await page.request.delete(
    `/api/v1/projects/${projectId}/deployments/${deployment.id}/lead-forms?workspaceId=${workspaceId}`,
    { headers: { origin: 'http://localhost:3000' } },
  )
  expect(disabledManagement.status()).toBe(200)
  expect((await disabledManagement.json()).data).toMatchObject({
    id: deployment.id,
    leadFormsLive: false,
  })
  const disabled = await page.request.post(action!, {
    headers: {
      host: '127.0.0.1:3000',
      origin: new URL(deployment.url).origin,
      'content-type': 'application/x-www-form-urlencoded',
    },
    form: {
      __zenui_form_node_id: formNodeId!,
      __zenui_page_route: '/',
      name: 'Không được lưu',
      email: 'disabled@example.test',
    },
    maxRedirects: 0,
  })
  expect(disabled.status()).toBe(404)
})

test('rejects forged deployment mutation, consumes OAuth state once and disconnects', async ({ page }) => {
  const projectId = await createProject(page, 'Triển khai security')
  await createRevision(page, projectId)
  const revisionResponse = await page.request.get(`/api/v1/projects/${projectId}/revisions?workspaceId=${workspaceId}`)
  const revisionId = (await revisionResponse.json()).data[0].id as string

  const forged = await page.request.post(`/api/v1/projects/${projectId}/deployments`, {
    headers: { origin: 'https://evil.test' },
    data: { workspaceId, revisionId, requestId: crypto.randomUUID(), target: 'preview', confirmed: true },
  })
  expect(forged.status()).toBe(403)

  const authorize = await page.request.post('/api/v1/provider-connections/vercel/authorize', {
    headers: { origin: 'http://localhost:3000' },
    data: { workspaceId, returnPath: `/projects/${projectId}` },
  })
  const installUrl = new URL((await authorize.json()).data.url)
  const state = installUrl.searchParams.get('state')!
  const callback = `/api/v1/provider-connections/vercel/callback?state=${state}&code=e2e-code&configurationId=icfg_e2e&teamId=team_e2e&source=external`
  const accepted = await page.request.get(callback, { maxRedirects: 0 })
  expect(accepted.status()).toBe(303)
  const replay = await page.request.get(callback, { maxRedirects: 0 })
  expect(replay.status()).toBe(403)

  const disconnected = await page.request.delete(`/api/v1/provider-connections/vercel?workspaceId=${workspaceId}`, {
    headers: { origin: 'http://localhost:3000' }, data: { workspaceId },
  })
  expect(disconnected.status()).toBe(200)
  expect((await disconnected.json()).data.status).toBe('disconnected')

  const denied = await page.request.post(`/api/v1/projects/${projectId}/deployments`, {
    headers: { origin: 'http://localhost:3000' },
    data: { workspaceId, revisionId, requestId: crypto.randomUUID(), target: 'preview', confirmed: true },
  })
  expect(denied.status()).toBe(409)
})
