import { createValidDesignFixture, type DesignDocument } from '@zenui/design-schema'
import { describe, expect, it } from 'vitest'

import {
  SITE_INTELLIGENCE_POLICY_VERSION,
  analyzeSiteIntelligence,
  captureRemixConstraints,
  explainDesignEvidence,
  siteIntelligenceReviewSchema,
  validateRemixConstraints,
  type WebsiteBrief,
} from '../src/index'

const brief: WebsiteBrief = {
  description: 'Nền tảng lập kế hoạch ra mắt sản phẩm cho nhóm nhỏ.',
  offer: 'Nền tảng lập kế hoạch ra mắt sản phẩm',
  audience: 'nhóm sản phẩm nhỏ',
  primaryGoal: 'đặt lịch tư vấn',
  cta: 'Đặt lịch tư vấn',
  tone: 'rõ ràng và đáng tin cậy',
  brandDetails: 'NovaFlow, xanh đậm',
  mustHaveSections: ['introduction', 'benefits', 'trust', 'faq', 'contact'],
}

function intelligenceDocument(): DesignDocument {
  const document = createValidDesignFixture()
  document.projectId = '11111111-1111-4111-8111-111111111111'
  document.nodes['section-1'] = {
    ...document.nodes['section-1']!,
    type: 'hero',
    props: { label: 'Giới thiệu' },
    style: { paddingTop: 96, paddingBottom: 96, backgroundColor: '#ffffff' },
  }
  document.nodes['heading-1']!.props = {
    text: 'Giúp nhóm sản phẩm nhỏ lập kế hoạch ra mắt rõ ràng',
    level: 1,
  }
  document.nodes['paragraph-1']!.props = {
    text: 'Một quy trình có cấu trúc để thống nhất mục tiêu, công việc và thời điểm ra mắt.',
  }
  document.nodes['button-1']!.props = { text: 'Đặt lịch tư vấn', href: '#contact' }
  document.nodes['trust-section'] = {
    id: 'trust-section', type: 'section', parentId: 'page-root', children: ['trust-container'],
    props: { label: 'Kết quả khách hàng' }, style: { paddingTop: 64, paddingBottom: 64 }, responsive: {},
  }
  document.nodes['trust-container'] = {
    id: 'trust-container', type: 'container', parentId: 'trust-section', children: ['trust-heading'],
    props: {}, style: {}, responsive: {},
  }
  document.nodes['trust-heading'] = {
    id: 'trust-heading', type: 'heading', parentId: 'trust-container', children: [],
    props: { text: 'Được hơn 120 nhóm sản phẩm tin dùng', level: 2 }, style: {}, responsive: {},
  }
  document.nodes['faq-section'] = {
    id: 'faq-section', type: 'section', parentId: 'page-root', children: ['faq-container'],
    props: { label: 'Câu hỏi thường gặp' }, style: {}, responsive: {},
  }
  document.nodes['faq-container'] = {
    id: 'faq-container', type: 'container', parentId: 'faq-section', children: ['faq-heading'],
    props: {}, style: {}, responsive: {},
  }
  document.nodes['faq-heading'] = {
    id: 'faq-heading', type: 'heading', parentId: 'faq-container', children: [],
    props: { text: 'Bạn cần biết gì trước khi bắt đầu?', level: 2 }, style: {}, responsive: {},
  }
  document.nodes['contact-section'] = {
    id: 'contact-section', type: 'section', parentId: 'page-root', children: ['contact-container'],
    props: { label: 'Đặt lịch tư vấn' }, style: {}, responsive: {},
  }
  document.nodes['contact-container'] = {
    id: 'contact-container', type: 'container', parentId: 'contact-section', children: ['contact-button'],
    props: {}, style: {}, responsive: {},
  }
  document.nodes['contact-button'] = {
    id: 'contact-button', type: 'button', parentId: 'contact-container', children: [],
    props: { text: 'Đặt lịch tư vấn', href: '#contact' }, style: {}, responsive: {},
  }
  document.nodes['page-root']!.children = ['section-1', 'trust-section', 'faq-section', 'contact-section']
  return document
}

describe('site intelligence v1', () => {
  it('produces a versioned evidence-grounded story and stable bilingual-safe review', () => {
    const document = intelligenceDocument()
    const before = structuredClone(document)

    const first = analyzeSiteIntelligence({ document, brief })
    const second = analyzeSiteIntelligence({ document: structuredClone(document), brief: structuredClone(brief) })

    expect(siteIntelligenceReviewSchema.parse(first)).toEqual(first)
    expect(first.policyVersion).toBe(SITE_INTELLIGENCE_POLICY_VERSION)
    expect(first).toEqual(second)
    expect(document).toEqual(before)
    expect(first.story.map(step => step.purpose)).toEqual([
      'introduction', 'trust', 'objections', 'action',
    ])
    expect(first.story.every(step => step.evidenceNodeIds.length > 0 && step.explanation.length > 0)).toBe(true)
    expect(first.findings.every(finding => (
      finding.evidence.length > 0
      && finding.citations.some(citation => citation.kind === 'goal')
      && /^[a-f0-9]{16}$/.test(finding.fingerprint)
      && !/conversion|chuyển đổi/i.test(`${finding.title} ${finding.explanation}`)
    ))).toBe(true)
  })

  it('detects bounded content, audience, contrast and mobile risks with concrete evidence', () => {
    const document = intelligenceDocument()
    document.nodes['paragraph-1']!.props = { text: Array.from({ length: 95 }, () => 'dài').join(' ') }
    document.nodes['heading-1']!.style = { color: '#f8fafc' }
    document.nodes['container-1']!.style = { width: 760, gridColumns: 3 }
    document.nodes['container-1']!.responsive = { mobile: { gridColumns: 2 } }
    document.nodes['button-1']!.props = { text: 'Xem thêm', href: '#more' }
    document.nodes['contact-button']!.props = { text: 'Tìm hiểu thêm', href: '#more' }
    delete document.nodes['trust-section']
    delete document.nodes['trust-container']
    delete document.nodes['trust-heading']
    delete document.nodes['faq-section']
    delete document.nodes['faq-container']
    delete document.nodes['faq-heading']
    document.nodes['page-root']!.children = ['section-1', 'contact-section']

    const review = analyzeSiteIntelligence({ document, brief })
    const codes = review.findings.map(finding => finding.code)

    expect(codes).toEqual(expect.arrayContaining([
      'hero-copy-too-long',
      'cta-needs-clarity',
      'missing-trust-evidence',
      'missing-objection-step',
      'weak-text-contrast',
      'mobile-width-risk',
      'mobile-grid-risk',
    ]))
    expect(review.findings.length).toBeLessThanOrEqual(24)
    expect(review.findings.every(finding => finding.evidence.every(evidence => document.nodes[evidence.nodeId]))).toBe(true)
  })

  it('explains hierarchy, placement, color and layout only from brief and document evidence', () => {
    const explanations = explainDesignEvidence({
      document: intelligenceDocument(),
      brief,
      selectedNodeId: 'section-1',
    })

    expect(explanations.map(item => item.kind)).toEqual(['hierarchy', 'placement', 'color', 'layout'])
    expect(explanations.every(item => item.evidenceNodeIds.length > 0)).toBe(true)
    expect(explanations.every(item => item.citations.some(citation => citation.kind === 'goal'))).toBe(true)
    expect(JSON.stringify(explanations)).toContain(brief.primaryGoal)
  })

  it('captures and validates default Remix preservation while narrowly allowing explicit copy changes', () => {
    const base = intelligenceDocument()
    const captured = captureRemixConstraints({ document: base, sectionNodeId: 'section-1' })
    expect(captured.accepted).toBe(true)
    if (!captured.accepted) return

    const layoutOnly = structuredClone(base)
    layoutOnly.nodes['section-1']!.style = { ...layoutOnly.nodes['section-1']!.style, textAlign: 'center' }
    expect(validateRemixConstraints({ base, proposed: layoutOnly, constraints: captured.constraints })).toEqual({ accepted: true })

    const copyChanged = structuredClone(layoutOnly)
    copyChanged.nodes['heading-1']!.props = { text: 'Nội dung đã đổi', level: 1 }
    expect(validateRemixConstraints({ base, proposed: copyChanged, constraints: captured.constraints })).toEqual({
      accepted: false, code: 'copy_changed',
    })

    const relaxed = captureRemixConstraints({
      document: base,
      sectionNodeId: 'section-1',
      allowedChanges: ['copy'],
    })
    expect(relaxed.accepted).toBe(true)
    if (!relaxed.accepted) return
    expect(validateRemixConstraints({ base, proposed: copyChanged, constraints: relaxed.constraints })).toEqual({ accepted: true })

    const escaped = structuredClone(layoutOnly)
    escaped.nodes['trust-heading']!.props = { text: 'Đã thoát phạm vi', level: 2 }
    expect(validateRemixConstraints({ base, proposed: escaped, constraints: captured.constraints })).toEqual({
      accepted: false, code: 'surroundings_changed',
    })
  })

  it('rejects non-section Remix scopes and protected CTA, brand or theme changes', () => {
    const base = intelligenceDocument()
    expect(captureRemixConstraints({ document: base, sectionNodeId: 'heading-1' })).toEqual({
      accepted: false, code: 'invalid_scope',
    })
    const captured = captureRemixConstraints({ document: base, sectionNodeId: 'section-1' })
    expect(captured.accepted).toBe(true)
    if (!captured.accepted) return

    const cta = structuredClone(base)
    cta.nodes['button-1']!.props = { text: 'Mua ngay', href: '#buy' }
    expect(validateRemixConstraints({ base, proposed: cta, constraints: captured.constraints })).toEqual({
      accepted: false, code: 'cta_changed',
    })

    const brand = structuredClone(base)
    brand.theme.colors.primary = '#dc2626'
    expect(validateRemixConstraints({ base, proposed: brand, constraints: captured.constraints })).toEqual({
      accepted: false, code: 'theme_changed',
    })
  })
})
