import { createValidDesignFixture } from '@zenui/design-schema'
import { describe, expect, it, vi } from 'vitest'

import {
  designDirectionContentBlueprintJsonSchema,
  designDirectionContentBlueprintSchema,
  designDirectionJobSchema,
  designDirectionRunErrorCodeSchema,
  designDirectionRunStatusSchema,
  materializeDesignDirections,
  prefillWebsiteBrief,
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

function content(language: 'vi' | 'en'): DesignDirectionContentBlueprint {
  const vi = language === 'vi'
  return {
    version: 1,
    language,
    pagePreset: vi ? 'saas' : 'course',
    brand: vi ? 'NovaFlow' : 'Atlas Course',
    announcement: vi ? 'Lập kế hoạch ra mắt nhẹ nhàng hơn' : 'Turn your expertise into a clear course',
    navLabels: vi ? ['Lợi ích', 'Kết quả', 'Câu hỏi'] : ['Benefits', 'Pricing', 'Questions'],
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

describe('Stage 5 guided brief and design direction contracts', () => {
  it('validates durable direction run metadata without carrying brief or documents in the queue', () => {
    expect(designDirectionRunStatusSchema.options).toEqual([
      'queued', 'running', 'completed', 'failed', 'cancelled', 'superseded', 'accepted',
    ])
    expect(designDirectionRunErrorCodeSchema.options).toContain('invalid_model_output')
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
    expect(result.mustHaveSections).toContain('introduction')
    expect(result.mustHaveSections).toContain('contact')
    expect({ ...result, offer: 'Nội dung người dùng sửa trực tiếp' }).toMatchObject({ offer: 'Nội dung người dùng sửa trực tiếp' })
  })

  it('keeps provider content schema bounded and free of visual or document-tree control', () => {
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
    expect(designDirectionContentBlueprintSchema.safeParse({
      ...content('vi'),
      contentImages: [...content('vi').contentImages, {
        slot: 'feature-4', query: 'extra unbounded image', alt: 'Ảnh vượt giới hạn',
      }],
    }).success).toBe(false)
    expect(schema).not.toMatch(/themePreset|mood|density|navbarVariant|heroVariant|featuresVariant|nodeId|parentId|nodes|rawCss|javascript|providerResultId|assetId/i)
    expect(schema.length).toBeLessThan(21_000)
  })

  it.each([
    ['vi', vietnameseBrief],
    ['en', englishBrief],
  ] as const)('materializes exactly three visibly distinct valid directions for a %s brief', (language, brief) => {
    const result = materializeDesignDirections({
      brief,
      blueprint: content(language),
      current: createValidDesignFixture(),
      round: 0,
    })

    expect(result.accepted).toBe(true)
    if (!result.accepted) return
    expect(result.directions).toHaveLength(3)
    expect(new Set(result.directions.map(direction => direction.contract.heroVariant)).size).toBe(3)
    expect(new Set(result.directions.map(direction => direction.contract.featuresVariant)).size).toBe(3)
    expect(new Set(result.directions.map(direction => direction.document.theme.colors.primary)).size).toBe(3)
    for (const direction of result.directions) {
      expect(direction.document.nodes['navbar-cta']?.props).toMatchObject({ text: brief.cta })
      expect(direction.document.nodes['hero-primary-cta']?.props).toMatchObject({ text: brief.cta })
      expect(direction.document.nodes['final-primary-cta']?.props).toMatchObject({ text: brief.cta })
      expect(direction.document.pages[0]?.name).toBe(content(language).brand)
    }
    const serialized = JSON.stringify(result.directions)
    expect(serialized).toContain(language === 'vi' ? 'Lập kế hoạch' : 'Build a course')
  })

  it('rotates through four distinct preset sets and safely wraps every round', () => {
    const directionsAt = (round: number) => {
      const result = materializeDesignDirections({
        brief: vietnameseBrief,
        blueprint: content('vi'),
        current: createValidDesignFixture(),
        round,
      })
      expect(result.accepted).toBe(true)
      if (!result.accepted) throw new Error(`Round ${round} was rejected`)
      return result.directions
    }
    const ids = (round: number) => directionsAt(round).map(direction => direction.id)
    const sets = [0, 1, 2, 3].map(directionsAt)

    expect(new Set(sets.map(set => set.map(direction => direction.id).join('|'))).size).toBe(4)
    expect(new Set(sets.flatMap(set => set.map(direction => direction.id))).size).toBe(12)
    for (const set of sets) {
      expect(set).toHaveLength(3)
      expect(new Set(set.map(direction => direction.contract.heroVariant)).size).toBe(3)
      expect(new Set(set.map(direction => direction.contract.featuresVariant)).size).toBe(3)
      expect(new Set(set.map(direction => direction.contract.themePreset)).size).toBe(3)
    }

    expect(ids(-1)).toEqual(ids(3))
    expect(ids(4)).toEqual(ids(0))
    expect(ids(Number.MAX_SAFE_INTEGER)).toEqual(ids(3))
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

  it('materializes one shared server-resolved media set into every direction without provider data', () => {
    const assetId = '55555555-5555-4555-8555-555555555555'
    const result = materializeDesignDirections({
      brief: vietnameseBrief,
      blueprint: content('vi'),
      current: createValidDesignFixture(),
      round: 0,
      ownedMedia: {
        hero: { assetId, alt: 'Nhóm sản phẩm cùng lập kế hoạch ra mắt', decorative: false },
        'feature-1': { assetId: '66666666-6666-4666-8666-666666666666', alt: 'Bảng lộ trình ra mắt sản phẩm', decorative: false },
        'feature-2': { assetId: '77777777-7777-4777-8777-777777777777', alt: 'Nhóm xem lại các cột mốc', decorative: false },
        'feature-3': { assetId: '88888888-8888-4888-8888-888888888888', alt: 'Bàn giao kế hoạch ra mắt', decorative: false },
      },
    })

    expect(result.accepted).toBe(true)
    if (!result.accepted) return
    for (const direction of result.directions) {
      expect(direction.document.nodes['hero-image']?.props).toEqual({
        assetId, alt: 'Nhóm sản phẩm cùng lập kế hoạch ra mắt', decorative: false,
      })
      expect(direction.document.nodes['feature-image-1']?.props).toMatchObject({ assetId: '66666666-6666-4666-8666-666666666666' })
      expect(direction.document.nodes['feature-image-2']?.props).toMatchObject({ assetId: '77777777-7777-4777-8777-777777777777' })
      expect(direction.document.nodes['feature-image-3']?.props).toMatchObject({ assetId: '88888888-8888-4888-8888-888888888888' })
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

  it('preserves one custom Design System across all four preset sets while layouts stay distinct', () => {
    const briefWithCustomSystem = {
      ...vietnameseBrief,
      designSystem: {
        mode: 'custom',
        colors: { primary: '#2563eb', background: '#ffffff', text: '#0f172a' },
        fonts: { heading: 'Georgia', body: 'Arial' },
        typography: 'expressive',
        spacing: 'airy',
        radius: 'soft',
      },
    } as WebsiteBrief
    const expectedTheme = {
      colors: { primary: '#2563eb', background: '#ffffff', text: '#0f172a' },
      fonts: { heading: 'Georgia', body: 'Arial' },
      radius: { sm: 12, md: 20, lg: 28 },
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
    expect(websiteBriefSchema.safeParse({
      ...briefWithCustomSystem,
      designSystem: {
        ...briefWithCustomSystem.designSystem,
        colors: { primary: '#eeeeee', background: '#ffffff', text: '#dddddd' },
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
          color: '#0f172a',
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
      output: content('vi'),
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

  it('uses exactly one provider request and resolves at most four shared media slots without exposing provider data', async () => {
    const generateContentBlueprint = vi.fn().mockResolvedValue({
      output: content('vi'),
      usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
    })
    const resolveMedia = vi.fn().mockImplementation((intent: { slot: string; alt: string }) => Promise.resolve({
      assetId: ({
        hero: '55555555-5555-4555-8555-555555555555',
        'feature-1': '66666666-6666-4666-8666-666666666666',
        'feature-2': '77777777-7777-4777-8777-777777777777',
        'feature-3': '88888888-8888-4888-8888-888888888888',
      } as Record<string, string>)[intent.slot],
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
    expect(resolveMedia).toHaveBeenCalledTimes(4)
    expect(resolveMedia.mock.calls.map(call => (call[0] as { slot: string }).slot)).toEqual(['hero', 'feature-1', 'feature-2', 'feature-3'])
    if (successful.accepted) {
      expect(successful.directions.every(direction => {
        const image = direction.document.nodes['hero-image']
        return image?.type === 'image'
          && 'assetId' in image.props
          && image.props.assetId === '55555555-5555-4555-8555-555555555555'
      })).toBe(true)
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
