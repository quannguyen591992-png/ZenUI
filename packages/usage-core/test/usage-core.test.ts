import { describe, expect, it } from 'vitest'

import {
  createImagePricingSnapshot,
  createUsageDateRange,
  createUsagePricingSnapshot,
  estimateUsageCost,
  resolveImagePricing,
  resolveUsagePricing,
  usageDateKey,
  usageListQuerySchema,
  usageReportSchema,
} from '../src/index'

const effectiveAt = new Date('2026-08-13T00:00:00.000Z')

describe('AI usage pricing', () => {
  it('exact-matches a supported provider/model at its effective date', () => {
    expect(resolveUsagePricing({
      provider: 'google-gemini',
      model: 'gemini-2.5-flash',
      at: effectiveAt,
    })).toMatchObject({
      pricingVersion: 'google-gemini-2026-08-13',
      inputRateMicroUsdPerMillion: 300_000,
      outputRateMicroUsdPerMillion: 2_500_000,
      currency: 'USD',
    })
  })

  it('prices Gemini 3.1 Flash-Lite with the official standard text rates', () => {
    expect(resolveUsagePricing({
      provider: 'google-gemini',
      model: 'gemini-3.1-flash-lite',
      at: effectiveAt,
    })).toMatchObject({
      pricingVersion: 'google-gemini-2026-08-13',
      inputRateMicroUsdPerMillion: 250_000,
      outputRateMicroUsdPerMillion: 1_500_000,
      currency: 'USD',
    })
    expect(createUsagePricingSnapshot({
      provider: 'google-gemini',
      model: 'gemini-3.1-flash-lite',
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      at: effectiveAt,
    })).toMatchObject({
      status: 'priced',
      inputEstimatedMicroUsd: 250_000,
      outputEstimatedMicroUsd: 750_000,
      totalEstimatedMicroUsd: 1_000_000,
    })
  })

  it('prices Gemini 3.1 Flash Image 1K from provider metadata', () => {
    expect(resolveImagePricing({
      provider: 'google-gemini',
      model: 'gemini-3.1-flash-image',
      imageSize: '1K',
      at: effectiveAt,
    })).toMatchObject({
      pricingVersion: 'google-gemini-image-2026-08-13',
      inputRateMicroUsdPerMillion: 500_000,
      outputRateMicroUsdPerMillion: 60_000_000,
      documentedOutputTokensPerImage: 1_120,
    })

    expect(createImagePricingSnapshot({
      provider: 'google-gemini',
      model: 'gemini-3.1-flash-image',
      imageSize: '1K',
      imageCount: 1,
      inputTokens: 100,
      outputTokens: 1_120,
      totalTokens: 1_220,
      tokenSource: 'provider_metadata',
      at: effectiveAt,
    })).toEqual({
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
    })
  })

  it('uses the documented 1K output fallback without pretending input is free', () => {
    expect(createImagePricingSnapshot({
      provider: 'google-gemini',
      model: 'gemini-3.1-flash-image',
      imageSize: '1K',
      imageCount: 2,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      tokenSource: 'documented_fallback',
      at: effectiveAt,
    })).toMatchObject({
      status: 'partial',
      reason: 'missing_image_input_usage',
      outputTokens: 2_240,
      outputEstimatedMicroUsd: 134_400,
      totalEstimatedMicroUsd: 134_400,
    })

    expect(createImagePricingSnapshot({
      provider: 'google-gemini',
      model: 'unknown-image-model',
      imageSize: '1K',
      imageCount: 1,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      tokenSource: 'documented_fallback',
      at: effectiveAt,
    })).toEqual({
      status: 'unpriced',
      reason: 'unknown_image_model',
      provider: 'google-gemini',
      model: 'unknown-image-model',
      imageSize: '1K',
      imageCount: 1,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      tokenSource: 'documented_fallback',
    })
  })

  it('marks unsupported provider-operation costs as partial or unpriced', () => {
    expect(createUsagePricingSnapshot({
      provider: 'google-gemini',
      model: 'gemini-3.1-flash-lite',
      inputTokens: 0,
      outputTokens: 0,
      hasUnpricedProviderOperation: true,
      at: effectiveAt,
    })).toEqual({
      status: 'unpriced',
      reason: 'unsupported_media_cost',
    })
    expect(createUsagePricingSnapshot({
      provider: 'google-gemini',
      model: 'gemini-3.1-flash-lite',
      inputTokens: 920,
      outputTokens: 1_529,
      hasUnpricedProviderOperation: true,
      at: effectiveAt,
    })).toMatchObject({
      status: 'partial',
      reason: 'unsupported_media_cost',
      totalEstimatedMicroUsd: 2_524,
    })
  })

  it('does not fuzzy-match unknown models or apply future pricing', () => {
    expect(resolveUsagePricing({
      provider: 'google',
      model: 'gemini-2.5-flash-preview',
      at: effectiveAt,
    })).toBeNull()
    expect(resolveUsagePricing({
      provider: 'google',
      model: 'gemini-2.5-flash',
      at: new Date('2026-08-12T23:59:59.999Z'),
    })).toBeNull()
  })

  it('uses integer micro-USD arithmetic with half-up rounding', () => {
    expect(estimateUsageCost({
      inputTokens: 1,
      outputTokens: 1,
      inputRateMicroUsdPerMillion: 500_000,
      outputRateMicroUsdPerMillion: 1_500_000,
    })).toEqual({
      inputEstimatedMicroUsd: 1,
      outputEstimatedMicroUsd: 2,
      totalEstimatedMicroUsd: 3,
    })
  })

  it('rejects unsafe token counts, rates, and cost totals', () => {
    expect(() => estimateUsageCost({
      inputTokens: -1,
      outputTokens: 0,
      inputRateMicroUsdPerMillion: 1,
      outputRateMicroUsdPerMillion: 1,
    })).toThrow('invalid_token_count')
    expect(() => estimateUsageCost({
      inputTokens: 0,
      outputTokens: 1,
      inputRateMicroUsdPerMillion: 1,
      outputRateMicroUsdPerMillion: -1,
    })).toThrow('invalid_pricing_rate')
    expect(() => estimateUsageCost({
      inputTokens: Number.MAX_SAFE_INTEGER,
      outputTokens: 0,
      inputRateMicroUsdPerMillion:
        Number.MAX_SAFE_INTEGER,
      outputRateMicroUsdPerMillion: 0,
    })).toThrow('usage_cost_overflow')
    expect(() => estimateUsageCost({
      inputTokens: Number.MAX_SAFE_INTEGER,
      outputTokens: Number.MAX_SAFE_INTEGER,
      inputRateMicroUsdPerMillion: 1_000_000,
      outputRateMicroUsdPerMillion: 1_000_000,
    })).toThrow('usage_cost_overflow')
  })

  it('selects the correct tier for Gemini Pro input size', () => {
    expect(resolveUsagePricing({
      provider: 'google-gemini',
      model: 'gemini-2.5-pro',
      inputTokens: 200_000,
      at: effectiveAt,
    })?.inputRateMicroUsdPerMillion).toBe(
      1_250_000,
    )
    expect(resolveUsagePricing({
      provider: 'google-gemini',
      model: 'gemini-2.5-pro',
      inputTokens: 200_001,
      at: effectiveAt,
    })?.inputRateMicroUsdPerMillion).toBe(
      2_500_000,
    )
  })

  it('creates an immutable snapshot and leaves unknown models unpriced', () => {
    const priced = createUsagePricingSnapshot({
      provider: 'google-gemini',
      model: 'gemini-2.5-flash-lite',
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      at: effectiveAt,
    })
    expect(priced).toEqual({
      status: 'priced',
      pricingVersion: 'google-gemini-2026-08-13',
      inputRateMicroUsdPerMillion: 100_000,
      outputRateMicroUsdPerMillion: 400_000,
      inputEstimatedMicroUsd: 100_000,
      outputEstimatedMicroUsd: 200_000,
      totalEstimatedMicroUsd: 300_000,
      currency: 'USD',
    })
    expect(createUsagePricingSnapshot({
      provider: 'google',
      model: 'unknown',
      inputTokens: 1,
      outputTokens: 1,
      at: effectiveAt,
    })).toEqual({
      status: 'unpriced',
      reason: 'unknown_model',
    })
  })
})

describe('AI usage report contracts', () => {
  it('builds timezone-aware bounded date ranges', () => {
    expect(createUsageDateRange({
      days: 30,
      timezone: 'Asia/Ho_Chi_Minh',
      now: new Date('2026-08-18T08:00:00.000Z'),
    })).toEqual({
      days: 30,
      timezone: 'Asia/Ho_Chi_Minh',
      from: '2026-07-19T17:00:00.000Z',
      to: '2026-08-18T08:00:00.000Z',
    })
    expect(usageDateKey(
      new Date('2026-08-18T18:00:00.000Z'),
      'Asia/Ho_Chi_Minh',
    )).toBe('2026-08-19')
  })

  it('rejects invalid usage ranges and timezones', () => {
    expect(() => createUsageDateRange({
      days: 0,
      timezone: 'UTC',
      now: effectiveAt,
    })).toThrow('invalid_usage_range')
    expect(() => createUsageDateRange({
      days: 1,
      timezone: 'Not/A_Timezone',
      now: effectiveAt,
    })).toThrow('invalid_usage_range')
    expect(() => createUsageDateRange({
      days: 1,
      timezone: 'UTC',
      now: new Date('invalid'),
    })).toThrow('invalid_usage_range')
  })

  it('bounds and coerces report queries without accepting a user ID', () => {
    expect(usageListQuerySchema.parse({})).toEqual({
      days: 30,
      page: 1,
      pageSize: 25,
      timezone: 'UTC',
    })
    expect(usageListQuerySchema.parse({
      days: '90',
      page: '2',
      pageSize: '100',
      timezone: 'Asia/Ho_Chi_Minh',
    })).toMatchObject({ days: 90, page: 2, pageSize: 100 })
    expect(() => usageListQuerySchema.parse({ days: 91 })).toThrow()
    expect(() => usageListQuerySchema.parse({ userId: crypto.randomUUID() })).toThrow()
  })

  it('validates priced and unpriced rows without sensitive AI content', () => {
    const report = usageReportSchema.parse({
      range: { days: 30, timezone: 'UTC', from: '2026-07-20T00:00:00.000Z', to: '2026-08-18T23:59:59.999Z' },
      totals: {
        todayTokens: 30,
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        pricedEstimatedMicroUsd: 50,
        unpricedCount: 1,
        currency: 'USD',
      },
      series: [{ date: '2026-08-18', inputTokens: 10, outputTokens: 20, totalTokens: 30 }],
      items: [{
        id: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
        projectName: 'Landing page',
        provider: 'google',
        model: 'gemini-2.5-flash',
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        text: {
          provider: 'google',
          model: 'gemini-2.5-flash',
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
          pricing: {
            status: 'unpriced',
            reason: 'unknown_model',
          },
        },
        textPricing: {
          status: 'unpriced',
          reason: 'unknown_model',
        },
        image: null,
        stockCount: 0,
        pricing: {
          status: 'unpriced',
          reason: 'unknown_model',
        },
        createdAt: '2026-08-18T08:00:00.000Z',
      }],
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
    })
    expect(report.items[0]?.pricing.status).toBe('unpriced')
    expect(report).not.toHaveProperty('prompt')
  })
})
