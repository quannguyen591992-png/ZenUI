import { createRemoteImagePolicy, createValidDesignFixture } from '@zenui/design-schema'
import { describe, expect, it } from 'vitest'

import {
  landingPageProviderBlueprintJsonSchema,
  landingPageProviderBlueprintSchema,
  materializeLandingPageBlueprintV2,
  normalizeLandingPageProviderBlueprint,
} from '../src/index.js'

const providerBlueprint = {
  version: 2 as const,
  pagePreset: 'saas' as const,
  brand: 'NovaFlow AI',
  themePreset: 'indigo' as const,
  mood: 'confident' as const,
  density: 'balanced' as const,
  navbarVariant: 'announcement' as const,
  heroVariant: 'product-shot' as const,
  featuresVariant: 'bento' as const,
  sectionOrder: ['logo-cloud', 'stats', 'features', 'testimonials', 'pricing', 'faq', 'final-cta', 'footer'] as const,
  announcement: 'NovaFlow AI 2.0 is now available',
  navLabels: ['Tính năng', 'Bảng giá', 'Khách hàng', 'FAQ'],
  navbarCta: 'Dùng thử miễn phí',
  heroBadge: 'AI customer care',
  heroHeading: 'Tự động hóa chăm sóc khách hàng với NovaFlow AI',
  heroParagraph: 'Giúp doanh nghiệp phản hồi nhanh, hiểu khách hàng và giảm chi phí vận hành.',
  heroPrimaryCta: 'Dùng thử miễn phí',
  heroSecondaryCta: 'Xem cách hoạt động',
  heroProof: 'Được tin dùng bởi hơn 500 doanh nghiệp Việt Nam',
  heroImageUrl: 'https://images.unsplash.com/photo-1677442136019-21780ecad995',
  heroImageAlt: 'Nền tảng chăm sóc khách hàng bằng AI',
  logos: ['Acme', 'Orbit', 'Vertex', 'Luma', 'Northstar'],
  statsHeading: 'Hiệu quả có thể đo lường',
  stats: [
    { value: '70%', label: 'giảm thời gian phản hồi' },
    { value: '24/7', label: 'hỗ trợ khách hàng' },
    { value: '4.8/5', label: 'mức độ hài lòng' },
  ],
  featuresHeading: 'Một nền tảng cho toàn bộ hành trình khách hàng',
  featuresParagraph: 'Kết hợp tự động hóa, phân tích và cộng tác để nâng cao chất lượng dịch vụ.',
  features: [
    { icon: 'star' as const, heading: 'Chatbot AI thông minh', paragraph: 'Hiểu ngữ cảnh và phản hồi tự nhiên trên mọi kênh.' },
    { icon: 'menu' as const, heading: 'Phân loại yêu cầu', paragraph: 'Gắn nhãn và chuyển yêu cầu đến đúng nhóm phụ trách.' },
    { icon: 'check' as const, heading: 'Phản hồi tức thì', paragraph: 'Tự động trả lời các câu hỏi thường gặp với nội dung đã duyệt.' },
    { icon: 'arrow-right' as const, heading: 'Phân tích cảm xúc', paragraph: 'Nhận biết mức độ hài lòng qua từng cuộc hội thoại.' },
    { icon: 'star' as const, heading: 'Báo cáo hiệu suất', paragraph: 'Theo dõi KPI và xu hướng dịch vụ theo thời gian thực.' },
  ],
  testimonialsHeading: 'Đội ngũ dịch vụ tạo ra nhiều giá trị hơn',
  testimonials: [
    { quote: 'NovaFlow giúp chúng tôi rút ngắn đáng kể thời gian phản hồi.', name: 'Lan Nguyễn', role: 'COO, Acme Vietnam' },
    { quote: 'Nhân viên tập trung vào tình huống phức tạp thay vì câu hỏi lặp lại.', name: 'Minh Trần', role: 'CX Lead, Orbit' },
    { quote: 'Báo cáo cảm xúc giúp chúng tôi phát hiện vấn đề sớm hơn.', name: 'An Lê', role: 'Founder, Luma' },
  ],
  pricingHeading: 'Chọn gói phù hợp với quy mô đội ngũ',
  pricingParagraph: 'Bắt đầu nhanh và nâng cấp khi nhu cầu tăng lên.',
  plans: [
    { name: 'Starter', price: '499.000đ/tháng', description: 'Cho đội ngũ nhỏ.', features: ['2 kênh hỗ trợ', '1.000 hội thoại'], highlighted: false },
    { name: 'Growth', price: '1.499.000đ/tháng', description: 'Cho doanh nghiệp đang tăng trưởng.', features: ['Mọi kênh phổ biến', 'Phân tích cảm xúc', 'Báo cáo nâng cao'], highlighted: true },
    { name: 'Enterprise', price: 'Liên hệ', description: 'Cho nhu cầu quy mô lớn.', features: ['SLA riêng', 'Tích hợp tùy chỉnh'], highlighted: false },
  ],
  faqHeading: 'Thông tin cần biết trước khi bắt đầu',
  faqs: [
    { question: 'NovaFlow hỗ trợ tiếng Việt không?', answer: 'Có. Nền tảng được tối ưu cho hội thoại tiếng Việt.' },
    { question: 'Có tích hợp hệ thống hiện tại không?', answer: 'Có thể kết nối các kênh và công cụ phổ biến.' },
    { question: 'Mất bao lâu để triển khai?', answer: 'Đội ngũ nhỏ có thể bắt đầu trong một ngày.' },
    { question: 'Dữ liệu được bảo vệ thế nào?', answer: 'Quyền truy cập và dữ liệu được kiểm soát theo workspace.' },
    { question: 'Có thể nâng cấp gói không?', answer: 'Có thể nâng cấp khi nhu cầu tăng.' },
  ],
  finalCtaHeading: 'Sẵn sàng nâng tầm dịch vụ khách hàng?',
  finalCtaParagraph: 'Bắt đầu miễn phí và xây dựng trải nghiệm khách hàng tốt hơn ngay hôm nay.',
  finalCtaText: 'Bắt đầu dùng thử',
  footerTagline: 'Nền tảng chăm sóc khách hàng bằng AI dành cho doanh nghiệp Việt Nam.',
  copyright: '© 2026 NovaFlow AI.',
}

describe('Gemini-compatible Blueprint v2 provider DTO', () => {
  it('exports a shallow bounded union-free provider schema', () => {
    const text = JSON.stringify(landingPageProviderBlueprintJsonSchema)

    expect(landingPageProviderBlueprintSchema.safeParse(providerBlueprint).success).toBe(true)
    expect(text).not.toMatch(/oneOf|anyOf|parentId|children|nodes|rawCss|javascript/i)
    expect(text).toContain('sectionOrder')
    expect(text).toContain('footerTagline')
    expect(text.length).toBeLessThan(20_000)
  })

  it('accepts only bounded conversion intent and keeps operational authority server-owned', () => {
    const withLeadIntent = {
      ...providerBlueprint,
      conversionIntent: 'lead_form' as const,
    }
    const normalized = normalizeLandingPageProviderBlueprint(withLeadIntent)

    expect(landingPageProviderBlueprintSchema.safeParse(withLeadIntent).success).toBe(true)
    expect(normalized?.conversionGoal).toEqual({ type: 'lead_form' })
    for (const forbidden of [
      { recipient: 'sales@example.com' },
      { endpoint: 'https://example.com/leads' },
      { publicationId: crypto.randomUUID() },
      { secret: 'provider-owned-secret' },
      { formNodeId: 'provider-form-id' },
      { nodeId: 'provider-node-id' },
      { fields: [{ key: 'unsafe' }] },
    ]) {
      expect(landingPageProviderBlueprintSchema.safeParse({ ...withLeadIntent, ...forbidden }).success).toBe(false)
    }

    const schema = JSON.stringify(landingPageProviderBlueprintJsonSchema)
    expect(schema).toContain('conversionIntent')
    expect(schema).not.toMatch(/recipient|endpoint|publication|secret|formNodeId|nodeId|fields/i)
  })

  it('normalizes provider content into strict Blueprint v2 and materializes it', () => {
    const normalized = normalizeLandingPageProviderBlueprint(providerBlueprint)

    expect(normalized?.sections.map(section => section.type)).toEqual(providerBlueprint.sectionOrder)
    expect(normalized?.theme.headingFont).toBe('Manrope')
    const result = materializeLandingPageBlueprintV2({
      blueprint: normalized,
      current: createValidDesignFixture(),
      imagePolicy: createRemoteImagePolicy('images.unsplash.com,images.pexels.com'),
    })
    expect(result).toMatchObject({ accepted: true })
    if (!result.accepted) return
    expect(result.document.nodes['hero-visual']?.style).toMatchObject({ minHeight: 0 })
    expect(result.document.nodes['hero-image']?.style).toMatchObject({
      aspectRatio: 'wide', objectFit: 'cover', objectPosition: 'center', backgroundColor: '#f1f0fd',
    })
    expect(result.document.nodes['hero-image']?.responsive.tablet).toMatchObject({ aspectRatio: 'landscape' })
    expect(result.document.nodes['hero-image']?.responsive.mobile).toMatchObject({
      aspectRatio: 'landscape', objectPosition: 'top',
    })
    expect(result.document.nodes['feature-card-1']?.style).toMatchObject({ gridColumnSpan: 2, gridRowSpan: 2 })
    expect(result.document.nodes['feature-card-1']?.responsive.tablet).toMatchObject({ gridColumnSpan: 2, gridRowSpan: 1 })
    expect(result.document.nodes['feature-card-1']?.responsive.mobile).toMatchObject({ gridColumnSpan: 1, gridRowSpan: 1 })
    expect(result.document.nodes['testimonial-card-1']?.style).toMatchObject({ gridColumnSpan: 1, gridRowSpan: 2 })
    expect(result.document.nodes['testimonial-card-2']?.style.gridColumnSpan).toBeUndefined()
    expect(result.document.nodes['testimonial-card-3']?.style.gridColumnSpan).toBeUndefined()
    expect(result.document.nodes['testimonial-card-1']?.responsive.tablet).toMatchObject({ gridColumnSpan: 1, gridRowSpan: 2 })
    expect(result.document.nodes['testimonial-card-1']?.responsive.mobile).toMatchObject({ gridColumnSpan: 1, gridRowSpan: 1 })
    expect(result.document.nodes['pricing-section']).toBeDefined()
    expect(result.document.nodes['footer-section']).toBeDefined()
    expect(result.document.nodes['pricing-name-1']?.props).toMatchObject({ text: 'Starter' })
    expect(result.document.nodes['pricing-name-2']?.props).toMatchObject({ text: 'Growth' })
    expect(result.document.nodes['pricing-name-3']?.props).toMatchObject({ text: 'Enterprise' })
    expect(result.document.nodes['pricing-card-1']?.style.shadow).toBe('md')
    expect(result.document.nodes['pricing-card-2']?.style.shadow).toBe('md')
    expect(Object.keys(result.document.nodes).length).toBeGreaterThan(90)
  })

  it('uses SaaS typography and compact spacing even with editorial mood', () => {
    const normalized = normalizeLandingPageProviderBlueprint({
      ...providerBlueprint,
      mood: 'editorial',
      density: 'balanced',
    })

    expect(normalized?.theme.headingFont).toBe('Manrope')
    const result = materializeLandingPageBlueprintV2({
      blueprint: normalized,
      current: createValidDesignFixture(),
      imagePolicy: createRemoteImagePolicy('images.unsplash.com,images.pexels.com'),
    })
    expect(result).toMatchObject({ accepted: true })
    if (!result.accepted) return
    expect(result.document.theme.fonts.heading).toBe('Manrope')
    expect(result.document.nodes['hero-heading']?.style.fontSize).toBe(58)
    expect(result.document.nodes['features-section']?.style.paddingTop).toBe(72)
    expect(result.document.nodes['features-heading']?.style.fontSize).toBe(40)
  })

  it('repairs required section order deterministically without another model call', () => {
    const normalized = normalizeLandingPageProviderBlueprint({
      ...providerBlueprint,
      sectionOrder: ['stats', 'testimonials', 'faq', 'footer'],
    })

    expect(normalized?.sections.map(section => section.type)).toEqual([
      'features', 'stats', 'testimonials', 'faq', 'final-cta', 'footer',
    ])
  })

  it('rejects malformed provider content and mismatched image metadata', () => {
    expect(normalizeLandingPageProviderBlueprint({ ...providerBlueprint, nodes: {} })).toBeNull()
    expect(normalizeLandingPageProviderBlueprint({ ...providerBlueprint, heroImageAlt: undefined })).toBeNull()
  })
})
