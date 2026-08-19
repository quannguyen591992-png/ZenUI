import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { UsageDashboard } from '../app/dashboard/usage/usage-dashboard'

const workspaceId = '22222222-2222-4222-8222-222222222222'
const projectId = '11111111-1111-4111-8111-111111111111'

const textPricing = {
  status: 'priced' as const,
  pricingVersion: 'google-gemini-2026-08-13',
  inputRateMicroUsdPerMillion: 250_000,
  outputRateMicroUsdPerMillion: 1_500_000,
  inputEstimatedMicroUsd: 30,
  outputEstimatedMicroUsd: 120,
  totalEstimatedMicroUsd: 150,
  currency: 'USD' as const,
}

function report(overrides: Record<string, unknown> = {}) {
  return {
    range: {
      days: 30,
      timezone: 'Asia/Ho_Chi_Minh',
      from: '2026-07-20T00:00:00.000Z',
      to: '2026-08-18T08:00:00.000Z',
    },
    totals: {
      todayTokens: 1_420,
      inputTokens: 220,
      outputTokens: 1_200,
      totalTokens: 1_420,
      pricedEstimatedMicroUsd: 67_400,
      unpricedCount: 0,
      currency: 'USD',
    },
    series: [{
      date: '2026-08-17',
      inputTokens: 1,
      outputTokens: 2,
      totalTokens: 3,
    }, {
      date: '2026-08-18',
      inputTokens: 220,
      outputTokens: 1_200,
      totalTokens: 1_420,
    }],
    items: [{
      id: '44444444-4444-4444-8444-444444444444',
      projectId,
      projectName: 'Landing page',
      provider: 'google-gemini',
      model: 'gemini-3.1-flash-lite',
      inputTokens: 220,
      outputTokens: 1_200,
      totalTokens: 1_420,
      text: {
        provider: 'google-gemini',
        model: 'gemini-3.1-flash-lite',
        inputTokens: 120,
        outputTokens: 80,
        totalTokens: 200,
        pricing: textPricing,
      },
      textPricing,
      image: {
        provider: 'google-gemini',
        model: 'gemini-3.1-flash-image',
        imageSize: '1K',
        imageCount: 1,
        inputTokens: 100,
        outputTokens: 1_120,
        totalTokens: 1_220,
        tokenSource: 'provider_metadata',
        stockCount: 1,
        pricing: {
          status: 'priced',
          provider: 'google-gemini',
          model: 'gemini-3.1-flash-image',
          imageSize: '1K',
          imageCount: 1,
          inputTokens: 100,
          outputTokens: 1_120,
          totalTokens: 1_220,
          tokenSource: 'provider_metadata',
          pricingVersion: 'google-gemini-image-2026-08-13',
          inputRateMicroUsdPerMillion: 500_000,
          outputRateMicroUsdPerMillion: 60_000_000,
          inputEstimatedMicroUsd: 50,
          outputEstimatedMicroUsd: 67_200,
          totalEstimatedMicroUsd: 67_250,
          currency: 'USD',
        },
      },
      stockCount: 1,
      pricing: {
        status: 'priced',
        totalEstimatedMicroUsd: 67_400,
        currency: 'USD',
      },
      createdAt: '2026-08-18T08:00:00.000Z',
    }],
    page: 1,
    pageSize: 25,
    total: 1,
    totalPages: 2,
    ...overrides,
  }
}

function json(data: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(
    status < 400 ? { data } : { error: data },
  ), {
    status,
    headers: { 'content-type': 'application/json' },
  }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AI Usage Dashboard', () => {
  it('shows primary text and image values without secondary breakdowns', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(report())))

    render(<UsageDashboard
      workspaceId={workspaceId}
      timezone="Asia/Ho_Chi_Minh"
    />)

    expect(await screen.findByRole('heading', {
      name: 'Sử dụng AI',
    })).toBeVisible()
    expect(screen.getByText('Token hôm nay')).toBeVisible()
    expect(screen.getByText('Input token 30 ngày')).toBeVisible()
    expect(screen.getByText('Output token 30 ngày')).toBeVisible()
    expect(screen.getByText('Chi phí ước tính 30 ngày')).toBeVisible()
    expect(screen.getAllByText('1.752₫')).toHaveLength(2)
    expect(screen.getByText(
      'Quy đổi ước tính theo tỷ giá 1 USD = 26.000₫',
    )).toBeVisible()
    expect(screen.queryByText('$0.067400')).not.toBeInTheDocument()
    expect(screen.getByText('Văn bản: gemini-3.1-flash-lite')).toBeVisible()
    expect(screen.getByText(
      'Ảnh: gemini-3.1-flash-image · 1K · 1 ảnh',
    )).toBeVisible()
    expect(screen.queryByText(/Token văn bản:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Token ảnh:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Nguồn token:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Ảnh kho Pexels:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Chi phí văn bản:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Chi phí ảnh:/)).not.toBeInTheDocument()
    expect(screen.queryByText('67400 micro-USD')).not.toBeInTheDocument()
    expect(screen.getByRole('img', {
      name: 'Biểu đồ token AI theo ngày',
    })).toBeVisible()
  })

  it('shows only the primary row values without secondary usage details', async () => {
    const imageOnly = report({
      totals: {
        todayTokens: 1_661,
        inputTokens: 37,
        outputTokens: 1_624,
        totalTokens: 1_661,
        pricedEstimatedMicroUsd: 97_459,
        unpricedCount: 0,
        currency: 'USD',
      },
      items: [{
        id: '77777777-7777-4777-8777-777777777777',
        projectId,
        projectName: 'sdsdsd',
        provider: 'google-gemini',
        model: 'gemini-3.1-flash-lite',
        inputTokens: 37,
        outputTokens: 1_624,
        totalTokens: 1_661,
        text: null,
        textPricing: {
          ...textPricing,
          inputEstimatedMicroUsd: 0,
          outputEstimatedMicroUsd: 0,
          totalEstimatedMicroUsd: 0,
        },
        image: {
          provider: 'google-gemini',
          model: 'gemini-3.1-flash-image',
          imageSize: '1K',
          imageCount: 1,
          inputTokens: 37,
          outputTokens: 1_624,
          totalTokens: 1_661,
          tokenSource: 'provider_metadata',
          stockCount: 0,
          pricing: {
            status: 'priced',
            provider: 'google-gemini',
            model: 'gemini-3.1-flash-image',
            imageSize: '1K',
            imageCount: 1,
            inputTokens: 37,
            outputTokens: 1_624,
            totalTokens: 1_661,
            tokenSource: 'provider_metadata',
            pricingVersion: 'google-gemini-image-2026-08-13',
            inputRateMicroUsdPerMillion: 500_000,
            outputRateMicroUsdPerMillion: 60_000_000,
            inputEstimatedMicroUsd: 19,
            outputEstimatedMicroUsd: 97_440,
            totalEstimatedMicroUsd: 97_459,
            currency: 'USD',
          },
        },
        stockCount: 0,
        pricing: {
          status: 'priced',
          totalEstimatedMicroUsd: 97_459,
          currency: 'USD',
        },
        createdAt: '2026-08-19T04:35:00.000Z',
      }],
      total: 1,
    })
    vi.stubGlobal('fetch', vi.fn(() => json(imageOnly)))

    render(<UsageDashboard workspaceId={workspaceId} timezone="UTC" />)

    expect(await screen.findByText(
      'Ảnh: gemini-3.1-flash-image · 1K · 1 ảnh',
    )).toBeVisible()
    const usageTable = screen.getByRole('heading', { name: 'Lượt gọi AI' })
      .closest('section')?.querySelector('table')
    expect(usageTable).not.toBeNull()
    if (!usageTable) throw new Error('Usage table not found')
    expect(within(usageTable).getByText('37')).toBeVisible()
    expect(within(usageTable).getByText('1.624')).toBeVisible()
    expect(within(usageTable).getByText('1.661')).toBeVisible()
    expect(within(usageTable).getByText('2.534₫')).toBeVisible()
    expect(screen.queryByText('$0.097459')).not.toBeInTheDocument()
    expect(screen.queryByText(/Token ảnh:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Nguồn token:/)).not.toBeInTheDocument()
    expect(screen.queryByText('Tổng lượt')).not.toBeInTheDocument()
    expect(screen.queryByText(/Chi phí ảnh:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Văn bản: gemini-3\.1-flash-lite/))
      .not.toBeInTheDocument()
    expect(screen.queryByText('Văn bản: $0.000000'))
      .not.toBeInTheDocument()
  })

  it('labels documented image-token fallback as a partial known subtotal', async () => {
    const fallback = report({
      totals: {
        todayTokens: 2_440,
        inputTokens: 120,
        outputTokens: 2_320,
        totalTokens: 2_440,
        pricedEstimatedMicroUsd: 134_550,
        unpricedCount: 1,
        currency: 'USD',
      },
      items: [{
        id: '66666666-6666-4666-8666-666666666666',
        projectId,
        projectName: 'Landing page fallback',
        provider: 'google-gemini',
        model: 'gemini-3.1-flash-lite',
        inputTokens: 120,
        outputTokens: 2_320,
        totalTokens: 2_440,
        text: {
          provider: 'google-gemini',
          model: 'gemini-3.1-flash-lite',
          inputTokens: 120,
          outputTokens: 80,
          totalTokens: 200,
          pricing: textPricing,
        },
        textPricing,
        image: {
          provider: 'google-gemini',
          model: 'gemini-3.1-flash-image',
          imageSize: '1K',
          imageCount: 2,
          inputTokens: 0,
          outputTokens: 2_240,
          totalTokens: 2_240,
          tokenSource: 'documented_fallback',
          stockCount: 0,
          pricing: {
            status: 'partial',
            reason: 'missing_image_input_usage',
            provider: 'google-gemini',
            model: 'gemini-3.1-flash-image',
            imageSize: '1K',
            imageCount: 2,
            inputTokens: 0,
            outputTokens: 2_240,
            totalTokens: 2_240,
            tokenSource: 'documented_fallback',
            pricingVersion: 'google-gemini-image-2026-08-13',
            inputRateMicroUsdPerMillion: 500_000,
            outputRateMicroUsdPerMillion: 60_000_000,
            inputEstimatedMicroUsd: 0,
            outputEstimatedMicroUsd: 134_400,
            totalEstimatedMicroUsd: 134_400,
            currency: 'USD',
          },
        },
        stockCount: 0,
        pricing: {
          status: 'partial',
          reason: 'missing_image_input_usage',
          totalEstimatedMicroUsd: 134_550,
          currency: 'USD',
        },
        createdAt: '2026-08-18T08:00:00.000Z',
      }],
      total: 1,
    })
    vi.stubGlobal('fetch', vi.fn(() => json(fallback)))

    render(<UsageDashboard workspaceId={workspaceId} timezone="UTC" />)

    expect(await screen.findByText(
      'Ảnh: gemini-3.1-flash-image · 1K · 2 ảnh',
    )).toBeVisible()
    expect(screen.queryByText(/Nguồn token:/)).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      '1 lượt có chi phí chưa đầy đủ',
    )
    expect(screen.getAllByText('3.498₫')).toHaveLength(2)
    expect(screen.queryByText('$0.134550')).not.toBeInTheDocument()
    expect(screen.queryByText(/Chi phí ảnh: \$/)).not.toBeInTheDocument()
  })

  it('does not convert an unknown cost into zero VND', async () => {
    const base = report()
    const unknownCost = report({
      totals: {
        ...base.totals,
        pricedEstimatedMicroUsd: 0,
        unpricedCount: 1,
      },
      items: [{
        ...base.items[0],
        pricing: {
          status: 'unpriced',
          reason: 'unknown_model',
        },
      }],
    })
    vi.stubGlobal('fetch', vi.fn(() => json(unknownCost)))

    render(<UsageDashboard workspaceId={workspaceId} timezone="UTC" />)

    const project = await screen.findByText('Landing page')
    const row = project.closest('tr')
    expect(row).not.toBeNull()
    if (!row) throw new Error('Usage row not found')
    expect(within(row).getByText('Chưa có giá văn bản')).toBeVisible()
    expect(within(row).queryByText('0₫')).not.toBeInTheDocument()
  })

  it.each([
    ['missing_image_input_usage', 'Chi phí ảnh chưa đầy đủ'],
    ['unknown_image_model', 'Chưa có giá model ảnh'],
    ['heterogeneous_image_usage', 'Nhiều model ảnh chưa thể gộp giá'],
  ] as const)(
    'shows the safe unpriced label for %s',
    async (reason, expectedLabel) => {
      const base = report()
      const unknownCost = report({
        items: [{
          ...base.items[0],
          pricing: {
            status: 'unpriced',
            reason,
          },
        }],
      })
      vi.stubGlobal('fetch', vi.fn(() => json(unknownCost)))

      render(<UsageDashboard workspaceId={workspaceId} timezone="UTC" />)

      const project = await screen.findByText('Landing page')
      const row = project.closest('tr')
      expect(row).not.toBeNull()
      if (!row) throw new Error('Usage row not found')
      expect(within(row).getByText(expectedLabel)).toBeVisible()
    },
  )

  it('preserves historical incomplete warnings without guessing an image model', async () => {
    const historical = report({
      totals: {
        todayTokens: 30,
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        pricedEstimatedMicroUsd: 53,
        unpricedCount: 1,
        currency: 'USD',
      },
      items: [{
        id: '55555555-5555-4555-8555-555555555555',
        projectId,
        projectName: 'Landing page cũ',
        provider: 'google-gemini',
        model: 'gemini-2.5-flash',
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        text: {
          provider: 'google-gemini',
          model: 'gemini-2.5-flash',
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
          pricing: {
            status: 'priced',
            pricingVersion: 'google-gemini-2026-08-13',
            inputRateMicroUsdPerMillion: 300_000,
            outputRateMicroUsdPerMillion: 2_500_000,
            inputEstimatedMicroUsd: 3,
            outputEstimatedMicroUsd: 50,
            totalEstimatedMicroUsd: 53,
            currency: 'USD',
          },
        },
        textPricing: {
          status: 'priced',
          pricingVersion: 'google-gemini-2026-08-13',
          inputRateMicroUsdPerMillion: 300_000,
          outputRateMicroUsdPerMillion: 2_500_000,
          inputEstimatedMicroUsd: 3,
          outputEstimatedMicroUsd: 50,
          totalEstimatedMicroUsd: 53,
          currency: 'USD',
        },
        image: null,
        stockCount: 0,
        pricing: {
          status: 'partial',
          reason: 'unsupported_media_cost',
          totalEstimatedMicroUsd: 53,
          currency: 'USD',
        },
        createdAt: '2026-08-17T08:00:00.000Z',
      }],
      total: 1,
    })
    vi.stubGlobal('fetch', vi.fn(() => json(historical)))

    render(<UsageDashboard workspaceId={workspaceId} timezone="UTC" />)

    expect(await screen.findByText(
      'Văn bản: gemini-2.5-flash',
    )).toBeVisible()
    expect(screen.queryByText('Chưa có giá ảnh')).not.toBeInTheDocument()
    expect(screen.queryByText(/gemini-3\.1-flash-image/)).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      '1 lượt có chi phí chưa đầy đủ',
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Tổng phía trên chỉ gồm phần chi phí đã xác định; giá ảnh hoặc bảng giá chưa hỗ trợ chưa được tính.',
    )
  })

  it('applies bounded filters, resets page and paginates server-side', async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
      if (url.startsWith('/api/v1/projects?')) {
        return json([{
          id: projectId,
          workspaceId,
          name: 'Landing page',
        }, {
          id: crypto.randomUUID(),
          workspaceId: crypto.randomUUID(),
          name: 'Dự án khác workspace',
        }, null])
      }
      return json(report())
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<UsageDashboard
      workspaceId={workspaceId}
      timezone="UTC"
    />)
    await screen.findByText('Văn bản: gemini-3.1-flash-lite')
    await screen.findByRole('option', {
      name: 'Landing page',
    })

    await userEvent.setup().selectOptions(
      screen.getByRole('combobox', { name: 'Dự án' }),
      projectId,
    )
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining(`projectId=${projectId}`),
    ))
    await userEvent.setup().type(
      screen.getByRole('textbox', { name: 'Provider' }),
      'google-gemini',
    )
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('provider=google-gemini'),
    ))
    await userEvent.setup().type(
      screen.getByRole('textbox', { name: 'Model' }),
      'gemini-3.1-flash-image',
    )
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('model=gemini-3.1-flash-image'),
    ))
    await userEvent.setup().selectOptions(
      screen.getByRole('combobox', { name: 'Khoảng thời gian' }),
      '90',
    )
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('days=90'),
    ))
    await userEvent.setup().type(
      screen.getByRole('searchbox', { name: 'Tìm theo dự án hoặc model' }),
      'flash-image',
    )
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('search=flash-image'),
    ))
    await userEvent.setup().click(screen.getByRole('button', {
      name: 'Trang sau',
    }))
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('page=2'),
    ))
  })

  it('shows safe error retry and empty states', async () => {
    const emptyReport = report({
      totals: {
        todayTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        pricedEstimatedMicroUsd: 0,
        unpricedCount: 0,
        currency: 'USD',
      },
      series: [],
      items: [],
      total: 0,
      totalPages: 0,
    })
    let usageCalls = 0
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
      if (url.startsWith('/api/v1/projects?')) return json([])
      usageCalls += 1
      return usageCalls === 1
        ? json({ code: 'internal_error' }, 500)
        : json(emptyReport)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<UsageDashboard
      workspaceId={workspaceId}
      timezone="UTC"
    />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không thể tải dữ liệu sử dụng AI',
    )
    await userEvent.setup().click(screen.getByRole('button', {
      name: 'Thử lại',
    }))
    expect(await screen.findByText(
      'Chưa có lượt sử dụng AI trong khoảng thời gian này.',
    )).toBeVisible()
    expect(screen.getByText('0₫')).toBeVisible()
  })
})
