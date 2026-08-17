import { materializeLandingPageBlueprintV2, type LandingPageBlueprintV2 } from '@zenui/ai-core'
import { applyCommandTransaction, type DesignCommand } from '@zenui/design-commands'
import { createValidDesignFixture, type DesignDocument } from '@zenui/design-schema'

export interface PrototypeBrief {
  description: string
  offer: string
  audience: string
  goal: string
  cta: string
  style: string
  brandDetails: string
  sections: string[]
}

export interface PrototypeDirection {
  id: string
  name: string
  rationale: string
  character: string
  document: DesignDocument
}

export interface PrototypeProposal {
  document: DesignDocument
  summary: string
  preserved: string[]
  scopeLabel: string
}

export const initialBrief: PrototypeBrief = {
  description: 'NovaFlow giúp các nhóm sản phẩm nhỏ lập kế hoạch ra mắt mà không cần nhiều bảng tính rời rạc.',
  offer: 'Không gian lập kế hoạch nhẹ nhàng cho các đợt ra mắt sản phẩm',
  audience: 'Nhóm sản phẩm nhỏ đang xây dựng quy trình ra mắt có thể lặp lại đầu tiên',
  goal: 'Nhận yêu cầu đặt lịch tư vấn phù hợp',
  cta: 'Đặt lịch tư vấn',
  style: 'Rõ ràng, tự tin và hiện đại',
  brandDetails: 'NovaFlow · xanh chàm đậm kết hợp nền trung tính ấm',
  sections: ['Giới thiệu', 'Lợi ích', 'Tin cậy', 'Câu hỏi', 'Liên hệ'],
}

const directionPresets = [
  {
    id: 'clear-momentum', name: 'Đà tiến rõ ràng', character: 'Trực tiếp và tập trung',
    rationale: 'Hệ thống phân cấp trực tiếp giúp lợi ích chính và hành động đặt lịch dễ hiểu.',
    theme: 'indigo', mood: 'confident', density: 'balanced', navbar: 'compact', hero: 'split', features: 'grid', testimonials: 'cards', faq: 'stacked', finalCta: 'panel', footer: 'simple',
  },
  {
    id: 'trusted-advisor', name: 'Người bạn đáng tin', character: 'Ưu tiên bằng chứng',
    rationale: 'Câu chuyện dựa trên bằng chứng xây dựng niềm tin trước khi mời một nhóm thận trọng đặt lịch.',
    theme: 'emerald', mood: 'friendly', density: 'airy', navbar: 'centered', hero: 'centered', features: 'alternating', testimonials: 'spotlight', faq: 'two-column', finalCta: 'split', footer: 'columns',
  },
  {
    id: 'bold-launch', name: 'Khởi động nổi bật', character: 'Năng động và giàu hình ảnh',
    rationale: 'Phần mở đầu mạnh và lưới lợi ích đa dạng tạo năng lượng trong khi vẫn giữ nguyên thông điệp.',
    theme: 'coral', mood: 'bold', density: 'compact', navbar: 'announcement', hero: 'product-shot', features: 'bento', testimonials: 'cards', faq: 'two-column', finalCta: 'panel', footer: 'columns',
  },
] as const

const alternatePresets = [
  { ...directionPresets[0], id: 'calm-clarity', name: 'Rõ ràng và điềm tĩnh', character: 'Thoáng và an tâm', theme: 'graphite', mood: 'editorial', density: 'airy', hero: 'editorial', features: 'alternating' },
  { ...directionPresets[1], id: 'friendly-guide', name: 'Hướng dẫn thân thiện', character: 'Ấm áp và gần gũi', theme: 'violet', mood: 'friendly', density: 'balanced', hero: 'centered', features: 'grid' },
  { ...directionPresets[2], id: 'decisive-proof', name: 'Bằng chứng thuyết phục', character: 'Gọn và giàu bằng chứng', theme: 'emerald', mood: 'confident', density: 'compact', hero: 'split', features: 'bento' },
] as const

type DirectionPreset = (typeof directionPresets)[number] | (typeof alternatePresets)[number]

function blueprintFor(brief: PrototypeBrief, preset: DirectionPreset): LandingPageBlueprintV2 {
  return {
    version: 2,
    pagePreset: 'saas',
    brand: 'NovaFlow',
    theme: {
      preset: preset.theme,
      mood: preset.mood,
      density: preset.density,
      headingFont: 'Manrope',
      bodyFont: 'Manrope',
    },
    navbar: {
      variant: preset.navbar,
      ...(preset.navbar === 'announcement' ? { announcement: 'Một cách nhẹ nhàng hơn để lên kế hoạch cho lần ra mắt tiếp theo' } : {}),
      links: [
        { text: 'Lợi ích', target: 'features' },
        { text: 'Câu chuyện', target: 'testimonials' },
        { text: 'Câu hỏi', target: 'faq' },
      ],
      cta: { text: brief.cta, href: '#final-cta-section' },
    },
    hero: {
      variant: preset.hero,
      badge: brief.style,
      heading: 'Lập kế hoạch cho mọi lần ra mắt một cách rõ ràng',
      paragraph: `${brief.offer}. Dành cho ${brief.audience.toLowerCase()}.`,
      primaryCta: { text: brief.cta, href: '#final-cta-section' },
      secondaryCta: { text: 'Xem cách hoạt động', href: '#features-section' },
      proof: 'Một kế hoạch rõ ràng từ ý tưởng đầu tiên đến ngày ra mắt',
    },
    sections: [
      {
        type: 'features',
        variant: preset.features,
        eyebrow: 'Lợi ích cho đội ngũ của bạn',
        heading: 'Thay thế sự hỗn loạn bằng đà tiến chung',
        paragraph: `NovaFlow hỗ trợ mục tiêu: ${brief.goal.toLowerCase()}.`,
        items: [
          { icon: 'check', heading: 'Một câu chuyện ra mắt', paragraph: 'Giữ mục tiêu, quyết định, người phụ trách và cột mốc trong một kế hoạch dễ hiểu.' },
          { icon: 'star', heading: 'Bước tiếp theo có hướng dẫn', paragraph: 'Biết điều gì cần chú ý tiếp theo mà không phải tạo thêm bảng tính.' },
          { icon: 'arrow-right', heading: 'Bàn giao tự tin', paragraph: 'Trao cho mọi thành viên đủ ngữ cảnh để tiếp tục công việc.' },
          { icon: 'menu', heading: 'Tầm nhìn nhẹ nhàng', paragraph: 'Phát hiện rủi ro sớm trong khi toàn bộ kế hoạch vẫn dễ xem.' },
        ],
      },
      {
        type: 'testimonials',
        variant: preset.testimonials,
        eyebrow: 'Được các nhóm tập trung tin dùng',
        heading: 'Kế hoạch ra mắt mà ai cũng theo dõi được',
        items: [
          { quote: 'NovaFlow thay thế năm công cụ rời rạc bằng một kế hoạch mà cả nhóm đều hiểu.', name: 'Linh Nguyễn', role: 'Trưởng nhóm sản phẩm, Northstar' },
          { quote: 'Chúng tôi dành ít thời gian hỏi tiến độ hơn và nhiều thời gian cải thiện lần ra mắt hơn.', name: 'Minh Trần', role: 'Nhà sáng lập, Brightside' },
          { quote: 'Việc chuyển giao từ chiến lược sang thực thi cuối cùng cũng trở nên nhẹ nhàng.', name: 'An Phạm', role: 'Trưởng nhóm marketing, Luma' },
        ],
      },
      {
        type: 'faq',
        variant: preset.faq,
        eyebrow: 'Câu hỏi thường gặp',
        heading: 'Mọi thứ đội ngũ cần để bắt đầu',
        items: [
          { question: 'Chúng tôi có thể bắt đầu với một lần ra mắt không?', answer: 'Có. Hãy bắt đầu với một lần ra mắt đang hoạt động và dùng lại quy trình khi đội ngũ đã quen.' },
          { question: 'Các thành viên có cần được đào tạo không?', answer: 'Không cần thiết lập kỹ thuật. Không gian làm việc hướng dẫn từng người theo câu chuyện ra mắt.' },
          { question: 'Chúng tôi có thể giữ quy trình hiện tại không?', answer: 'Có. Giữ lại các cột mốc và quyết định đang hiệu quả, rồi đơn giản hóa phần còn lại theo thời gian.' },
        ],
      },
      {
        type: 'final-cta',
        variant: preset.finalCta,
        heading: 'Trao cho lần ra mắt tiếp theo một lộ trình rõ ràng',
        paragraph: 'Xem cách NovaFlow biến công việc rời rạc thành kế hoạch mà cả đội ngũ có thể tin tưởng.',
        primaryCta: { text: brief.cta, href: '#final-cta-section' },
        secondaryCta: { text: 'Xem lại lợi ích', href: '#features-section' },
      },
      {
        type: 'footer',
        variant: preset.footer,
        tagline: 'Lập kế hoạch ra mắt nhẹ nhàng và có hướng dẫn cho các nhóm tập trung.',
        columns: preset.footer === 'columns' ? [
          { heading: 'Sản phẩm', links: [{ text: 'Lợi ích', href: '#features-section' }, { text: 'Câu hỏi', href: '#faq-section' }] },
          { heading: 'Công ty', links: [{ text: 'Liên hệ', href: 'mailto:hello@example.com' }] },
        ] : [],
        copyright: '© 2026 NovaFlow. Nội dung mẫu.',
      },
    ],
  }
}

export function createDirectionSet(brief: PrototypeBrief, round = 0): PrototypeDirection[] {
  const current = createValidDesignFixture()
  const presets: readonly DirectionPreset[] = round % 2 === 0 ? directionPresets : alternatePresets
  return presets.map(preset => {
    const result = materializeLandingPageBlueprintV2({ blueprint: blueprintFor(brief, preset), current })
    if (!result.accepted) throw new Error(`prototype_direction_invalid:${preset.id}`)
    return {
      id: preset.id,
      name: preset.name,
      rationale: preset.rationale,
      character: preset.character,
      document: result.document,
    }
  })
}

function descendantIds(document: DesignDocument, rootId: string): string[] {
  const node = document.nodes[rootId]
  if (!node) return []
  return [rootId, ...node.children.flatMap(childId => descendantIds(document, childId))]
}

export function sectionLabel(document: DesignDocument, nodeId: string): string {
  const node = document.nodes[nodeId]
  if (!node) return 'Phần website'
  if (node.type === 'navbar') return 'Đầu trang'
  if (node.type === 'hero') return 'Giới thiệu'
  if (nodeId.includes('features')) return 'Lợi ích'
  if (nodeId.includes('testimonial')) return 'Câu chuyện khách hàng'
  if (nodeId.includes('faq')) return 'Câu hỏi'
  if (nodeId.includes('final-cta')) return 'Hành động cuối'
  if (nodeId.includes('footer')) return 'Chân trang'
  return 'label' in node.props && typeof node.props.label === 'string' ? node.props.label : 'Phần website'
}

export function storyPurpose(nodeId: string): string {
  if (nodeId.includes('navbar') || nodeId.includes('hero')) return 'Giới thiệu'
  if (nodeId.includes('testimonial')) return 'Xây dựng niềm tin'
  if (nodeId.includes('features')) return 'Giải thích giá trị'
  if (nodeId.includes('faq')) return 'Giải đáp câu hỏi'
  return 'Mời hành động'
}

export function createPrototypeProposal(
  accepted: DesignDocument,
  selectedSectionId: string,
  variant = 0,
): PrototypeProposal {
  const replacement = structuredClone(accepted)
  const headingId = descendantIds(replacement, selectedSectionId).find(id => replacement.nodes[id]?.type === 'heading')
  if (headingId) {
    const heading = replacement.nodes[headingId]!
    heading.props = {
      ...heading.props,
      text: variant % 2 === 0
        ? 'Trao cho mỗi lần ra mắt một bước tiếp theo rõ ràng'
        : 'Biến sự chưa chắc chắn thành đà tiến chung',
    }
  }
  const section = replacement.nodes[selectedSectionId]
  if (section) {
    section.style = {
      ...section.style,
      backgroundColor: variant % 2 === 0 ? '#f5f3ff' : '#ecfdf3',
    }
  }

  const command: DesignCommand = {
    commandId: `prototype-proposal-${variant}`,
    documentVersion: accepted.version,
    source: 'ai',
    type: 'REPLACE_DOCUMENT',
    document: replacement,
  }
  const result = applyCommandTransaction(accepted, accepted.version, [command])
  if (!result.accepted) throw new Error(`prototype_proposal_invalid:${result.error.code}`)
  return {
    document: result.document,
    summary: variant % 2 === 0
      ? 'Rút gọn thông điệp và làm bước tiếp theo nổi bật hơn.'
      : 'Diễn đạt lại phần này quanh đà tiến chung trong khi vẫn giữ nguyên mục đích.',
    preserved: ['Hành động Đặt lịch tư vấn', 'Thương hiệu NovaFlow', 'Các phần nội dung xung quanh'],
    scopeLabel: `Phần ${sectionLabel(accepted, selectedSectionId)}`,
  }
}

export function acceptPrototypeProposal(accepted: DesignDocument, proposal: PrototypeProposal): DesignDocument {
  const command: DesignCommand = {
    commandId: 'prototype-accept-proposal',
    documentVersion: accepted.version,
    source: 'ai',
    type: 'REPLACE_DOCUMENT',
    document: proposal.document,
  }
  const result = applyCommandTransaction(accepted, accepted.version, [command])
  if (!result.accepted) throw new Error(`prototype_accept_invalid:${result.error.code}`)
  return result.document
}

export function documentFingerprint(document: DesignDocument): string {
  const benefitsHeading = descendantIds(document, 'features-section')
    .map(id => document.nodes[id])
    .find(node => node?.type === 'heading')
  return `${document.version}:${document.theme.colors.primary}:${benefitsHeading && 'text' in benefitsHeading.props ? benefitsHeading.props.text : 'no-heading'}`
}
