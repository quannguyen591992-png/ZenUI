import {
  designDirectionContentBlueprintSchema,
  designDirectionGenerationPlanSchema,
  runDesignDirectionGeneration,
  type DesignDirectionContentBlueprint,
  type DesignDirectionPresetId,
  type WebsiteBrief,
} from '@zenui/ai-core'
import {
  createDesignDirectionRepository,
  createProjectRepository,
  workspaceMembers,
} from '@zenui/database'
import { Queue } from 'bullmq'
import { and, eq } from 'drizzle-orm'
import IORedis from 'ioredis'

import {
  createRedisAdmissionGate,
  createRedisDesignDirectionQueue,
} from './ai-infrastructure'
import { getDatabase } from './database'
import { isE2eRuntimeEnabled, recordE2eDirectionProviderCall } from './e2e-runtime'
import { getRuntimeSession } from './runtime-session'

import type { DesignDirectionApiDependencies } from './design-direction-api'

export const DESIGN_DIRECTION_QUEUE_NAME = 'zenui-design-directions-v1'
let redis: IORedis | undefined
let queue: Queue | undefined

function integer(name: string, fallback: number, min: number, max: number): number {
  const value = process.env[name]
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${name} is invalid`)
  return parsed
}

function deterministicContentBlueprint(brief: WebsiteBrief): DesignDirectionContentBlueprint {
  const isVietnamese = /[ăâđêôơưĂÂĐÊÔƠƯ]|[àáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/i.test(
    [brief.description, brief.offer, brief.audience, brief.cta].join(' '),
  )
  const navigation = [
    { text: isVietnamese ? 'Lợi ích' : 'Benefits', target: 'features' },
    ...(brief.mustHaveSections.includes('trust')
      ? [{ text: isVietnamese ? 'Kết quả' : 'Results', target: 'testimonials' }]
      : []),
    ...(brief.mustHaveSections.includes('pricing')
      ? [{ text: isVietnamese ? 'Bảng giá' : 'Pricing', target: 'pricing' }]
      : []),
    ...(brief.mustHaveSections.includes('faq')
      ? [{ text: isVietnamese ? 'Câu hỏi' : 'Questions', target: 'faq' }]
      : []),
    { text: isVietnamese ? 'Bắt đầu' : 'Get started', target: 'final-cta' },
  ]
  return designDirectionContentBlueprintSchema.parse({
    version: 2,
    language: isVietnamese ? 'vi' : 'en',
    pagePreset: 'saas',
    brand: brief.offer.split(/\s+/).slice(0, 3).join(' '),
    announcement: isVietnamese ? 'Một cách rõ ràng hơn để bắt đầu' : 'A clearer way to get started',
    navigation,
    heroBadge: brief.tone,
    heroHeading: isVietnamese ? `Biến ${brief.offer.toLowerCase()} thành kết quả rõ ràng` : `Turn ${brief.offer.toLowerCase()} into a clear result`,
    heroParagraph: isVietnamese ? `${brief.offer}. Dành cho ${brief.audience.toLowerCase()}.` : `${brief.offer}. Built for ${brief.audience.toLowerCase()}.`,
    heroSecondaryCta: isVietnamese ? 'Xem cách hoạt động' : 'See how it works',
    heroProof: brief.primaryGoal,
    heroImage: {
      query: isVietnamese ? 'team collaborating artificial intelligence course' : 'professional team collaborating workspace',
      alt: isVietnamese ? 'Nhóm học viên cùng thực hành trong khóa học' : 'Professional team collaborating in a shared workspace',
    },
    contentImages: isVietnamese
      ? [
          { slot: 'feature-1', query: 'team clarifying audience value', alt: 'Nhóm làm rõ giá trị dành cho người xem' },
          { slot: 'feature-2', query: 'customers reviewing trusted results', alt: 'Khách hàng xem lại những kết quả đáng tin cậy' },
          { slot: 'feature-3', query: 'customer taking a clear next step', alt: 'Khách hàng thực hiện bước tiếp theo rõ ràng' },
        ]
      : [
          { slot: 'feature-1', query: 'team clarifying audience value', alt: 'Team clarifying value for its audience' },
          { slot: 'feature-2', query: 'customers reviewing trusted results', alt: 'Customers reviewing trusted results' },
          { slot: 'feature-3', query: 'customer taking a clear next step', alt: 'Customer taking a clear next step' },
        ],
    logos: ['Acme', 'Orbit', 'Luma'],
    statsHeading: isVietnamese ? 'Giá trị có thể nhìn thấy' : 'Value your audience can see',
    stats: isVietnamese
      ? [{ value: '1', label: 'mục tiêu rõ ràng' }, { value: '3', label: 'bước dễ hiểu' }, { value: '24/7', label: 'thông tin sẵn sàng' }]
      : [{ value: '1', label: 'clear goal' }, { value: '3', label: 'simple steps' }, { value: '24/7', label: 'available information' }],
    featuresHeading: isVietnamese ? 'Làm rõ giá trị cho đúng người xem' : 'Make the value clear to the right audience',
    featuresParagraph: brief.primaryGoal,
    features: isVietnamese
      ? [
          { icon: 'check', heading: 'Giá trị rõ ràng', paragraph: 'Giải thích điều người xem nhận được bằng ngôn ngữ dễ hiểu.' },
          { icon: 'star', heading: 'Bằng chứng phù hợp', paragraph: 'Xây dựng niềm tin trước khi mời người xem hành động.' },
          { icon: 'arrow-right', heading: 'Bước tiếp theo', paragraph: `Dẫn người xem tới hành động ${brief.cta}.` },
        ]
      : [
          { icon: 'check', heading: 'Clear value', paragraph: 'Explain the outcome in language the audience understands.' },
          { icon: 'star', heading: 'Relevant proof', paragraph: 'Build trust before asking visitors to act.' },
          { icon: 'arrow-right', heading: 'A clear next step', paragraph: `Guide visitors toward ${brief.cta}.` },
        ],
    testimonialsHeading: isVietnamese ? 'Niềm tin từ những người phù hợp' : 'Trust from the right people',
    testimonials: isVietnamese
      ? [{ quote: 'Thông điệp trở nên rõ ràng ngay từ lần xem đầu tiên.', name: 'Linh Nguyễn', role: 'Khách hàng mẫu' }, { quote: 'Tôi biết chính xác bước tiếp theo cần làm.', name: 'Minh Trần', role: 'Khách hàng mẫu' }]
      : [{ quote: 'The value was clear from the first visit.', name: 'Maya Chen', role: 'Sample customer' }, { quote: 'I knew exactly what to do next.', name: 'Jordan Lee', role: 'Sample customer' }],
    pricingHeading: isVietnamese ? 'Một cách bắt đầu phù hợp' : 'A plan that fits the next step',
    pricingParagraph: isVietnamese ? 'Chọn mức hỗ trợ phù hợp với nhu cầu hiện tại.' : 'Choose the level of support that matches the current need.',
    plans: isVietnamese
      ? [{ name: 'Khởi đầu', price: 'Miễn phí', description: 'Để bắt đầu.', features: ['Giá trị cốt lõi', 'Hướng dẫn cơ bản'], highlighted: false }, { name: 'Phát triển', price: 'Liên hệ', description: 'Để tiến xa hơn.', features: ['Hỗ trợ đầy đủ', 'Ưu tiên'], highlighted: true }]
      : [{ name: 'Starter', price: 'Free', description: 'For getting started.', features: ['Core value', 'Basic guidance'], highlighted: false }, { name: 'Growth', price: 'Contact us', description: 'For moving further.', features: ['Full support', 'Priority'], highlighted: true }],
    faqHeading: isVietnamese ? 'Điều cần biết trước khi bắt đầu' : 'What to know before getting started',
    faqs: isVietnamese
      ? [{ question: 'Tôi có thể bắt đầu ngay không?', answer: 'Có. Hãy bắt đầu với nhu cầu quan trọng nhất.' }, { question: 'Tôi có cần kỹ năng kỹ thuật không?', answer: 'Không. Mọi bước đều được trình bày rõ ràng.' }, { question: 'Tôi có thể thay đổi sau không?', answer: 'Có. Nội dung vẫn có cấu trúc và chỉnh sửa được.' }]
      : [{ question: 'Can I start now?', answer: 'Yes. Begin with the most important need.' }, { question: 'Do I need technical skills?', answer: 'No. Every step is presented clearly.' }, { question: 'Can I change it later?', answer: 'Yes. The content remains structured and editable.' }],
    finalCtaHeading: isVietnamese ? `Sẵn sàng ${brief.cta.toLowerCase()}?` : `Ready to ${brief.cta.toLowerCase()}?`,
    finalCtaParagraph: brief.primaryGoal,
    footerTagline: brief.offer,
    copyright: `© 2026 ${brief.offer.split(/\s+/).slice(0, 3).join(' ')}.`,
    sectionOrder: ['logo-cloud', 'stats', 'features', 'testimonials', 'pricing', 'faq', 'final-cta', 'footer'],
  })
}

const deterministicPresetSets = [
  ['calm-clarity', 'bold-launch', 'proof-command'],
  ['precise-editorial', 'friendly-guide', 'vivid-product'],
  ['focused-conversion', 'human-momentum', 'decisive-proof'],
  ['editorial-story', 'clear-momentum', 'trusted-advisor'],
] as const satisfies readonly (readonly DesignDirectionPresetId[])[]

function deterministicGenerationPlan(
  brief: WebsiteBrief,
  round: number,
  excludedPresetIds: readonly DesignDirectionPresetId[],
) {
  const content = deterministicContentBlueprint(brief)
  const excluded = new Set(excludedPresetIds)
  const preferredSet = deterministicPresetSets[((round % deterministicPresetSets.length) + deterministicPresetSets.length) % deterministicPresetSets.length]!
  const presetIds = [...preferredSet, ...deterministicPresetSets.flat()]
    .filter((id, index, values) => !excluded.has(id) && values.indexOf(id) === index)
    .slice(0, 3)
  return designDirectionGenerationPlanSchema.parse({
    version: 'design-directions-v2',
    content,
    directions: presetIds.map(presetId => ({ presetId })),
  })
}

export function createDesignDirectionRouteDependencies(): DesignDirectionApiDependencies {
  const database = getDatabase()
  const projects = createProjectRepository(database)
  const directions = createDesignDirectionRepository(database)
  const trustedOrigin = process.env.APP_ORIGIN
  if (!trustedOrigin) throw new Error('APP_ORIGIN is required')

  const findMembership = async (userId: string, workspaceId: string) => {
    const [membership] = await database.select({
      userId: workspaceMembers.userId,
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
    }).from(workspaceMembers).where(and(
      eq(workspaceMembers.userId, userId),
      eq(workspaceMembers.workspaceId, workspaceId),
    )).limit(1)
    return membership ?? null
  }

  if (isE2eRuntimeEnabled()) {
    return {
      trustedOrigin,
      getSession: getRuntimeSession,
      findMembership,
      findProject: (context, projectId) => projects.findById(context, projectId),
      admission: { acquire: () => Promise.resolve({ accepted: true }) },
      directions,
      queue: {
        enqueue(job) {
          queueMicrotask(() => {
            void (async () => {
              const context = { userId: job.userId, workspaceId: job.workspaceId }
              const input = await directions.getWorkerInput(context, job.designDirectionRunId)
              if (!input) return
              const claimed = await directions.claim(context, input.id, {
                provider: 'mock', model: 'mock-directions-v2', promptVersion: 'directions-v2',
              })
              if (!claimed) return
              const provider = {
                name: 'mock',
                model: 'mock-directions-v2',
                generateContentBlueprint: () => {
                  recordE2eDirectionProviderCall()
                  return Promise.resolve({
                    output: deterministicGenerationPlan(
                      input.brief,
                      input.round,
                      input.previousDirectionIds,
                    ),
                    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
                  })
                },
              }
              const result = await runDesignDirectionGeneration({
                provider,
                brief: input.brief,
                current: input.document,
                round: input.round,
                excludedPresetIds: input.previousDirectionIds,
              })
              if (!result.accepted) {
                await directions.fail(context, input.id, { errorCode: result.code, usage: result.usage })
                return
              }
              await directions.complete(context, input.id, {
                blueprint: result.blueprint, directions: result.directions, usage: result.usage,
              })
            })()
          })
          return Promise.resolve()
        },
      },
      pollIntervalMs: 10,
      heartbeatMs: 1_000,
    }
  }

  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) throw new Error('REDIS_URL is required')
  redis ??= new IORedis(redisUrl, { maxRetriesPerRequest: 1 })
  queue ??= new Queue(DESIGN_DIRECTION_QUEUE_NAME, { connection: redis })
  return {
    trustedOrigin,
    getSession: getRuntimeSession,
    findMembership,
    findProject: (context, projectId) => projects.findById(context, projectId),
    admission: createRedisAdmissionGate(redis, {
      userRunsPerMinute: integer('AI_USER_RUNS_PER_MINUTE', 4, 1, 100),
      workspaceRunsPerMinute: integer('AI_WORKSPACE_RUNS_PER_MINUTE', 20, 1, 500),
      workspaceDailyTokens: integer('AI_WORKSPACE_DAILY_TOKENS', 1_000_000, 1_000, 100_000_000),
    }),
    directions,
    queue: createRedisDesignDirectionQueue(queue),
    pollIntervalMs: 500,
    heartbeatMs: 15_000,
  }
}
