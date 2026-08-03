import { validateDesignDocument, type DesignDocument, type DesignNode } from '@zenui/design-schema'
import { z } from 'zod'

import { websiteBriefSchema, type WebsiteBrief } from './guided-brief'

export const SITE_INTELLIGENCE_POLICY_VERSION = 'site-intelligence-v1' as const

export const storyPurposeSchema = z.enum(['introduction', 'trust', 'value', 'objections', 'action'])
export type StoryPurpose = z.infer<typeof storyPurposeSchema>

export const intelligenceCitationSchema = z.object({
  kind: z.enum(['audience', 'goal', 'cta']),
  value: z.string().trim().min(2).max(500),
}).strict()
export type IntelligenceCitation = z.infer<typeof intelligenceCitationSchema>

export const intelligenceEvidenceSchema = z.object({
  nodeId: z.string().min(1).max(100),
  sectionNodeId: z.string().min(1).max(100),
  detail: z.string().trim().min(1).max(300),
}).strict()
export type IntelligenceEvidence = z.infer<typeof intelligenceEvidenceSchema>

export const siteIntelligenceFindingCodeSchema = z.enum([
  'missing-story-step',
  'story-order-risk',
  'hero-copy-too-long',
  'cta-needs-clarity',
  'missing-trust-evidence',
  'missing-objection-step',
  'weak-text-contrast',
  'mobile-width-risk',
  'mobile-grid-risk',
])
export type SiteIntelligenceFindingCode = z.infer<typeof siteIntelligenceFindingCodeSchema>

export const siteIntelligenceFindingSchema = z.object({
  fingerprint: z.string().regex(/^[a-f0-9]{16}$/),
  evidenceFingerprint: z.string().regex(/^[a-f0-9]{16}$/),
  code: siteIntelligenceFindingCodeSchema,
  category: z.enum(['story', 'audience', 'mobile', 'content']),
  severity: z.enum(['note', 'warning']),
  title: z.string().trim().min(1).max(160),
  explanation: z.string().trim().min(1).max(500),
  actionLabel: z.string().trim().min(1).max(120),
  suggestedPrompt: z.string().trim().min(3).max(500).nullable(),
  evidence: z.array(intelligenceEvidenceSchema).min(1).max(8),
  citations: z.array(intelligenceCitationSchema).min(1).max(3),
}).strict()
export type SiteIntelligenceFinding = z.infer<typeof siteIntelligenceFindingSchema>

export const pageStoryStepSchema = z.object({
  nodeId: z.string().min(1).max(100),
  label: z.string().trim().min(1).max(100),
  purpose: storyPurposeSchema,
  purposeLabel: z.string().trim().min(1).max(100),
  explanation: z.string().trim().min(1).max(400),
  hidden: z.boolean(),
  evidenceNodeIds: z.array(z.string().min(1).max(100)).min(1).max(12),
}).strict()
export type PageStoryStep = z.infer<typeof pageStoryStepSchema>

export const designExplanationSchema = z.object({
  kind: z.enum(['hierarchy', 'placement', 'color', 'layout']),
  title: z.string().trim().min(1).max(120),
  explanation: z.string().trim().min(1).max(500),
  evidenceNodeIds: z.array(z.string().min(1).max(100)).min(1).max(12),
  citations: z.array(intelligenceCitationSchema).min(1).max(3),
}).strict()
export type DesignExplanation = z.infer<typeof designExplanationSchema>

export const siteIntelligenceReviewSchema = z.object({
  policyVersion: z.literal(SITE_INTELLIGENCE_POLICY_VERSION),
  documentVersion: z.number().int().positive(),
  documentFingerprint: z.string().regex(/^[a-f0-9]{16}$/),
  briefFingerprint: z.string().regex(/^[a-f0-9]{16}$/),
  story: z.array(pageStoryStepSchema).min(1).max(50),
  missingPurposes: z.array(storyPurposeSchema).max(5),
  findings: z.array(siteIntelligenceFindingSchema).max(24),
}).strict()
export type SiteIntelligenceReview = z.infer<typeof siteIntelligenceReviewSchema>

export const remixAllowedChangeSchema = z.enum(['copy', 'cta', 'brand'])
export type RemixAllowedChange = z.infer<typeof remixAllowedChangeSchema>

export const remixConstraintsSchema = z.object({
  policyVersion: z.literal(SITE_INTELLIGENCE_POLICY_VERSION),
  sectionNodeId: z.string().min(1).max(100),
  allowedChanges: z.array(remixAllowedChangeSchema).max(3),
  copyFingerprint: z.string().regex(/^[a-f0-9]{16}$/),
  ctaFingerprint: z.string().regex(/^[a-f0-9]{16}$/),
  brandFingerprint: z.string().regex(/^[a-f0-9]{16}$/),
  surroundingsFingerprint: z.string().regex(/^[a-f0-9]{16}$/),
}).strict()
export type RemixConstraints = z.infer<typeof remixConstraintsSchema>

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function fingerprint(value: unknown): string {
  const input = canonical(value)
  let left = 0x811c9dc5
  let right = 0x9e3779b9
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index)
    left = Math.imul(left ^ code, 0x01000193) >>> 0
    right = Math.imul(right ^ code, 0x85ebca6b) >>> 0
  }
  return `${left.toString(16).padStart(8, '0')}${right.toString(16).padStart(8, '0')}`
}

function pageRoot(document: DesignDocument): DesignNode | null {
  const id = document.pages[0]?.rootNodeId
  return id ? document.nodes[id] ?? null : null
}

function topLevelSections(document: DesignDocument): DesignNode[] {
  const root = pageRoot(document)
  if (!root || root.type !== 'page') return []
  return root.children.flatMap(id => {
    const node = document.nodes[id]
    return node && (node.type === 'navbar' || node.type === 'hero' || node.type === 'section') ? [node] : []
  })
}

function subtreeIds(document: DesignDocument, rootId: string): string[] {
  const node = document.nodes[rootId]
  if (!node) return []
  return [rootId, ...node.children.flatMap(id => subtreeIds(document, id))]
}

function containingSectionId(document: DesignDocument, nodeId: string): string | null {
  const rootId = pageRoot(document)?.id
  let current: string | null = nodeId
  const visited = new Set<string>()
  while (current && !visited.has(current)) {
    visited.add(current)
    const currentNode: DesignNode | undefined = document.nodes[current]
    if (!currentNode) return null
    if (
      (currentNode.type === 'navbar' || currentNode.type === 'hero' || currentNode.type === 'section')
      && currentNode.parentId === rootId
    ) return currentNode.id
    current = currentNode.parentId
  }
  return null
}

function sectionLabel(node: DesignNode): string {
  if (node.type === 'navbar' && 'brand' in node.props) return String(node.props.brand)
  if ((node.type === 'hero' || node.type === 'section') && 'label' in node.props && node.props.label) {
    return String(node.props.label)
  }
  return node.type === 'hero' ? 'Mở đầu' : 'Nội dung'
}

function nodeText(node: DesignNode): string {
  if ('text' in node.props && typeof node.props.text === 'string') return node.props.text
  if (node.type === 'feature-card' && 'title' in node.props && 'description' in node.props) {
    return `${String(node.props.title)} ${String(node.props.description)}`
  }
  if (node.type === 'navbar' && 'brand' in node.props) return String(node.props.brand)
  return ''
}

function sectionText(document: DesignDocument, sectionId: string): string {
  return subtreeIds(document, sectionId).map(id => nodeText(document.nodes[id]!)).filter(Boolean).join(' ')
}

const purposeLabels: Record<StoryPurpose, string> = {
  introduction: 'Giới thiệu',
  trust: 'Xây dựng niềm tin',
  value: 'Giải thích giá trị',
  objections: 'Giải đáp băn khoăn',
  action: 'Mời hành động',
}

const purposeExplanations: Record<StoryPurpose, string> = {
  introduction: 'Giúp khách truy cập hiểu nhanh website này dành cho ai và mang lại điều gì.',
  trust: 'Đưa ra bằng chứng để hỗ trợ mức độ tin cậy của thông điệp chính.',
  value: 'Làm rõ lợi ích, cách hoạt động hoặc lý do nên cân nhắc giải pháp.',
  objections: 'Giải đáp câu hỏi và băn khoăn trước khi khách truy cập hành động.',
  action: 'Cho khách truy cập một bước tiếp theo rõ ràng, phù hợp với mục tiêu website.',
}

function storyPurpose(node: DesignNode, text: string): StoryPurpose {
  const key = `${node.id} ${sectionLabel(node)} ${text}`.toLocaleLowerCase('en-US')
  if (node.type === 'navbar' || node.type === 'hero' || /hero|intro|welcome|announcement|giới thiệu|mở đầu/.test(key)) return 'introduction'
  if (/testimonial|customer|logo|trust|review|proof|result|stat|tin dùng|khách hàng|kết quả|bằng chứng/.test(key)) return 'trust'
  if (/faq|question|objection|frequently|câu hỏi|băn khoăn|thắc mắc/.test(key)) return 'objections'
  if (/cta|contact|footer|start|signup|sign-up|action|liên hệ|đặt lịch|bắt đầu|đăng ký/.test(key)) return 'action'
  return 'value'
}

function citations(brief: WebsiteBrief): IntelligenceCitation[] {
  return [
    { kind: 'goal', value: brief.primaryGoal },
    { kind: 'audience', value: brief.audience },
    { kind: 'cta', value: brief.cta },
  ]
}

function evidence(document: DesignDocument, nodeId: string, detail: string): IntelligenceEvidence {
  return { nodeId, sectionNodeId: containingSectionId(document, nodeId) ?? nodeId, detail }
}

function createFinding(input: Omit<SiteIntelligenceFinding, 'fingerprint' | 'evidenceFingerprint'>): SiteIntelligenceFinding {
  const evidenceFingerprint = fingerprint(input.evidence)
  return {
    ...input,
    evidenceFingerprint,
    fingerprint: fingerprint({ policy: SITE_INTELLIGENCE_POLICY_VERSION, code: input.code, evidenceFingerprint, citations: input.citations }),
  }
}

function words(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length
}

function normalizedWords(value: string): string[] {
  return value.toLocaleLowerCase('en-US').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/).filter(word => word.length > 2)
}

function ctaMatches(buttonText: string, expected: string): boolean {
  const actual = new Set(normalizedWords(buttonText))
  return normalizedWords(expected).some(word => actual.has(word))
}

function hexRgb(value: string): [number, number, number] {
  return [1, 3, 5].map(index => Number.parseInt(value.slice(index, index + 2), 16)) as [number, number, number]
}

function luminance(value: string): number {
  const channels = hexRgb(value).map(channel => {
    const normalized = channel / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
}

function contrast(left: string, right: string): number {
  const [bright, dark] = [luminance(left), luminance(right)].sort((a, b) => b - a)
  return (bright! + 0.05) / (dark! + 0.05)
}

function effectiveBackground(document: DesignDocument, node: DesignNode): string {
  let current: DesignNode | undefined = node
  const visited = new Set<string>()
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    if (current.style.backgroundColor) return current.style.backgroundColor
    current = current.parentId ? document.nodes[current.parentId] : undefined
  }
  return document.theme.colors.background
}

export function analyzeSiteIntelligence(input: {
  document: DesignDocument
  brief: WebsiteBrief
}): SiteIntelligenceReview {
  const document = validateDesignDocument(input.document)
  const brief = websiteBriefSchema.parse(input.brief)
  if (!document.success) throw new Error('invalid_design_document')
  const sections = topLevelSections(document.data)
  if (sections.length === 0) throw new Error('page_story_required')
  const story: PageStoryStep[] = sections.map(section => {
    const ids = subtreeIds(document.data, section.id)
    const purpose = storyPurpose(section, sectionText(document.data, section.id))
    return {
      nodeId: section.id,
      label: sectionLabel(section),
      purpose,
      purposeLabel: purposeLabels[purpose],
      explanation: purposeExplanations[purpose],
      hidden: 'hidden' in section.props && section.props.hidden === true,
      evidenceNodeIds: ids.slice(0, 12),
    }
  })
  const present = new Set(story.map(step => step.purpose))
  const expected: StoryPurpose[] = ['introduction', 'trust', 'value', 'objections', 'action']
  const missingPurposes = expected.filter(purpose => !present.has(purpose))
  const allCitations = citations(brief)
  const findings: SiteIntelligenceFinding[] = []
  const firstSection = sections[0]!

  for (const purpose of missingPurposes) {
    const specificCode: SiteIntelligenceFindingCode = purpose === 'trust'
      ? 'missing-trust-evidence'
      : purpose === 'objections' ? 'missing-objection-step' : 'missing-story-step'
    findings.push(createFinding({
      code: specificCode,
      category: purpose === 'trust' ? 'audience' : 'story',
      severity: purpose === 'introduction' || purpose === 'action' ? 'warning' : 'note',
      title: `Câu chuyện trang chưa có bước “${purposeLabels[purpose]}”`,
      explanation: `${purposeExplanations[purpose]} Điều này có thể làm mục tiêu “${brief.primaryGoal}” kém rõ ràng hơn.`,
      actionLabel: 'Xem phần cần bổ sung',
      suggestedPrompt: `Đề xuất một phần ${purposeLabels[purpose].toLocaleLowerCase('vi-VN')} phù hợp với mục tiêu ${brief.primaryGoal}`,
      evidence: [evidence(document.data, firstSection.id, `Không tìm thấy section có vai trò ${purposeLabels[purpose]}.`)],
      citations: allCitations,
    }))
  }

  const hero = sections.find(section => section.type === 'hero') ?? sections[0]
  if (hero) {
    const heroText = sectionText(document.data, hero.id)
    if (words(heroText) > 80) {
      findings.push(createFinding({
        code: 'hero-copy-too-long', category: 'content', severity: 'warning',
        title: 'Phần mở đầu có nhiều nội dung',
        explanation: `Phần mở đầu có ${words(heroText)} từ; thông điệp chính cho ${brief.audience} có thể khó quét nhanh.`,
        actionLabel: 'Làm phần mở đầu ngắn gọn hơn',
        suggestedPrompt: 'Rút gọn phần mở đầu nhưng giữ nguyên thông điệp chính và hành động chính',
        evidence: [evidence(document.data, hero.id, `Phần mở đầu hiện có ${words(heroText)} từ.`)],
        citations: allCitations,
      }))
    }
  }

  const buttons = Object.values(document.data.nodes).filter(node => node.type === 'button')
  const matchingCta = buttons.find(button => (
    'text' in button.props && typeof button.props.text === 'string' && ctaMatches(button.props.text, brief.cta)
  ))
  if (!matchingCta) {
    const target: DesignNode = buttons[0] ?? firstSection
    const currentButtonText = target.type === 'button' && 'text' in target.props
      ? String(target.props.text)
      : null
    findings.push(createFinding({
      code: 'cta-needs-clarity', category: 'audience', severity: 'warning',
      title: 'Hành động chính chưa khớp bản mô tả',
      explanation: `Không tìm thấy nút diễn đạt rõ hành động “${brief.cta}” cho ${brief.audience}.`,
      actionLabel: 'Làm rõ hành động chính',
      suggestedPrompt: `Làm rõ hành động chính “${brief.cta}” nhưng giữ nguyên đích liên kết`,
      evidence: [evidence(document.data, target.id, currentButtonText ? `Nút hiện tại là “${currentButtonText}”.` : 'Không tìm thấy nút hành động.')],
      citations: allCitations,
    }))
  }

  for (const node of Object.values(document.data.nodes)) {
    if (node.type !== 'heading' && node.type !== 'paragraph') continue
    const foreground = node.style.color ?? document.data.theme.colors.text
    const background = effectiveBackground(document.data, node)
    if (contrast(foreground, background) < 4.5) {
      findings.push(createFinding({
        code: 'weak-text-contrast', category: 'mobile', severity: 'warning',
        title: 'Đoạn chữ này có độ tương phản thấp',
        explanation: `Màu chữ ${foreground} trên nền ${background} có thể khó đọc; đây là kiểm tra tĩnh, không phải chứng nhận accessibility.`,
        actionLabel: 'Tăng độ tương phản',
        suggestedPrompt: 'Tăng độ tương phản của phần chữ này trong khi giữ phong cách thương hiệu',
        evidence: [evidence(document.data, node.id, `Tỷ lệ tương phản tĩnh là ${contrast(foreground, background).toFixed(2)}:1.`)],
        citations: allCitations,
      }))
    }
  }

  for (const node of Object.values(document.data.nodes)) {
    const mobile = { ...node.style, ...(node.responsive.mobile ?? {}) }
    if (typeof mobile.width === 'number' && mobile.width > 390) {
      findings.push(createFinding({
        code: 'mobile-width-risk', category: 'mobile', severity: 'warning',
        title: 'Chiều rộng có thể vượt màn hình điện thoại',
        explanation: `Chiều rộng ${mobile.width}px cần được kiểm tra ở bề mặt 390px để hỗ trợ ${brief.primaryGoal}.`,
        actionLabel: 'Điều chỉnh chiều rộng điện thoại',
        suggestedPrompt: 'Điều chỉnh phần này để vừa màn hình điện thoại mà không đổi nội dung',
        evidence: [evidence(document.data, node.id, `Chiều rộng mobile được tính là ${mobile.width}px.`)],
        citations: allCitations,
      }))
    }
    if (mobile.display === 'grid' || mobile.gridColumns !== undefined) {
      if ((mobile.gridColumns ?? 1) > 1) {
        findings.push(createFinding({
          code: 'mobile-grid-risk', category: 'mobile', severity: 'note',
          title: 'Bố cục nhiều cột cần kiểm tra trên điện thoại',
          explanation: `${mobile.gridColumns} cột trên điện thoại có thể làm nội dung chật hơn cho ${brief.audience}.`,
          actionLabel: 'Xem bố cục một cột',
          suggestedPrompt: 'Thử bố cục một cột trên điện thoại và giữ nguyên nội dung',
          evidence: [evidence(document.data, node.id, `Mobile đang dùng ${mobile.gridColumns} cột.`)],
          citations: allCitations,
        }))
      }
    }
  }

  return siteIntelligenceReviewSchema.parse({
    policyVersion: SITE_INTELLIGENCE_POLICY_VERSION,
    documentVersion: document.data.version,
    documentFingerprint: fingerprint({ ...document.data, version: undefined }),
    briefFingerprint: fingerprint(brief),
    story,
    missingPurposes,
    findings: findings.slice(0, 24),
  })
}

export function explainDesignEvidence(input: {
  document: DesignDocument
  brief: WebsiteBrief
  selectedNodeId?: string | null
}): DesignExplanation[] {
  const document = validateDesignDocument(input.document)
  const brief = websiteBriefSchema.parse(input.brief)
  if (!document.success) throw new Error('invalid_design_document')
  const selectedId = input.selectedNodeId && document.data.nodes[input.selectedNodeId]
    ? input.selectedNodeId
    : topLevelSections(document.data)[0]?.id
  if (!selectedId) throw new Error('design_evidence_required')
  const sectionId = containingSectionId(document.data, selectedId) ?? selectedId
  const ids = subtreeIds(document.data, sectionId).slice(0, 12)
  const section = document.data.nodes[sectionId]!
  const goalCitation = citations(brief)
  const primary = document.data.theme.colors.primary
  const explanations: DesignExplanation[] = [
    {
      kind: 'hierarchy', title: 'Thứ bậc nội dung',
      explanation: `Tiêu đề và nội dung trong ${sectionLabel(section)} ưu tiên thông điệp hỗ trợ mục tiêu “${brief.primaryGoal}”.`,
      evidenceNodeIds: ids, citations: goalCitation,
    },
    {
      kind: 'placement', title: 'Vị trí trong câu chuyện trang',
      explanation: `Phần này nằm ở vị trí ${topLevelSections(document.data).findIndex(node => node.id === sectionId) + 1}, giúp ${brief.audience} đi theo thứ tự nội dung hiện tại.`,
      evidenceNodeIds: [sectionId], citations: goalCitation,
    },
    {
      kind: 'color', title: 'Màu sắc',
      explanation: `Màu chính ${primary} tạo điểm nhấn cho hành động “${brief.cta}” trong hệ màu được chấp nhận.`,
      evidenceNodeIds: ids, citations: goalCitation,
    },
    {
      kind: 'layout', title: 'Bố cục',
      explanation: `Khoảng cách và cách sắp xếp của ${sectionLabel(section)} nhóm nội dung liên quan để hỗ trợ mục tiêu “${brief.primaryGoal}”.`,
      evidenceNodeIds: [sectionId], citations: goalCitation,
    },
  ]
  return z.array(designExplanationSchema).length(4).parse(explanations)
}

function textSnapshot(document: DesignDocument, ids: readonly string[], includeCta: boolean): unknown[] {
  const result: unknown[] = []
  for (const id of ids) {
    const node = document.nodes[id]
    if (!node) continue
    if (node.type === 'button' || node.type === 'link') {
      if (includeCta) result.push({ id, type: node.type, props: node.props })
    } else if ('text' in node.props || node.type === 'feature-card') {
      result.push({ id, type: node.type, props: node.props })
    }
  }
  return result
}

function ctaSnapshot(document: DesignDocument, ids: readonly string[]): unknown[] {
  const result: unknown[] = []
  for (const id of ids) {
    const node = document.nodes[id]
    if (node && (node.type === 'button' || node.type === 'link')) {
      result.push({ id, type: node.type, props: node.props })
    }
  }
  return result
}

function brandSnapshot(document: DesignDocument): unknown {
  return {
    theme: document.theme,
    navbars: Object.values(document.nodes).flatMap(node => (
      node.type === 'navbar' && 'brand' in node.props
        ? [{ id: node.id, brand: String(node.props.brand) }]
        : []
    )),
  }
}

function surroundingsSnapshot(document: DesignDocument, sectionNodeId: string): unknown {
  const excluded = new Set(subtreeIds(document, sectionNodeId))
  return {
    projectId: document.projectId,
    pages: document.pages,
    rootChildren: pageRoot(document)?.children,
    nodes: Object.fromEntries(Object.entries(document.nodes).filter(([id]) => !excluded.has(id))),
  }
}

export function captureRemixConstraints(input: {
  document: DesignDocument
  sectionNodeId: string
  allowedChanges?: RemixAllowedChange[]
}): { accepted: true; constraints: RemixConstraints } | { accepted: false; code: 'invalid_scope' | 'invalid_document' } {
  const document = validateDesignDocument(input.document)
  if (!document.success) return { accepted: false, code: 'invalid_document' }
  const section = document.data.nodes[input.sectionNodeId]
  if (!section || (section.type !== 'navbar' && section.type !== 'hero' && section.type !== 'section') || section.parentId !== pageRoot(document.data)?.id) {
    return { accepted: false, code: 'invalid_scope' }
  }
  const allowed = z.array(remixAllowedChangeSchema).max(3).safeParse(input.allowedChanges ?? [])
  if (!allowed.success || new Set(allowed.data).size !== allowed.data.length) return { accepted: false, code: 'invalid_scope' }
  const ids = subtreeIds(document.data, section.id)
  return {
    accepted: true,
    constraints: remixConstraintsSchema.parse({
      policyVersion: SITE_INTELLIGENCE_POLICY_VERSION,
      sectionNodeId: section.id,
      allowedChanges: allowed.data,
      copyFingerprint: fingerprint(textSnapshot(document.data, ids, false)),
      ctaFingerprint: fingerprint(ctaSnapshot(document.data, ids)),
      brandFingerprint: fingerprint(brandSnapshot(document.data)),
      surroundingsFingerprint: fingerprint(surroundingsSnapshot(document.data, section.id)),
    }),
  }
}

export function validateRemixConstraints(input: {
  base: DesignDocument
  proposed: DesignDocument
  constraints: RemixConstraints
}): { accepted: true } | { accepted: false; code: 'invalid_document' | 'invalid_scope' | 'copy_changed' | 'cta_changed' | 'theme_changed' | 'surroundings_changed' } {
  const base = validateDesignDocument(input.base)
  const proposed = validateDesignDocument(input.proposed)
  const constraints = remixConstraintsSchema.safeParse(input.constraints)
  if (!base.success || !proposed.success || !constraints.success) return { accepted: false, code: 'invalid_document' }
  const captured = captureRemixConstraints({
    document: proposed.data,
    sectionNodeId: constraints.data.sectionNodeId,
    allowedChanges: constraints.data.allowedChanges,
  })
  if (!captured.accepted) return { accepted: false, code: 'invalid_scope' }
  const allowed = new Set(constraints.data.allowedChanges)
  if (!allowed.has('cta') && captured.constraints.ctaFingerprint !== constraints.data.ctaFingerprint) {
    return { accepted: false, code: 'cta_changed' }
  }
  if (!allowed.has('copy') && captured.constraints.copyFingerprint !== constraints.data.copyFingerprint) {
    return { accepted: false, code: 'copy_changed' }
  }
  if (!allowed.has('brand') && captured.constraints.brandFingerprint !== constraints.data.brandFingerprint) {
    return { accepted: false, code: 'theme_changed' }
  }
  if (captured.constraints.surroundingsFingerprint !== constraints.data.surroundingsFingerprint) {
    return { accepted: false, code: 'surroundings_changed' }
  }
  return { accepted: true }
}
