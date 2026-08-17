import { createValidDesignFixture } from '@zenui/design-schema'
import { describe, expect, it, vi } from 'vitest'

import {
  designDirectionContentBlueprintJsonSchema,
  designDirectionContentBlueprintSchema,
  designDirectionGenerationPlanJsonSchema,
  designDirectionGenerationPlanSchema,
  designDirectionJobSchema,
  designDirectionRunErrorCodeSchema,
  designDirectionRunStatusSchema,
  guidedDesignSystemWarnings,
  materializeDesignDirections,
  normalizeWebsiteBrief,
  prefillWebsiteBrief,
  resolveDesignDirectionPresetIds,
  runDesignDirectionGeneration,
  websiteBriefSchema,
  type DesignDirectionContentBlueprint,
  type WebsiteBrief,
} from '../src/index.js'

const vietnameseBrief: WebsiteBrief = {
  description: 'NovaFlow giúp các nhóm sản phẩm nhỏ lên kế hoạch ra mắt rõ ràng hơn.',
  offer: 'Không gian lập kế hoạch ra mắt sản phẩm',
  audience: 'Nhóm sản phẩm nhỏ đang chuẩn bị lần ra mắt đầu tiên',
  primaryGoal: 'Nhận yêu cầu đặt lịch tư vấn phù hợp',
  cta: 'Đặt lịch tư vấn',
  tone: 'Rõ ràng, tự tin và hiện đại',
  brandDetails: 'NovaFlow, xanh chàm và nền trung tính ấm',
  mustHaveSections: ['introduction', 'benefits', 'trust', 'faq', 'contact'],
}

const englishBrief: WebsiteBrief = {
  description: 'Atlas helps independent consultants package and sell their expertise.',
  offer: 'A guided course platform for independent consultants',
  audience: 'Independent consultants creating their first online course',
  primaryGoal: 'Collect qualified course waitlist signups',
  cta: 'Join the waitlist',
  tone: 'Warm, credible, and editorial',
  brandDetails: '',
  mustHaveSections: ['introduction', 'benefits', 'pricing', 'faq', 'contact'],
}

const plannedPresetIds = ['calm-clarity', 'bold-launch', 'proof-command'] as const

function content(language: 'vi' | 'en'): DesignDirectionContentBlueprint {
  const vi = language === 'vi'
  return {
    version: 2,
    language,
    pagePreset: vi ? 'saas' : 'course',
    brand: vi ? 'NovaFlow' : 'Atlas Course',
    announcement: vi ? 'Lập kế hoạch ra mắt nhẹ nhàng hơn' : 'Turn your expertise into a clear course',
    navigation: vi
      ? [
          { text: 'Lợi ích', target: 'features' },
          { text: 'Kết quả', target: 'testimonials' },
          { text: 'Câu hỏi', target: 'faq' },
        ]
      : [
          { text: 'Benefits', target: 'features' },
          { text: 'Pricing', target: 'pricing' },
          { text: 'Questions', target: 'faq' },
        ],
    heroBadge: vi ? 'Cho nhóm sản phẩm nhỏ' : 'For independent consultants',
    heroHeading: vi ? 'Lập kế hoạch cho mọi lần ra mắt một cách rõ ràng' : 'Build a course people are ready to buy',
    heroParagraph: vi
      ? 'Giữ mục tiêu, quyết định và cột mốc trong một kế hoạch mà cả nhóm đều hiểu.'
      : 'Package your expertise into a guided learning experience with a clear path to launch.',
    heroSecondaryCta: vi ? 'Xem cách hoạt động' : 'See how it works',
    heroProof: vi ? 'Một kế hoạch chung từ ý tưởng đến ngày ra mắt' : 'A focused path from expertise to enrollment',
    heroImage: {
      query: vi ? 'product team planning launch workspace' : 'consultant teaching online course',
      alt: vi ? 'Nhóm sản phẩm cùng lập kế hoạch ra mắt' : 'Consultant teaching an online course',
    },
    contentImages: [
      {
        slot: 'feature-1',
        query: vi ? 'product launch roadmap planning board' : 'consultant planning online course curriculum',
        alt: vi ? 'Bảng lộ trình ra mắt sản phẩm' : 'Consultant planning an online course curriculum',
      },
      {
        slot: 'feature-2',
        query: vi ? 'product team reviewing launch milestones' : 'online instructor reviewing student progress',
        alt: vi ? 'Nhóm sản phẩm xem lại các cột mốc' : 'Online instructor reviewing student progress',
      },
      {
        slot: 'feature-3',
        query: vi ? 'collaborative product launch handoff' : 'consultant launching a digital course',
        alt: vi ? 'Nhóm cộng tác bàn giao kế hoạch ra mắt' : 'Consultant launching a digital course',
      },
    ],
    logos: ['Acme', 'Orbit', 'Luma'],
    statsHeading: vi ? 'Đà tiến có thể nhìn thấy' : 'A simpler path to launch',
    stats: vi
      ? [{ value: '1', label: 'kế hoạch chung' }, { value: '24/7', label: 'ngữ cảnh sẵn sàng' }, { value: '5', label: 'bước rõ ràng' }]
      : [{ value: '1', label: 'clear offer' }, { value: '5', label: 'guided modules' }, { value: '24/7', label: 'student access' }],
    featuresHeading: vi ? 'Thay công việc rời rạc bằng đà tiến chung' : 'Turn expertise into a course with momentum',
    featuresParagraph: vi ? 'NovaFlow giữ mọi quyết định quan trọng trong một câu chuyện dễ theo dõi.' : 'Atlas guides the offer, learning path, and launch without technical setup.',
    features: vi
      ? [
          { icon: 'check', heading: 'Một câu chuyện ra mắt', paragraph: 'Giữ mục tiêu và cột mốc trong một kế hoạch dễ hiểu.' },
          { icon: 'star', heading: 'Bước tiếp theo rõ ràng', paragraph: 'Biết điều gì cần được xử lý tiếp theo.' },
          { icon: 'arrow-right', heading: 'Bàn giao tự tin', paragraph: 'Trao đủ ngữ cảnh cho mọi thành viên.' },
        ]
      : [
          { icon: 'check', heading: 'Shape the offer', paragraph: 'Clarify the outcome students are ready to pay for.' },
          { icon: 'star', heading: 'Plan the learning path', paragraph: 'Organize expertise into focused guided modules.' },
          { icon: 'arrow-right', heading: 'Launch with confidence', paragraph: 'Give prospective students one clear next step.' },
        ],
    testimonialsHeading: vi ? 'Kế hoạch mà cả nhóm đều theo dõi được' : 'Trusted by experts building their first course',
    testimonials: vi
      ? [
          { quote: 'Cả nhóm cuối cùng cũng nhìn cùng một kế hoạch.', name: 'Linh Nguyễn', role: 'Trưởng nhóm sản phẩm' },
          { quote: 'Chúng tôi dành ít thời gian hỏi tiến độ hơn.', name: 'Minh Trần', role: 'Nhà sáng lập' },
        ]
      : [
          { quote: 'Atlas made my course offer clear before I recorded anything.', name: 'Maya Chen', role: 'Strategy consultant' },
          { quote: 'The guided path helped me launch without a technical team.', name: 'Jordan Lee', role: 'Independent advisor' },
        ],
    pricingHeading: vi ? 'Chọn cách bắt đầu phù hợp' : 'Start with the support you need',
    pricingParagraph: vi ? 'Bắt đầu nhỏ và mở rộng khi đội ngũ sẵn sàng.' : 'Validate the course first, then grow with confidence.',
    plans: [
      { name: vi ? 'Khởi đầu' : 'Starter', price: vi ? 'Miễn phí' : '$0', description: vi ? 'Cho lần ra mắt đầu tiên.' : 'For validating your first course.', features: vi ? ['Một kế hoạch', 'Hướng dẫn cơ bản'] : ['One course plan', 'Core guidance'], highlighted: false },
      { name: vi ? 'Phát triển' : 'Growth', price: vi ? '499.000đ/tháng' : '$29/month', description: vi ? 'Cho đội ngũ đang tăng trưởng.' : 'For consultants ready to launch.', features: vi ? ['Nhiều kế hoạch', 'Hỗ trợ ưu tiên'] : ['Unlimited plans', 'Priority support'], highlighted: true },
    ],
    faqHeading: vi ? 'Điều cần biết trước khi bắt đầu' : 'Questions before you begin',
    faqs: vi
      ? [
          { question: 'Có thể bắt đầu với một lần ra mắt không?', answer: 'Có. Hãy bắt đầu với kế hoạch đang hoạt động.' },
          { question: 'Đội ngũ có cần đào tạo không?', answer: 'Không. Mọi bước đều được hướng dẫn rõ ràng.' },
          { question: 'Có thể giữ quy trình hiện tại không?', answer: 'Có. Giữ phần đang hiệu quả và đơn giản hóa phần còn lại.' },
        ]
      : [
          { question: 'Do I need to record lessons first?', answer: 'No. Validate the offer and learning path before production.' },
          { question: 'Can I edit the course plan?', answer: 'Yes. Every part remains structured and editable.' },
          { question: 'Do I need technical skills?', answer: 'No. The guided workflow handles the setup.' },
        ],
    finalCtaHeading: vi ? 'Trao cho lần ra mắt tiếp theo một lộ trình rõ ràng' : 'Turn your expertise into a course people want',
    finalCtaParagraph: vi ? 'Bắt đầu với một kế hoạch mà cả nhóm có thể tin tưởng.' : 'Start with a clear offer and a guided path to launch.',
    footerTagline: vi ? 'Lập kế hoạch ra mắt có hướng dẫn cho các nhóm tập trung.' : 'Guided course creation for independent experts.',
    copyright: vi ? '© 2026 NovaFlow.' : '© 2026 Atlas Course.',
    sectionOrder: ['logo-cloud', 'stats', 'features', 'testimonials', 'pricing', 'faq', 'final-cta', 'footer'],
  }
}

function generationPlan(language: 'vi' | 'en') {
  return {
    version: 'design-directions-v2' as const,
    content: content(language),
    directions: plannedPresetIds.map(presetId => ({ presetId })),
  }
}

describe('Stage 5 guided brief and design direction contracts', () => {
  it('validates durable direction run metadata without carrying brief or documents in the queue', () => {
    expect(designDirectionRunStatusSchema.options).toEqual([
      'queued', 'running', 'completed', 'failed', 'cancelled', 'superseded', 'accepted',
    ])
    expect(designDirectionRunErrorCodeSchema.options).toContain('invalid_model_output')
    expect(designDirectionRunErrorCodeSchema.options).toContain('provider_bad_request')
    const job = {
      designDirectionRunId: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
      workspaceId: '33333333-3333-4333-8333-333333333333',
      userId: '44444444-4444-4444-8444-444444444444',
    }
    expect(designDirectionJobSchema.parse(job)).toEqual(job)
    expect(designDirectionJobSchema.safeParse({ ...job, brief: vietnameseBrief }).success).toBe(false)
  })

  it('validates editable Vietnamese and English briefs with required narrative boundaries', () => {
    expect(websiteBriefSchema.safeParse(vietnameseBrief).success).toBe(true)
    expect(websiteBriefSchema.safeParse(englishBrief).success).toBe(true)
    expect(websiteBriefSchema.safeParse({ ...vietnameseBrief, offer: '' }).success).toBe(false)
    expect(websiteBriefSchema.safeParse({
      ...vietnameseBrief,
      mustHaveSections: ['benefits', 'faq'],
    }).success).toBe(false)
  })

  it('prefills a partial brief deterministically without locking direct edits', () => {
    const result = prefillWebsiteBrief('NovaFlow giúp nhóm sản phẩm nhỏ lên kế hoạch ra mắt. Mục tiêu là nhận lịch tư vấn. Hành động chính: Đặt lịch tư vấn.')

    expect(result.description).toContain('NovaFlow')
    expect(result.offer).toContain('NovaFlow')
    expect(result.primaryGoal).toContain('nhận lịch tư vấn')
    expect(result.cta).toBe('Đặt lịch tư vấn')
    expect(result.conversionGoal).toEqual({ type: 'lead_form' })
    expect(result.mustHaveSections).toContain('introduction')
    expect(result.mustHaveSections).toContain('contact')
    expect({ ...result, offer: 'Nội dung người dùng sửa trực tiếp' }).toMatchObject({ offer: 'Nội dung người dùng sửa trực tiếp' })
  })

  it('normalizes optional conversion intent without breaking legacy briefs', () => {
    expect(normalizeWebsiteBrief(vietnameseBrief)).toMatchObject({
      conversionGoal: { type: 'lead_form' },
      designSystem: { mode: 'zenui' },
    })
    expect(websiteBriefSchema.safeParse({
      ...vietnameseBrief,
      conversionGoal: { type: 'internal_page' },
    }).success).toBe(true)
    for (const forbidden of [
      { type: 'lead_form', recipient: 'sales@example.com' },
      { type: 'lead_form', endpoint: 'https://example.com/leads' },
      { type: 'lead_form', publicationId: crypto.randomUUID() },
      { type: 'lead_form', secret: 'provider-owned-secret' },
      { type: 'lead_form', formNodeId: 'provider-form-id' },
      { type: 'lead_form', fields: [{ key: 'unsafe' }] },
    ]) {
      expect(websiteBriefSchema.safeParse({ ...vietnameseBrief, conversionGoal: forbidden }).success).toBe(false)
    }
  })

  it('keeps provider content schema bounded and free of visual, operational or document-tree control', () => {
    const schema = JSON.stringify(designDirectionContentBlueprintJsonSchema)

    expect(designDirectionContentBlueprintSchema.safeParse(content('vi')).success).toBe(true)
    expect(designDirectionContentBlueprintSchema.safeParse({
      ...content('vi'), heroImage: { query: 'AI course students learning', alt: 'Học viên thực hành AI' },
    }).success).toBe(true)
    expect(designDirectionContentBlueprintSchema.safeParse({
      ...content('vi'), heroImage: {
        query: 'AI course students learning', alt: 'Học viên thực hành AI',
        url: 'https://images.pexels.com/unsafe.jpg', providerResultId: '42', assetId: crypto.randomUUID(),
      },
    }).success).toBe(false)
    expect(schema).toContain('heroImage')
    expect(schema).toContain('contentImages')
    expect(schema).toContain('feature-1')
    expect(schema).toContain('query')
    expect(schema).toContain('navigation')
    expect(schema).toContain('target')
    expect(designDirectionContentBlueprintSchema.safeParse({
      ...content('vi'),
      navigation: [
        { text: 'Lợi ích', target: 'features' },
        { text: 'Lặp lại', target: 'features' },
      ],
    }).success).toBe(false)
    expect(designDirectionContentBlueprintSchema.safeParse({
      ...content('vi'),
      navigation: [
        { text: 'Lợi ích', target: 'features-section' },
        { text: 'Câu hỏi', target: 'faq' },
      ],
    }).success).toBe(false)
    expect(designDirectionContentBlueprintSchema.safeParse({
      ...content('vi'),
      navigation: [
        { text: 'Lợi ích', target: 'features' },
        { text: 'Bảng giá', target: 'pricing' },
      ],
      sectionOrder: content('vi').sectionOrder.filter(type => type !== 'pricing'),
    }).success).toBe(false)
    expect(designDirectionContentBlueprintSchema.safeParse({
      ...content('vi'),
      contentImages: [...content('vi').contentImages, {
        slot: 'feature-4', query: 'extra unbounded image', alt: 'Ảnh vượt giới hạn',
      }],
    }).success).toBe(false)
    expect(schema).not.toMatch(/themePreset|mood|density|navbarVariant|heroVariant|featuresVariant|presentation|profile|effect|selector|keyframe|nodeId|parentId|nodes|rawCss|javascript|providerResultId|assetId|recipient|endpoint|publication|secret/i)
    expect(schema.length).toBeLessThan(21_000)
  })

  it('validates a strict bounded v2 visual plan without provider-owned visual authority', () => {
    const plan = generationPlan('vi')
    const schema = JSON.stringify(designDirectionGenerationPlanJsonSchema)

    expect(designDirectionGenerationPlanSchema.safeParse(plan).success).toBe(true)
    expect(designDirectionGenerationPlanSchema.safeParse({
      ...plan,
      directions: [plan.directions[0], plan.directions[0], plan.directions[2]],
    }).success).toBe(true)
    expect(designDirectionGenerationPlanSchema.safeParse({
      ...plan,
      directions: [{
        ...plan.directions[0],
        presetId: 'unknown-preset',
        themePreset: 'coral',
        rawCss: 'body{display:none}',
        nodeId: 'page-root',
      }, ...plan.directions.slice(1)],
    }).success).toBe(false)
    for (const contentImages of [
      content('vi').contentImages.slice(0, 2),
      [
        content('vi').contentImages[0]!,
        content('vi').contentImages[0]!,
        content('vi').contentImages[2]!,
      ],
    ]) {
      expect(designDirectionGenerationPlanSchema.safeParse({
        ...plan,
        content: { ...plan.content, contentImages },
      }).success).toBe(false)
    }
    expect(designDirectionGenerationPlanSchema.safeParse({
      ...plan,
      directions: plan.directions.map((direction, index) => ({
        ...direction,
        heroImage: {
          query: `${plan.content.heroImage.query} composition ${index + 1}`,
          alt: `${plan.content.heroImage.alt} ${index + 1}`,
        },
      })),
    }).success).toBe(false)
    expect(schema).toContain('design-directions-v2')
    expect(schema).toContain('presetId')
    expect(schema).toContain('calm-clarity')
    expect(schema).not.toMatch(/rawCss|javascript|nodeId|parentId|providerResultId|assetId|themePreset/i)
  })

  it.each([
    ['vi', vietnameseBrief],
    ['en', englishBrief],
  ] as const)('materializes exactly three visibly distinct valid directions for a %s brief', (language, brief) => {
    const result = materializeDesignDirections({
      brief,
      blueprint: content(language),
      plannedPresetIds,
      current: createValidDesignFixture(),
      round: 0,
    })

    expect(result.accepted).toBe(true)
    if (!result.accepted) return
    expect(result.directions).toHaveLength(3)
    expect(result.directions.map(direction => direction.id)).toEqual(plannedPresetIds)
    expect(new Set(result.directions.map(direction => [
      direction.contract.heroVariant,
      direction.contract.featuresVariant,
      direction.contract.testimonialsVariant,
      direction.contract.faqVariant,
      direction.contract.finalCtaVariant,
    ].join('|'))).size).toBe(3)
    expect(new Set(result.directions.map(direction => JSON.stringify(direction.document.theme))).size).toBeGreaterThan(1)
    for (const direction of result.directions) {
      expect(direction.document.nodes['navbar-cta']?.props).toMatchObject({ text: brief.cta })
      expect(direction.document.nodes['hero-primary-cta']?.props).toMatchObject({ text: brief.cta })
      expect(direction.document.nodes['final-primary-cta']?.props).toMatchObject({ text: brief.cta })
      expect(direction.document.pages[0]?.name).toBe(content(language).brand)
    }
    const serialized = JSON.stringify(result.directions)
    expect(serialized).toContain(language === 'vi' ? 'Lập kế hoạch' : 'Build a course')
    expect(serialized).not.toContain('#start')
    for (const direction of result.directions) {
      const navHrefs = ['navbar-link-1', 'navbar-link-2', 'navbar-link-3'].map(id => {
        const props = direction.document.nodes[id]?.props
        return props && 'href' in props ? props.href : null
      })
      for (const href of navHrefs) {
        expect(href).not.toBeNull()
        expect(direction.document.nodes[String(href).slice(1)]).toBeDefined()
      }
    }
  })

  it('preserves one server-owned Lead Form conversion across all three design directions', () => {
    const brief: WebsiteBrief = {
      ...vietnameseBrief,
      conversionGoal: { type: 'lead_form' },
    }
    const first = materializeDesignDirections({
      brief,
      blueprint: content('vi'),
      plannedPresetIds,
      current: createValidDesignFixture(),
      round: 0,
    })
    const repeated = materializeDesignDirections({
      brief,
      blueprint: content('vi'),
      plannedPresetIds,
      current: createValidDesignFixture(),
      round: 0,
    })

    expect(first).toEqual(repeated)
    expect(first.accepted).toBe(true)
    if (!first.accepted) return
    for (const direction of first.directions) {
      const forms = Object.values(direction.document.nodes).filter(node => node.type === 'lead-form')
      expect(forms).toHaveLength(1)
      expect(forms[0]).toMatchObject({ id: 'lead-form-1', type: 'lead-form', children: [] })
      for (const ctaId of ['navbar-cta', 'hero-primary-cta', 'final-primary-cta']) {
        expect(direction.document.nodes[ctaId]?.props).toMatchObject({
          text: brief.cta,
          action: { type: 'lead_form', formNodeId: 'lead-form-1' },
        })
      }
    }
  })

  it('keeps bounded conversion intent in the provider request without operational authority', async () => {
    const generateContentBlueprint = vi.fn().mockResolvedValue({
      output: generationPlan('vi'),
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    })
    const result = await runDesignDirectionGeneration({
      provider: { name: 'mock', model: 'mock-v1', generateContentBlueprint },
      brief: { ...vietnameseBrief, conversionGoal: { type: 'lead_form' } },
      current: createValidDesignFixture(),
      round: 0,
    })

    expect(result.accepted).toBe(true)
    expect(generateContentBlueprint).toHaveBeenCalledWith(expect.objectContaining({
      brief: expect.objectContaining({ conversionGoal: { type: 'lead_form' } }),
    }))
    const providerBrief = generateContentBlueprint.mock.calls[0]?.[0].brief
    expect(JSON.stringify(providerBrief)).not.toMatch(/recipient|endpoint|publication|secret|nodeId|formNodeId|fields/i)
  })

  it('deterministically repairs recent or overly similar plans into three diverse catalog presets', () => {
    const input = {
      brief: vietnameseBrief,
      round: 1,
      plannedPresetIds: ['clear-momentum', 'trusted-advisor', 'bold-launch'] as const,
      excludedPresetIds: ['clear-momentum', 'trusted-advisor', 'bold-launch'] as const,
    }
    const first = resolveDesignDirectionPresetIds(input)
    const repeated = resolveDesignDirectionPresetIds(input)

    expect(first).toEqual(repeated)
    expect(first).toHaveLength(3)
    expect(new Set(first).size).toBe(3)
    expect(first).not.toEqual(expect.arrayContaining([...input.excludedPresetIds]))

    const result = materializeDesignDirections({
      brief: vietnameseBrief,
      blueprint: content('vi'),
      current: createValidDesignFixture(),
      round: 1,
      plannedPresetIds: first,
    })
    expect(result.accepted).toBe(true)
    if (!result.accepted) return
    expect(new Set(result.directions.map(direction => direction.contract.heroVariant)).size).toBe(3)
    expect(new Set(result.directions.map(direction => [
      direction.contract.heroVariant,
      direction.contract.featuresVariant,
      direction.contract.testimonialsVariant,
      direction.contract.faqVariant,
      direction.contract.finalCtaVariant,
    ].join('|'))).size).toBe(3)
  })

  it('gives each direction a distinct story rhythm without changing provider content coverage', () => {
    const result = materializeDesignDirections({
      brief: vietnameseBrief,
      blueprint: content('vi'),
      current: createValidDesignFixture(),
      round: 0,
    })

    expect(result.accepted).toBe(true)
    if (!result.accepted) return
    const sectionOrder = result.directions.map(direction => direction.document.nodes['page-root']!.children
      .filter(nodeId => nodeId !== 'navbar-1' && nodeId !== 'hero-1'))
    expect(new Set(sectionOrder.map(order => order.join('|'))).size).toBe(3)
    expect(result.directions.map(direction => direction.contract)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        heroVariant: 'overlap', featuresVariant: 'icon-list', testimonialsVariant: 'quote-wall',
        faqVariant: 'accordion-cards', finalCtaVariant: 'banner',
      }),
    ]))
    for (const order of sectionOrder) {
      expect(order.at(-1)).toBe('footer-section')
      expect(order).toEqual(expect.arrayContaining([
        'features-section', 'testimonials-section', 'faq-section', 'final-cta-section', 'footer-section',
      ]))
    }

    const providerSchema = JSON.stringify(designDirectionContentBlueprintJsonSchema)
    expect(providerSchema).not.toContain('sectionRhythm')
    expect(JSON.stringify(result.directions.map(direction => direction.contract))).not.toContain('sectionRhythm')
  })

  it('materializes one shared Hero and three shared feature assets without provider data', () => {
    const assets = {
      hero: '55555555-5555-4555-8555-555555555555',
      'feature-1': '66666666-6666-4666-8666-666666666666',
      'feature-2': '77777777-7777-4777-8777-777777777777',
      'feature-3': '88888888-8888-4888-8888-888888888888',
    } as const
    const result = materializeDesignDirections({
      brief: vietnameseBrief,
      blueprint: content('vi'),
      plannedPresetIds,
      current: createValidDesignFixture(),
      round: 0,
      ownedMedia: {
        hero: { assetId: assets.hero, alt: 'Nhóm lập kế hoạch ra mắt', decorative: false },
        'feature-1': { assetId: assets['feature-1'], alt: 'Bảng lộ trình ra mắt', decorative: false },
        'feature-2': { assetId: assets['feature-2'], alt: 'Nhóm xem lại cột mốc', decorative: false },
        'feature-3': { assetId: assets['feature-3'], alt: 'Nhóm bàn giao kế hoạch', decorative: false },
      },
    })

    expect(result.accepted).toBe(true)
    if (!result.accepted) return
    for (const direction of result.directions) {
      expect(direction.document.nodes['hero-image']?.props).toMatchObject({ assetId: assets.hero })
      for (const slot of [1, 2, 3] as const) {
        expect(direction.document.nodes[`feature-image-${slot}`]?.props).toMatchObject({
          assetId: assets[`feature-${slot}`],
        })
        expect(direction.document.nodes[`feature-media-slot-${slot}`]).toBeUndefined()
      }
      expect(direction.document.nodes['hero-product-card']).toBeUndefined()
      expect(JSON.stringify(direction.document)).not.toMatch(/pexels|https?:\/\//i)
    }
  })

  it('keeps a marked Hero image slot when server image resolution is unavailable', () => {
    const result = materializeDesignDirections({
      brief: vietnameseBrief,
      blueprint: content('vi'),
      current: createValidDesignFixture(),
      round: 0,
    })

    expect(result.accepted).toBe(true)
    if (!result.accepted) return
    for (const direction of result.directions) {
      expect(direction.document.nodes['hero-image']).toBeUndefined()
      expect(direction.document.nodes['hero-product-card']?.props).toMatchObject({ mediaSlot: 'hero-image' })
    }
  })

  it('rejects all directions when the shared content violates the accepted brief', () => {
    const result = materializeDesignDirections({
      brief: vietnameseBrief,
      blueprint: { ...content('vi'), language: 'en' },
      current: createValidDesignFixture(),
      round: 0,
    })

    expect(result).toEqual({ accepted: false, code: 'brief_mismatch' })
  })

  it('preserves one low-contrast custom Design System across all four preset sets while layouts stay distinct', () => {
    const briefWithCustomSystem = {
      ...vietnameseBrief,
      designSystem: {
        mode: 'custom',
        colors: { primary: '#24eb94', background: '#ffffff', text: '#2c56ba' },
        fonts: { heading: 'Georgia', body: 'Arial' },
        typography: 'expressive',
        spacing: 'airy',
        radius: 'soft',
      },
    } as WebsiteBrief
    const expectedTheme = {
      colors: { primary: '#24eb94', background: '#ffffff', text: '#2c56ba' },
      fonts: { heading: 'Georgia', body: 'Arial' },
      radius: { sm: 12, md: 20, lg: 28 },
      presentation: { version: 1, profile: 'dynamic', language: 'vi' },
    }
    const sectionIds = new Set([
      'logo-cloud-section',
      'stats-section',
      'features-section',
      'testimonials-section',
      'pricing-section',
      'faq-section',
      'final-cta-section',
      'footer-section',
    ])

    expect(websiteBriefSchema.safeParse(briefWithCustomSystem).success).toBe(true)
    expect(guidedDesignSystemWarnings(briefWithCustomSystem.designSystem!)).toEqual([
      expect.objectContaining({
        code: 'primary_background_contrast',
        path: ['colors', 'primary'],
        minimum: 3,
      }),
    ])
    expect(websiteBriefSchema.safeParse({
      ...briefWithCustomSystem,
      designSystem: {
        ...briefWithCustomSystem.designSystem,
        colors: { primary: '#24eb', background: '#ffffff', text: '#2c56ba' },
      },
    }).success).toBe(false)
    expect(websiteBriefSchema.safeParse({
      ...briefWithCustomSystem,
      designSystem: { ...briefWithCustomSystem.designSystem, rawCss: 'body{display:none}' },
    }).success).toBe(false)

    const sets = [0, 1, 2, 3].map((round) => {
      const result = materializeDesignDirections({
        brief: briefWithCustomSystem,
        blueprint: content('vi'),
        current: createValidDesignFixture(),
        round,
      })

      expect(result.accepted).toBe(true)
      if (!result.accepted) throw new Error(`Custom Design System round ${round} was rejected`)
      return result.directions
    })

    expect(new Set(sets.flatMap(set => set.map(direction => direction.id))).size).toBe(12)
    expect(new Set(sets.flatMap(set => set.map(direction => JSON.stringify(direction.document.theme)))).size).toBe(1)
    for (const directions of sets) {
      expect(directions).toHaveLength(3)
      expect(new Set(directions.map(direction => direction.contract.heroVariant)).size).toBe(3)
      expect(new Set(directions.map(direction => direction.contract.featuresVariant)).size).toBe(3)
      expect(new Set(directions.map(direction => [
        direction.contract.heroVariant,
        direction.contract.featuresVariant,
        direction.contract.testimonialsVariant,
        direction.contract.faqVariant,
        direction.contract.finalCtaVariant,
      ].join('|'))).size).toBe(3)
      expect(new Set(directions.map(direction => direction.document.nodes['page-root']!.children
        .filter(nodeId => sectionIds.has(nodeId))
        .join('|'))).size).toBe(3)

      for (const direction of directions) {
        expect(direction.document.theme).toEqual(expectedTheme)
        expect(direction.document.nodes['hero-heading']?.style).toMatchObject({
          color: '#2c56ba',
          fontFamily: 'Georgia',
          fontSize: 72,
        })
        expect(direction.document.nodes['features-section']?.style).toMatchObject({
          paddingTop: 96,
          paddingBottom: 96,
        })
        expect(direction.document.nodes['feature-icon-shell-1']?.style).toMatchObject({
          borderRadius: 12,
        })
      }
    }
  })

  it('keeps custom Design System out of the provider request', async () => {
    const generateContentBlueprint = vi.fn().mockResolvedValue({
      output: generationPlan('vi'),
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    })
    const result = await runDesignDirectionGeneration({
      provider: { name: 'mock', model: 'mock-v1', generateContentBlueprint },
      brief: {
        ...vietnameseBrief,
        designSystem: {
          mode: 'custom',
          colors: { primary: '#2563eb', background: '#ffffff', text: '#0f172a' },
          fonts: { heading: 'Georgia', body: 'Arial' },
          typography: 'expressive', spacing: 'airy', radius: 'soft',
        },
      },
      current: createValidDesignFixture(),
      round: 0,
    })

    expect(result.accepted).toBe(true)
    expect(generateContentBlueprint).toHaveBeenCalledWith(expect.objectContaining({
      brief: expect.not.objectContaining({ designSystem: expect.anything() }),
    }))
    if (result.accepted) {
      expect(result.directions.every(direction => direction.document.theme.fonts.heading === 'Georgia')).toBe(true)
    }
  })

  it('repairs typed provider section relationships deterministically before materialization', async () => {
    const plan = generationPlan('vi')
    const generateContentBlueprint = vi.fn().mockResolvedValue({
      output: {
        ...plan,
        content: {
          ...plan.content,
          sectionOrder: plan.content.sectionOrder.filter(type => type !== 'testimonials'),
        },
      },
      usage: { inputTokens: 919, outputTokens: 1481, totalTokens: 2400 },
    })

    const result = await runDesignDirectionGeneration({
      provider: { name: 'mock', model: 'mock-v1', generateContentBlueprint },
      brief: vietnameseBrief,
      current: createValidDesignFixture(),
      round: 0,
    })

    expect(result.accepted).toBe(true)
    if (!result.accepted) return
    expect(result.blueprint.content.sectionOrder).toContain('testimonials')
    expect(result.blueprint.content.sectionOrder.at(-1)).toBe('footer')
    expect(result.directions).toHaveLength(3)
  })

  it('keeps allowlisted provider navigation targets when the brief does not require those sections', async () => {
    const plan = generationPlan('vi')
    const generateContentBlueprint = vi.fn().mockResolvedValue({
      output: plan,
      usage: { inputTokens: 919, outputTokens: 1480, totalTokens: 2399 },
    })

    const result = await runDesignDirectionGeneration({
      provider: { name: 'mock', model: 'mock-v1', generateContentBlueprint },
      brief: {
        ...vietnameseBrief,
        mustHaveSections: ['introduction', 'benefits', 'contact'],
      },
      current: createValidDesignFixture(),
      round: 0,
    })

    expect(result.accepted).toBe(true)
    if (!result.accepted) return
    for (const direction of result.directions) {
      for (const target of plan.content.navigation.map(item => item.target)) {
        expect(direction.document.nodes[`${target}-section`]).toBeDefined()
      }
    }
  })

  it('uses one provider request and resolves one shared Hero plus three shared feature images', async () => {
    const insufficientBudgetProvider = vi.fn()
    const insufficientBudgetResolver = vi.fn()
    await expect(runDesignDirectionGeneration({
      provider: { name: 'mock', model: 'mock-v1', generateContentBlueprint: insufficientBudgetProvider },
      brief: vietnameseBrief,
      current: createValidDesignFixture(),
      round: 0,
      maxMediaPerRun: 3,
      resolveMedia: insufficientBudgetResolver,
    })).resolves.toMatchObject({ accepted: false, code: 'invalid_model_output', usage: {
      inputTokens: 0, outputTokens: 0, totalTokens: 0,
    } })
    expect(insufficientBudgetProvider).not.toHaveBeenCalled()
    expect(insufficientBudgetResolver).not.toHaveBeenCalled()

    const generateContentBlueprint = vi.fn().mockResolvedValue({
      output: generationPlan('vi'),
      usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
    })
    const assetByKey = {
      'shared-hero': '55555555-5555-4555-8555-555555555555',
      'shared-feature-1': '66666666-6666-4666-8666-666666666666',
      'shared-feature-2': '77777777-7777-4777-8777-777777777777',
      'shared-feature-3': '88888888-8888-4888-8888-888888888888',
    } as const
    const resolveMedia = vi.fn().mockImplementation((intent: { key: keyof typeof assetByKey; alt: string }) => Promise.resolve({
      assetId: assetByKey[intent.key],
      alt: intent.alt,
      decorative: false as const,
    }))
    const successful = await runDesignDirectionGeneration({
      provider: { name: 'mock', model: 'mock-v1', generateContentBlueprint },
      brief: vietnameseBrief,
      current: createValidDesignFixture(),
      round: 0,
      resolveMedia,
    })

    expect(successful.accepted).toBe(true)
    expect(generateContentBlueprint).toHaveBeenCalledOnce()
    expect(generateContentBlueprint).toHaveBeenCalledWith(expect.objectContaining({
      promptVersion: 'directions-v2', round: 0, excludedPresetIds: [],
    }))
    expect(resolveMedia).toHaveBeenCalledTimes(4)
    expect(resolveMedia.mock.calls.map(call => (call[0] as { key: string }).key)).toEqual([
      'shared-hero', 'shared-feature-1', 'shared-feature-2', 'shared-feature-3',
    ])
    if (successful.accepted) {
      expect(successful.promptVersion).toBe('directions-v2')
      expect(successful.blueprint.version).toBe('design-directions-v2')
      for (const direction of successful.directions) {
        expect(direction.document.nodes['hero-image']?.props).toMatchObject({ assetId: assetByKey['shared-hero'] })
        for (const slot of [1, 2, 3] as const) {
          expect(direction.document.nodes[`feature-image-${slot}`]?.props).toMatchObject({
            assetId: assetByKey[`shared-feature-${slot}`],
          })
        }
      }
    }

    const partialResolver = vi.fn().mockImplementation((intent: { key: keyof typeof assetByKey; alt: string }) => (
      intent.key === 'shared-feature-2'
        ? Promise.resolve(null)
        : Promise.resolve({ assetId: assetByKey[intent.key], alt: intent.alt, decorative: false as const })
    ))
    const partial = await runDesignDirectionGeneration({
      provider: { name: 'mock', model: 'mock-v1', generateContentBlueprint },
      brief: vietnameseBrief,
      current: createValidDesignFixture(),
      round: 0,
      resolveMedia: partialResolver,
    })
    expect(partial.accepted).toBe(true)
    if (partial.accepted) {
      for (const direction of partial.directions) {
        expect(direction.document.nodes['hero-image']).toBeDefined()
        expect(direction.document.nodes['feature-image-1']).toBeDefined()
        expect(direction.document.nodes['feature-image-2']).toBeUndefined()
        expect(direction.document.nodes['feature-image-3']).toBeDefined()
        expect(direction.document.nodes['feature-media-slot-2']).toBeUndefined()
      }
    }

    resolveMedia.mockRejectedValue(new Error('provider credential detail'))
    const fallback = await runDesignDirectionGeneration({
      provider: { name: 'mock', model: 'mock-v1', generateContentBlueprint },
      brief: vietnameseBrief,
      current: createValidDesignFixture(),
      round: 0,
      resolveMedia,
    })
    expect(fallback.accepted).toBe(true)
    if (fallback.accepted) {
      expect(fallback.directions.every(direction => direction.document.nodes['hero-product-card'] !== undefined)).toBe(true)
      expect(fallback.directions.every(direction => (
        direction.document.nodes['feature-image-1'] === undefined
        && direction.document.nodes['feature-image-2'] === undefined
        && direction.document.nodes['feature-image-3'] === undefined
        && direction.document.nodes['feature-media-slot-1'] === undefined
        && direction.document.nodes['feature-media-slot-2'] === undefined
        && direction.document.nodes['feature-media-slot-3'] === undefined
      ))).toBe(true)
      expect(JSON.stringify(fallback.directions)).not.toContain('provider credential detail')
    }

    const invalidProvider = vi.fn().mockResolvedValue({
      output: { invalid: true },
      usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
    })
    const invalid = await runDesignDirectionGeneration({
      provider: { name: 'mock', model: 'mock-v1', generateContentBlueprint: invalidProvider },
      brief: vietnameseBrief,
      current: createValidDesignFixture(),
      round: 0,
    })
    expect(invalid).toMatchObject({ accepted: false, code: 'invalid_model_output' })
    expect(invalidProvider).toHaveBeenCalledOnce()

    const missingContentImages: Partial<DesignDirectionContentBlueprint> = { ...content('vi') }
    delete missingContentImages.contentImages
    const missingContentImagesProvider = vi.fn().mockResolvedValue({
      output: missingContentImages,
      usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
    })
    const missingContentImagesResult = await runDesignDirectionGeneration({
      provider: { name: 'mock', model: 'mock-v1', generateContentBlueprint: missingContentImagesProvider },
      brief: vietnameseBrief,
      current: createValidDesignFixture(),
      round: 0,
    })
    expect(missingContentImagesResult).toMatchObject({ accepted: false, code: 'invalid_model_output' })

    const badRequestProvider = vi.fn().mockRejectedValue(Object.assign(new Error('bad request'), { code: 'provider_bad_request' }))
    const badRequest = await runDesignDirectionGeneration({
      provider: { name: 'mock', model: 'mock-v1', generateContentBlueprint: badRequestProvider },
      brief: vietnameseBrief,
      current: createValidDesignFixture(),
      round: 0,
    })
    expect(badRequest).toMatchObject({ accepted: false, code: 'provider_bad_request' })

    const transientProvider = vi.fn().mockRejectedValue(Object.assign(new Error('temporary'), { code: 'provider_transient' }))
    const failed = await runDesignDirectionGeneration({
      provider: { name: 'mock', model: 'mock-v1', generateContentBlueprint: transientProvider },
      brief: vietnameseBrief,
      current: createValidDesignFixture(),
      round: 0,
    })
    expect(failed).toMatchObject({ accepted: false, code: 'provider_transient' })
    expect(transientProvider).toHaveBeenCalledOnce()
  })
})
