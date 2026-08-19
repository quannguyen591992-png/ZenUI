import { z } from 'zod'

const MICRO_USD_PER_USD = 1_000_000
const TOKENS_PER_RATE_UNIT = 1_000_000

const pricingDefinitionSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  pricingVersion: z.string().min(1),
  effectiveFrom: z.string().datetime(),
  sourceUrl: z.string().url(),
  inputRateMicroUsdPerMillion: z.number().int().nonnegative(),
  outputRateMicroUsdPerMillion: z.number().int().nonnegative(),
  currency: z.literal('USD'),
  maximumInputTokens: z.number().int().positive().optional(),
  minimumInputTokens: z.number().int().nonnegative().optional(),
}).strict()

export type UsagePricingDefinition = z.infer<typeof pricingDefinitionSchema>

const imagePricingDefinitionSchema = pricingDefinitionSchema.extend({
  imageSize: z.literal('1K'),
  documentedOutputTokensPerImage: z.number().int().positive(),
}).strict()

export type ImagePricingDefinition = z.infer<
  typeof imagePricingDefinitionSchema
>

const officialPricingSource = 'https://ai.google.dev/gemini-api/docs/pricing'
const pricingVersion = 'google-gemini-2026-08-13'
const imagePricingVersion = 'google-gemini-image-2026-08-13'
const effectiveFrom = '2026-08-13T00:00:00.000Z'

export const usagePricingCatalog: readonly UsagePricingDefinition[] = [
  {
    provider: 'google-gemini',
    model: 'gemini-3.1-flash-lite',
    pricingVersion,
    effectiveFrom,
    sourceUrl: officialPricingSource,
    inputRateMicroUsdPerMillion: Math.round(0.25 * MICRO_USD_PER_USD),
    outputRateMicroUsdPerMillion: Math.round(1.5 * MICRO_USD_PER_USD),
    currency: 'USD',
  },
  {
    provider: 'google-gemini',
    model: 'gemini-2.5-flash',
    pricingVersion,
    effectiveFrom,
    sourceUrl: officialPricingSource,
    inputRateMicroUsdPerMillion: Math.round(0.3 * MICRO_USD_PER_USD),
    outputRateMicroUsdPerMillion: Math.round(2.5 * MICRO_USD_PER_USD),
    currency: 'USD',
  },
  {
    provider: 'google-gemini',
    model: 'gemini-2.5-flash-lite',
    pricingVersion,
    effectiveFrom,
    sourceUrl: officialPricingSource,
    inputRateMicroUsdPerMillion: Math.round(0.1 * MICRO_USD_PER_USD),
    outputRateMicroUsdPerMillion: Math.round(0.4 * MICRO_USD_PER_USD),
    currency: 'USD',
  },
  {
    provider: 'google-gemini',
    model: 'gemini-2.5-pro',
    pricingVersion,
    effectiveFrom,
    sourceUrl: officialPricingSource,
    inputRateMicroUsdPerMillion: Math.round(1.25 * MICRO_USD_PER_USD),
    outputRateMicroUsdPerMillion: Math.round(10 * MICRO_USD_PER_USD),
    currency: 'USD',
    maximumInputTokens: 200_000,
  },
  {
    provider: 'google-gemini',
    model: 'gemini-2.5-pro',
    pricingVersion,
    effectiveFrom,
    sourceUrl: officialPricingSource,
    inputRateMicroUsdPerMillion: Math.round(2.5 * MICRO_USD_PER_USD),
    outputRateMicroUsdPerMillion: Math.round(15 * MICRO_USD_PER_USD),
    currency: 'USD',
    minimumInputTokens: 200_001,
  },
].map(item => pricingDefinitionSchema.parse(item))

export const imagePricingCatalog: readonly ImagePricingDefinition[] = [{
  provider: 'google-gemini',
  model: 'gemini-3.1-flash-image',
  imageSize: '1K',
  pricingVersion: imagePricingVersion,
  effectiveFrom,
  sourceUrl: officialPricingSource,
  inputRateMicroUsdPerMillion:
    Math.round(0.5 * MICRO_USD_PER_USD),
  outputRateMicroUsdPerMillion:
    Math.round(60 * MICRO_USD_PER_USD),
  documentedOutputTokensPerImage: 1_120,
  currency: 'USD',
}].map(item => imagePricingDefinitionSchema.parse(item))

export function resolveImagePricing(input: {
  provider: string
  model: string
  imageSize: '1K'
  at: Date
}): ImagePricingDefinition | null {
  return imagePricingCatalog.find(item => (
    item.provider === input.provider
    && item.model === input.model
    && item.imageSize === input.imageSize
    && new Date(item.effectiveFrom).getTime()
      <= input.at.getTime()
  )) ?? null
}

export function resolveUsagePricing(input: {
  provider: string
  model: string
  at: Date
  inputTokens?: number
}): UsagePricingDefinition | null {
  const inputTokens = input.inputTokens ?? 0
  return usagePricingCatalog.find(item => (
    item.provider === input.provider
    && item.model === input.model
    && new Date(item.effectiveFrom).getTime() <= input.at.getTime()
    && (item.minimumInputTokens === undefined
      || inputTokens >= item.minimumInputTokens)
    && (item.maximumInputTokens === undefined
      || inputTokens <= item.maximumInputTokens)
  )) ?? null
}

function roundedMicroUsd(tokens: number, rate: number): number {
  if (!Number.isSafeInteger(tokens) || tokens < 0) {
    throw new Error('invalid_token_count')
  }
  if (!Number.isSafeInteger(rate) || rate < 0) {
    throw new Error('invalid_pricing_rate')
  }
  const numerator = BigInt(tokens) * BigInt(rate)
  const divisor = BigInt(TOKENS_PER_RATE_UNIT)
  const rounded = (numerator + divisor / 2n) / divisor
  const result = Number(rounded)
  if (!Number.isSafeInteger(result)) throw new Error('usage_cost_overflow')
  return result
}

export function estimateUsageCost(input: {
  inputTokens: number
  outputTokens: number
  inputRateMicroUsdPerMillion: number
  outputRateMicroUsdPerMillion: number
}) {
  const inputEstimatedMicroUsd = roundedMicroUsd(
    input.inputTokens,
    input.inputRateMicroUsdPerMillion,
  )
  const outputEstimatedMicroUsd = roundedMicroUsd(
    input.outputTokens,
    input.outputRateMicroUsdPerMillion,
  )
  const totalEstimatedMicroUsd = inputEstimatedMicroUsd
    + outputEstimatedMicroUsd
  if (!Number.isSafeInteger(totalEstimatedMicroUsd)) {
    throw new Error('usage_cost_overflow')
  }
  return {
    inputEstimatedMicroUsd,
    outputEstimatedMicroUsd,
    totalEstimatedMicroUsd,
  }
}

export const unpricedUsageSnapshotSchema = z.object({
  status: z.literal('unpriced'),
  reason: z.enum([
    'unknown_model',
    'unsupported_media_cost',
  ]).default('unknown_model'),
}).strict()

const estimatedUsageCostSchema = z.object({
  pricingVersion: z.string().min(1),
  inputRateMicroUsdPerMillion: z.number().int().nonnegative(),
  outputRateMicroUsdPerMillion: z.number().int().nonnegative(),
  inputEstimatedMicroUsd: z.number().int().nonnegative(),
  outputEstimatedMicroUsd: z.number().int().nonnegative(),
  totalEstimatedMicroUsd: z.number().int().nonnegative(),
  currency: z.literal('USD'),
}).strict()

export const pricedUsageSnapshotSchema = estimatedUsageCostSchema.extend({
  status: z.literal('priced'),
}).strict()

export const partialUsageSnapshotSchema = estimatedUsageCostSchema.extend({
  status: z.literal('partial'),
  reason: z.literal('unsupported_media_cost'),
}).strict()

export const usagePricingSnapshotSchema = z.discriminatedUnion('status', [
  pricedUsageSnapshotSchema,
  partialUsageSnapshotSchema,
  unpricedUsageSnapshotSchema,
])

export type UsagePricingSnapshot = z.infer<typeof usagePricingSnapshotSchema>

export const imageGenerationUsageSchema = z.object({
  provider: z.string().min(1).max(100),
  model: z.string().min(1).max(200),
  imageSize: z.literal('1K'),
  imageCount: z.number().int().min(1).max(100),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  tokenSource: z.enum([
    'provider_metadata',
    'documented_fallback',
  ]),
}).strict()

export type ImageGenerationUsage = z.infer<
  typeof imageGenerationUsageSchema
>

const imageCostSchema = imageGenerationUsageSchema.extend({
  pricingVersion: z.string().min(1),
  inputRateMicroUsdPerMillion:
    z.number().int().nonnegative(),
  outputRateMicroUsdPerMillion:
    z.number().int().nonnegative(),
  inputEstimatedMicroUsd: z.number().int().nonnegative(),
  outputEstimatedMicroUsd: z.number().int().nonnegative(),
  totalEstimatedMicroUsd: z.number().int().nonnegative(),
  currency: z.literal('USD'),
}).strict()

export const imagePricingSnapshotSchema = z.discriminatedUnion(
  'status',
  [
    imageCostSchema.extend({
      status: z.literal('priced'),
    }).strict(),
    imageCostSchema.extend({
      status: z.literal('partial'),
      reason: z.literal('missing_image_input_usage'),
    }).strict(),
    imageGenerationUsageSchema.extend({
      status: z.literal('unpriced'),
      reason: z.literal('unknown_image_model'),
    }).strict(),
  ],
)

export type ImagePricingSnapshot = z.infer<
  typeof imagePricingSnapshotSchema
>

export function createImagePricingSnapshot(
  rawInput: ImageGenerationUsage & { at: Date },
): ImagePricingSnapshot {
  const usage = imageGenerationUsageSchema.parse({
    provider: rawInput.provider,
    model: rawInput.model,
    imageSize: rawInput.imageSize,
    imageCount: rawInput.imageCount,
    inputTokens: rawInput.inputTokens,
    outputTokens: rawInput.outputTokens,
    totalTokens: rawInput.totalTokens,
    tokenSource: rawInput.tokenSource,
  })
  const pricing = resolveImagePricing({
    provider: usage.provider,
    model: usage.model,
    imageSize: usage.imageSize,
    at: rawInput.at,
  })
  if (!pricing) {
    return imagePricingSnapshotSchema.parse({
      status: 'unpriced',
      reason: 'unknown_image_model',
      ...usage,
    })
  }
  const outputTokens = usage.tokenSource
    === 'documented_fallback'
    ? usage.imageCount
      * pricing.documentedOutputTokensPerImage
    : usage.outputTokens
  const totalTokens = usage.tokenSource
    === 'documented_fallback'
    ? usage.inputTokens + outputTokens
    : usage.totalTokens
  const cost = estimateUsageCost({
    inputTokens: usage.inputTokens,
    outputTokens,
    inputRateMicroUsdPerMillion:
      pricing.inputRateMicroUsdPerMillion,
    outputRateMicroUsdPerMillion:
      pricing.outputRateMicroUsdPerMillion,
  })
  const snapshot = {
    status: usage.tokenSource === 'documented_fallback'
      ? 'partial' as const
      : 'priced' as const,
    ...(usage.tokenSource === 'documented_fallback'
      ? { reason: 'missing_image_input_usage' as const }
      : {}),
    ...usage,
    outputTokens,
    totalTokens,
    pricingVersion: pricing.pricingVersion,
    inputRateMicroUsdPerMillion:
      pricing.inputRateMicroUsdPerMillion,
    outputRateMicroUsdPerMillion:
      pricing.outputRateMicroUsdPerMillion,
    ...cost,
    currency: pricing.currency,
  }
  return imagePricingSnapshotSchema.parse(snapshot)
}

export function createUsagePricingSnapshot(input: {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  hasUnpricedProviderOperation?: boolean
  at: Date
}): UsagePricingSnapshot {
  const hasRecordedTokenUsage = input.inputTokens > 0
    || input.outputTokens > 0
  if (input.hasUnpricedProviderOperation
    && !hasRecordedTokenUsage) {
    return {
      status: 'unpriced',
      reason: 'unsupported_media_cost',
    }
  }
  const pricing = resolveUsagePricing({
    provider: input.provider,
    model: input.model,
    at: input.at,
    inputTokens: input.inputTokens,
  })
  if (!pricing) {
    return { status: 'unpriced', reason: 'unknown_model' }
  }
  const snapshot = {
    status: input.hasUnpricedProviderOperation
      ? 'partial' as const
      : 'priced' as const,
    ...(input.hasUnpricedProviderOperation
      ? { reason: 'unsupported_media_cost' as const }
      : {}),
    pricingVersion: pricing.pricingVersion,
    inputRateMicroUsdPerMillion: pricing.inputRateMicroUsdPerMillion,
    outputRateMicroUsdPerMillion: pricing.outputRateMicroUsdPerMillion,
    ...estimateUsageCost({
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      inputRateMicroUsdPerMillion: pricing.inputRateMicroUsdPerMillion,
      outputRateMicroUsdPerMillion: pricing.outputRateMicroUsdPerMillion,
    }),
    currency: pricing.currency,
  }
  return input.hasUnpricedProviderOperation
    ? partialUsageSnapshotSchema.parse(snapshot)
    : pricedUsageSnapshotSchema.parse(snapshot)
}

const timezoneSchema = z.string().trim().min(1).max(100).refine(value => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}, 'Invalid IANA timezone')

export const usageListQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
  projectId: z.string().uuid().optional(),
  provider: z.string().trim().min(1).max(100).optional(),
  model: z.string().trim().min(1).max(200).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  timezone: timezoneSchema.default('UTC'),
}).strict()

export type UsageListQuery = z.infer<typeof usageListQuerySchema>

function zonedDateParts(
  date: Date,
  timezone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(part => part.type === type)?.value)
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
  }
}

function zonedMidnightUtc(
  parts: { year: number; month: number; day: number },
  timezone: string,
): Date {
  const target = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
  )
  let candidate = target
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const values = Object.fromEntries(
      formatter.formatToParts(new Date(candidate))
        .filter(part => part.type !== 'literal')
        .map(part => [part.type, Number(part.value)]),
    ) as Record<string, number>
    const represented = Date.UTC(
      values.year!,
      values.month! - 1,
      values.day,
      values.hour,
      values.minute,
      values.second,
    )
    candidate = target - (represented - candidate)
  }
  return new Date(candidate)
}

export function usageDateKey(
  date: Date,
  timezone: string,
): string {
  const parts = zonedDateParts(date, timezone)
  return [
    parts.year.toString().padStart(4, '0'),
    parts.month.toString().padStart(2, '0'),
    parts.day.toString().padStart(2, '0'),
  ].join('-')
}

export function createUsageDateRange(input: {
  days: number
  timezone: string
  now?: Date
}) {
  const query = usageListQuerySchema.pick({
    days: true,
    timezone: true,
  }).safeParse({
    days: input.days,
    timezone: input.timezone,
  })
  if (!query.success) throw new Error('invalid_usage_range')
  const now = input.now ?? new Date()
  if (Number.isNaN(now.getTime())) {
    throw new Error('invalid_usage_range')
  }
  const startParts = zonedDateParts(
    now,
    query.data.timezone,
  )
  const startDate = new Date(Date.UTC(
    startParts.year,
    startParts.month - 1,
    startParts.day - query.data.days + 1,
  ))
  const from = zonedMidnightUtc({
    year: startDate.getUTCFullYear(),
    month: startDate.getUTCMonth() + 1,
    day: startDate.getUTCDate(),
  }, query.data.timezone)
  return {
    days: query.data.days,
    timezone: query.data.timezone,
    from: from.toISOString(),
    to: now.toISOString(),
  }
}

const combinedUsagePricingSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('priced'),
    totalEstimatedMicroUsd: z.number().int().nonnegative(),
    currency: z.literal('USD'),
  }).strict(),
  z.object({
    status: z.literal('partial'),
    reason: z.enum([
      'unknown_model',
      'unsupported_media_cost',
      'missing_image_input_usage',
      'unknown_image_model',
      'heterogeneous_image_usage',
    ]),
    totalEstimatedMicroUsd: z.number().int().nonnegative(),
    currency: z.literal('USD'),
  }).strict(),
  z.object({
    status: z.literal('unpriced'),
    reason: z.enum([
      'unknown_model',
      'unsupported_media_cost',
      'missing_image_input_usage',
      'unknown_image_model',
      'heterogeneous_image_usage',
    ]),
  }).strict(),
])

const reportTextUsageSchema = z.object({
  provider: z.string().min(1).max(100),
  model: z.string().min(1).max(200),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  pricing: usagePricingSnapshotSchema,
}).strict()

const reportImageUsageSchema = imageGenerationUsageSchema.extend({
  stockCount: z.number().int().nonnegative(),
  pricing: imagePricingSnapshotSchema,
}).strict()

export const usageReportSchema = z.object({
  range: z.object({
    days: z.number().int().min(1).max(90),
    timezone: timezoneSchema,
    from: z.string().datetime(),
    to: z.string().datetime(),
  }).strict(),
  totals: z.object({
    todayTokens: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    pricedEstimatedMicroUsd: z.number().int().nonnegative(),
    unpricedCount: z.number().int().nonnegative(),
    currency: z.literal('USD'),
  }).strict(),
  series: z.array(z.object({
    date: z.iso.date(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  }).strict()).max(90),
  items: z.array(z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    projectName: z.string().trim().min(1).max(100),
    provider: z.string().min(1).max(100),
    model: z.string().min(1).max(200),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    text: reportTextUsageSchema.nullable(),
    textPricing: usagePricingSnapshotSchema,
    image: reportImageUsageSchema.nullable(),
    stockCount: z.number().int().nonnegative(),
    pricing: combinedUsagePricingSchema,
    createdAt: z.string().datetime(),
  }).strict()).max(100),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
}).strict()

export type UsageReport = z.infer<typeof usageReportSchema>
