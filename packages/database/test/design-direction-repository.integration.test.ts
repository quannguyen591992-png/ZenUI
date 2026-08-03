import { PGlite } from '@electric-sql/pglite'
import {
  materializeDesignDirections,
  type DesignDirectionContentBlueprint,
  type WebsiteBrief,
} from '@zenui/ai-core'
import { createValidDesignFixture } from '@zenui/design-schema'
import { drizzle } from 'drizzle-orm/pglite'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  createDesignDirectionRepository,
  createProjectRepository,
  migrateTestDatabase,
} from '../src/index'
import * as schema from '../src/schema'

const owner = { userId: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222' }
const outsider = { userId: '33333333-3333-4333-8333-333333333333', workspaceId: '44444444-4444-4444-8444-444444444444' }
const usage = { inputTokens: 80, outputTokens: 120, totalTokens: 200 }

const brief: WebsiteBrief = {
  description: 'NovaFlow giúp các nhóm sản phẩm nhỏ lên kế hoạch ra mắt rõ ràng.',
  offer: 'Không gian lập kế hoạch ra mắt sản phẩm',
  audience: 'Nhóm sản phẩm nhỏ chuẩn bị lần ra mắt đầu tiên',
  primaryGoal: 'Nhận yêu cầu đặt lịch tư vấn phù hợp',
  cta: 'Đặt lịch tư vấn',
  tone: 'Rõ ràng, tự tin và hiện đại',
  brandDetails: 'NovaFlow, xanh chàm',
  mustHaveSections: ['introduction', 'benefits', 'trust', 'faq', 'contact'],
}

const blueprint: DesignDirectionContentBlueprint = {
  version: 1,
  language: 'vi',
  pagePreset: 'saas',
  brand: 'NovaFlow',
  announcement: 'Lập kế hoạch ra mắt nhẹ nhàng hơn',
  navLabels: ['Lợi ích', 'Kết quả', 'Câu hỏi'],
  heroBadge: 'Cho nhóm sản phẩm nhỏ',
  heroHeading: 'Lập kế hoạch cho mọi lần ra mắt một cách rõ ràng',
  heroParagraph: 'Giữ mục tiêu, quyết định và cột mốc trong một kế hoạch mà cả nhóm đều hiểu.',
  heroSecondaryCta: 'Xem cách hoạt động',
  heroProof: 'Một kế hoạch chung từ ý tưởng đến ngày ra mắt',
  heroImage: {
    query: 'product team planning launch workspace',
    alt: 'Nhóm sản phẩm cùng lập kế hoạch ra mắt',
  },
  contentImages: [
    { slot: 'feature-1', query: 'product launch roadmap board', alt: 'Bảng lộ trình ra mắt sản phẩm' },
    { slot: 'feature-2', query: 'team reviewing launch milestones', alt: 'Nhóm xem lại các cột mốc' },
    { slot: 'feature-3', query: 'collaborative launch handoff', alt: 'Bàn giao kế hoạch ra mắt' },
  ],
  logos: ['Acme', 'Orbit', 'Luma'],
  statsHeading: 'Đà tiến có thể nhìn thấy',
  stats: [{ value: '1', label: 'kế hoạch chung' }, { value: '24/7', label: 'ngữ cảnh sẵn sàng' }, { value: '5', label: 'bước rõ ràng' }],
  featuresHeading: 'Thay công việc rời rạc bằng đà tiến chung',
  featuresParagraph: 'NovaFlow giữ mọi quyết định quan trọng trong một câu chuyện dễ theo dõi.',
  features: [
    { icon: 'check', heading: 'Một câu chuyện ra mắt', paragraph: 'Giữ mục tiêu và cột mốc trong một kế hoạch dễ hiểu.' },
    { icon: 'star', heading: 'Bước tiếp theo rõ ràng', paragraph: 'Biết điều gì cần được xử lý tiếp theo.' },
    { icon: 'arrow-right', heading: 'Bàn giao tự tin', paragraph: 'Trao đủ ngữ cảnh cho mọi thành viên.' },
  ],
  testimonialsHeading: 'Kế hoạch mà cả nhóm đều theo dõi được',
  testimonials: [
    { quote: 'Cả nhóm cuối cùng cũng nhìn cùng một kế hoạch.', name: 'Linh Nguyễn', role: 'Trưởng nhóm sản phẩm' },
    { quote: 'Chúng tôi dành ít thời gian hỏi tiến độ hơn.', name: 'Minh Trần', role: 'Nhà sáng lập' },
  ],
  pricingHeading: 'Chọn cách bắt đầu phù hợp',
  pricingParagraph: 'Bắt đầu nhỏ và mở rộng khi đội ngũ sẵn sàng.',
  plans: [
    { name: 'Khởi đầu', price: 'Miễn phí', description: 'Cho lần ra mắt đầu tiên.', features: ['Một kế hoạch', 'Hướng dẫn cơ bản'], highlighted: false },
    { name: 'Phát triển', price: '499.000đ/tháng', description: 'Cho đội ngũ đang tăng trưởng.', features: ['Nhiều kế hoạch', 'Hỗ trợ ưu tiên'], highlighted: true },
  ],
  faqHeading: 'Điều cần biết trước khi bắt đầu',
  faqs: [
    { question: 'Có thể bắt đầu với một lần ra mắt không?', answer: 'Có. Hãy bắt đầu với kế hoạch đang hoạt động.' },
    { question: 'Đội ngũ có cần đào tạo không?', answer: 'Không. Mọi bước đều được hướng dẫn rõ ràng.' },
    { question: 'Có thể giữ quy trình hiện tại không?', answer: 'Có. Giữ phần đang hiệu quả và đơn giản hóa phần còn lại.' },
  ],
  finalCtaHeading: 'Trao cho lần ra mắt tiếp theo một lộ trình rõ ràng',
  finalCtaParagraph: 'Bắt đầu với một kế hoạch mà cả nhóm có thể tin tưởng.',
  footerTagline: 'Lập kế hoạch ra mắt có hướng dẫn cho các nhóm tập trung.',
  copyright: '© 2026 NovaFlow.',
  sectionOrder: ['logo-cloud', 'stats', 'features', 'testimonials', 'faq', 'final-cta', 'footer'],
}

describe('workspace-scoped Stage 5 design direction repository', () => {
  let client: PGlite

  beforeEach(async () => {
    client = new PGlite()
    await migrateTestDatabase(client)
    await client.exec(`
      INSERT INTO users (id, name, email) VALUES
        ('${owner.userId}', 'Owner', 'owner@example.test'),
        ('${outsider.userId}', 'Outsider', 'outsider@example.test');
      INSERT INTO workspaces (id, name, created_by) VALUES
        ('${owner.workspaceId}', 'Owner Workspace', '${owner.userId}'),
        ('${outsider.workspaceId}', 'Other Workspace', '${outsider.userId}');
      INSERT INTO workspace_members (workspace_id, user_id, role) VALUES
        ('${owner.workspaceId}', '${owner.userId}', 'owner'),
        ('${outsider.workspaceId}', '${outsider.userId}', 'owner');
    `)
  })

  async function setup() {
    const db = drizzle(client, { schema })
    const project = await createProjectRepository(db).create(owner, {
      name: 'NovaFlow',
      document: createValidDesignFixture(),
      creationState: 'onboarding',
    })
    return { db, project, projects: createProjectRepository(db), directions: createDesignDirectionRepository(db) }
  }

  function directionDocuments() {
    const result = materializeDesignDirections({ brief, blueprint, current: createValidDesignFixture(), round: 0 })
    if (!result.accepted) throw new Error(result.code)
    return result.directions
  }

  it('preserves existing projects as accepted and supports explicit onboarding project creation', async () => {
    const db = drizzle(client, { schema })
    const projects = createProjectRepository(db)
    const existing = await projects.create(owner, { name: 'Existing', document: createValidDesignFixture() })
    const onboarding = await projects.create(owner, {
      name: 'New guided project', document: createValidDesignFixture(), creationState: 'onboarding',
    })

    expect(existing.creationState).toBe('accepted')
    expect(onboarding.creationState).toBe('onboarding')
  })

  it('saves an editable brief and creates an idempotent tenant-scoped queued run', async () => {
    const { project, directions } = await setup()
    await expect(directions.saveBrief(owner, project.id, brief)).resolves.toEqual(brief)
    const input = { requestId: crypto.randomUUID(), expectedVersion: 1, brief, round: 0 }
    const first = await directions.create(owner, project.id, input)
    const duplicate = await directions.create(owner, project.id, input)

    expect(duplicate.id).toBe(first.id)
    expect(first).toMatchObject({ status: 'queued', expectedVersion: 1, round: 0 })
    expect(await directions.findById(outsider, first.id)).toBeNull()
    expect(await directions.getWorkerInput(outsider, first.id)).toBeNull()
    expect(await directions.loadBrief(owner, project.id)).toEqual(brief)
  })

  it('completes transient directions without changing document version or project history', async () => {
    const { project, projects, directions } = await setup()
    const run = await directions.create(owner, project.id, {
      requestId: crypto.randomUUID(), expectedVersion: 1, brief, round: 0,
    })
    expect(await directions.claim(owner, run.id, { provider: 'mock', model: 'mock-v1', promptVersion: 'directions-v1' }))
      .toMatchObject({ status: 'running' })
    expect(await directions.complete(owner, run.id, {
      blueprint,
      directions: directionDocuments(),
      usage,
    })).toMatchObject({ accepted: true, run: { status: 'completed' } })

    expect((await projects.findById(owner, project.id))?.version).toBe(1)
    expect(await projects.listRevisions(owner, project.id)).toEqual([])
    const visible = await directions.findById(owner, run.id)
    expect(visible?.directions).toHaveLength(3)
    expect(visible).not.toHaveProperty('brief')
    expect(visible).not.toHaveProperty('blueprint')
  })

  it('chooses exactly one direction atomically and keeps unchosen drafts out of history', async () => {
    const { project, projects, directions } = await setup()
    const run = await directions.create(owner, project.id, {
      requestId: crypto.randomUUID(), expectedVersion: 1, brief, round: 0,
    })
    await directions.claim(owner, run.id, { provider: 'mock', model: 'mock-v1', promptVersion: 'directions-v1' })
    const generated = directionDocuments()
    const completed = await directions.complete(owner, run.id, { blueprint, directions: generated, usage })
    expect(completed.accepted).toBe(true)

    const chosen = await directions.accept(owner, project.id, run.id, generated[1]!.id)
    const duplicate = await directions.accept(owner, project.id, run.id, generated[1]!.id)

    expect(chosen).toMatchObject({ accepted: true, version: 2, directionId: generated[1]!.id })
    expect(duplicate).toEqual(chosen)
    expect((await projects.findById(owner, project.id))?.creationState).toBe('accepted')
    const revisions = await projects.listRevisions(owner, project.id)
    expect(revisions).toHaveLength(1)
    expect(revisions[0]).toMatchObject({ source: 'ai' })
    expect((await projects.findById(owner, project.id))?.document.theme.colors.primary)
      .toBe(generated[1]!.document.theme.colors.primary)
  })

  it('cancels or supersedes safely and rejects stale/foreign direction acceptance', async () => {
    const { project, directions } = await setup()
    const cancelled = await directions.create(owner, project.id, {
      requestId: crypto.randomUUID(), expectedVersion: 1, brief, round: 0,
    })
    expect(await directions.cancel(owner, cancelled.id)).toMatchObject({ status: 'cancelled' })
    expect(await directions.claim(owner, cancelled.id, { provider: 'mock', model: 'mock-v1', promptVersion: 'directions-v1' })).toBeNull()

    const stale = await directions.create(owner, project.id, {
      requestId: crypto.randomUUID(), expectedVersion: 1, brief, round: 1,
    })
    await directions.claim(owner, stale.id, { provider: 'mock', model: 'mock-v1', promptVersion: 'directions-v1' })
    const generated = directionDocuments()
    await directions.complete(owner, stale.id, { blueprint, directions: generated, usage })
    expect(await directions.supersede(owner, stale.id)).toMatchObject({ status: 'superseded' })
    expect(await directions.accept(owner, project.id, stale.id, generated[0]!.id))
      .toEqual({ accepted: false, code: 'run_not_selectable' })
    expect(await directions.accept(outsider, project.id, stale.id, generated[0]!.id))
      .toEqual({ accepted: false, code: 'not_found' })
  })

  it('fails closed for malformed brief, creation, claim, output and failure inputs', async () => {
    const { project, projects, directions } = await setup()
    await expect(directions.saveBrief(owner, project.id, {})).rejects.toThrow('invalid_website_brief')
    await expect(directions.saveBrief(owner, crypto.randomUUID(), brief)).rejects.toThrow('not_found')
    expect(await directions.loadBrief(owner, crypto.randomUUID())).toBeNull()
    expect(await directions.loadBrief(owner, project.id)).toBeNull()

    await expect(directions.create(owner, project.id, {
      requestId: 'not-a-uuid', expectedVersion: 1, brief, round: 0,
    })).rejects.toThrow('invalid_design_direction_input')
    await expect(directions.create(owner, project.id, {
      requestId: crypto.randomUUID(), expectedVersion: 2, brief, round: 0,
    })).rejects.toThrow('stale_document_version')

    const accepted = await projects.create(owner, { name: 'Accepted', document: createValidDesignFixture() })
    await expect(directions.create(owner, accepted.id, {
      requestId: crypto.randomUUID(), expectedVersion: 1, brief, round: 0,
    })).rejects.toThrow('project_already_accepted')

    const run = await directions.create(owner, project.id, {
      requestId: crypto.randomUUID(), expectedVersion: 1, brief, round: 0,
    })
    expect(await directions.claim(owner, run.id, { provider: '', model: '', promptVersion: '' })).toBeNull()
    expect(await directions.getWorkerInput(owner, crypto.randomUUID())).toBeNull()
    expect(await directions.complete(owner, crypto.randomUUID(), {
      blueprint, directions: directionDocuments(), usage,
    })).toEqual({ accepted: false, code: 'not_found' })
    expect(await directions.complete(owner, run.id, {
      blueprint: {}, directions: directionDocuments(), usage,
    })).toEqual({ accepted: false, code: 'invalid_output' })
    expect(await directions.complete(owner, run.id, {
      blueprint, directions: [], usage,
    })).toEqual({ accepted: false, code: 'invalid_output' })
    expect(await directions.fail(owner, run.id, { errorCode: 'unknown', usage })).toBeNull()
    expect(await directions.fail(owner, run.id, {
      errorCode: 'provider_error', usage: { inputTokens: -1, outputTokens: 0, totalTokens: 0 },
    })).toBeNull()
    expect(await directions.fail(owner, run.id, { errorCode: 'provider_error', usage }))
      .toMatchObject({ status: 'failed', errorCode: 'provider_error' })
    expect(await directions.fail(owner, run.id, { errorCode: 'provider_error', usage })).toBeNull()
  })

  it('rejects missing directions and a different duplicate acceptance choice', async () => {
    const { project, directions } = await setup()
    const run = await directions.create(owner, project.id, {
      requestId: crypto.randomUUID(), expectedVersion: 1, brief, round: 0,
    })
    await directions.claim(owner, run.id, { provider: 'mock', model: 'mock-v1', promptVersion: 'directions-v1' })
    const generated = directionDocuments()
    await directions.complete(owner, run.id, { blueprint, directions: generated, usage })

    expect(await directions.accept(owner, project.id, run.id, 'missing-direction'))
      .toEqual({ accepted: false, code: 'direction_not_found' })
    expect(await directions.accept(owner, project.id, run.id, generated[0]!.id))
      .toMatchObject({ accepted: true, directionId: generated[0]!.id })
    expect(await directions.accept(owner, project.id, run.id, generated[1]!.id))
      .toEqual({ accepted: false, code: 'run_not_selectable' })
  })
})
