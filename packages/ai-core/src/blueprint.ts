import { componentRegistry, validateRegistryRelationships } from '@zenui/component-registry'
import {
  FONT_ALLOWLIST,
  ICON_ALLOWLIST,
  validateDesignDocument,
  type DesignDocument,
  type DesignNode,
  type NodeStyle,
  type RemoteImagePolicy,
} from '@zenui/design-schema'
import { z } from 'zod'

const safeHrefSchema = z.string().min(1).max(500).refine(value => {
  if (value.startsWith('#') || value.startsWith('/')) return !value.startsWith('//')
  try {
    const protocol = new URL(value).protocol
    return protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:' || protocol === 'tel:'
  } catch {
    return false
  }
}, 'unsafe_href')

const contentSchema = z.string().trim().min(1).max(500)
const ctaSchema = z.object({ text: z.string().trim().min(1).max(120), href: safeHrefSchema }).strict()
const imageSchema = z.object({ src: z.string().url().max(1000), alt: z.string().trim().min(1).max(300) }).strict()

export const landingPageBlueprintSchema = z.object({
  version: z.literal(1),
  brand: z.string().trim().min(1).max(100),
  theme: z.object({
    primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    text: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    headingFont: z.enum(FONT_ALLOWLIST),
    bodyFont: z.enum(FONT_ALLOWLIST),
  }).strict(),
  navbar: z.object({
    links: z.array(z.object({ text: z.string().trim().min(1).max(100), href: safeHrefSchema }).strict()).max(4),
    cta: ctaSchema.optional(),
  }).strict().optional(),
  hero: z.object({
    badge: z.string().trim().min(1).max(100).optional(),
    heading: z.string().trim().min(1).max(200),
    paragraph: z.string().trim().min(1).max(1000),
    cta: ctaSchema,
    image: imageSchema.optional(),
  }).strict(),
  features: z.array(z.object({
    icon: z.enum(ICON_ALLOWLIST),
    heading: z.string().trim().min(1).max(160),
    paragraph: z.string().trim().min(1).max(700),
  }).strict()).min(2).max(6),
  closingCta: z.object({ heading: z.string().trim().min(1).max(200), paragraph: contentSchema, cta: ctaSchema }).strict().optional(),
}).strict()

export type LandingPageBlueprint = z.infer<typeof landingPageBlueprintSchema>
export const landingPageBlueprintJsonSchema = z.toJSONSchema(landingPageBlueprintSchema, { target: 'draft-7' })

function node(type: DesignNode['type'], id: string, parentId: string | null, props?: Record<string, unknown>): DesignNode {
  const definition = componentRegistry[type]
  return {
    id,
    type,
    parentId,
    children: [],
    props: structuredClone(props ?? definition.defaultProps),
    style: structuredClone(definition.defaultStyle),
    responsive: {},
  }
}

function attach(nodes: DesignDocument['nodes'], parentId: string, child: DesignNode): DesignNode {
  nodes[child.id] = child
  nodes[parentId]!.children.push(child.id)
  return child
}

function style(target: DesignNode, value: NodeStyle, responsive?: { tablet?: NodeStyle; mobile?: NodeStyle }): DesignNode {
  target.style = { ...target.style, ...value }
  if (responsive?.tablet) target.responsive.tablet = responsive.tablet
  if (responsive?.mobile) target.responsive.mobile = responsive.mobile
  return target
}

function mixHex(left: string, right: string, rightWeight: number): string {
  const mix = (offset: number): string => {
    const leftValue = Number.parseInt(left.slice(offset, offset + 2), 16)
    const rightValue = Number.parseInt(right.slice(offset, offset + 2), 16)
    return Math.round(leftValue * (1 - rightWeight) + rightValue * rightWeight).toString(16).padStart(2, '0')
  }
  return `#${mix(1)}${mix(3)}${mix(5)}`
}

export function materializeLandingPageBlueprint(input: {
  blueprint: unknown
  current: DesignDocument
  imagePolicy?: RemoteImagePolicy
}): { accepted: true; document: DesignDocument } | { accepted: false; issues: string[] } {
  const parsed = landingPageBlueprintSchema.safeParse(input.blueprint)
  if (!parsed.success) return { accepted: false, issues: ['invalid_blueprint'] }
  const blueprint = parsed.data
  const heroImage = blueprint.hero.image
    && (!input.imagePolicy || input.imagePolicy.allows(blueprint.hero.image.src))
    ? blueprint.hero.image
    : undefined

  const primary = blueprint.theme.primary
  const background = blueprint.theme.background
  const text = blueprint.theme.text
  const white = '#ffffff'
  const softSurface = mixHex(background, primary, 0.06)
  const softerSurface = mixHex(background, primary, 0.025)
  const border = mixHex(background, text, 0.14)
  const mutedText = mixHex(text, background, 0.34)
  const primaryDark = mixHex(primary, text, 0.22)
  const primarySoft = mixHex(background, primary, 0.12)
  const onPrimary = mixHex(white, primary, 0.08)
  const pagePadding = { paddingLeft: 32, paddingRight: 32 }
  const mobilePadding = { paddingLeft: 20, paddingRight: 20 }

  const nodes: DesignDocument['nodes'] = {}
  nodes['page-root'] = style(node('page', 'page-root', null), { width: 'full', backgroundColor: background })

  const navbar = attach(nodes, 'page-root', style(node('navbar', 'navbar-1', 'page-root', { brand: blueprint.brand }), {
    width: 'full', backgroundColor: background, borderColor: border, borderWidth: 1,
  }))
  const navbarContainer = attach(nodes, navbar.id, style(node('container', 'navbar-container', navbar.id), {
    ...pagePadding, display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    gap: 24, maxWidth: 1200, paddingTop: 18, paddingBottom: 18,
  }, { mobile: { ...mobilePadding, gap: 14, paddingTop: 14, paddingBottom: 14 } }))
  attach(nodes, navbarContainer.id, style(node('link', 'navbar-brand', navbarContainer.id, { text: blueprint.brand, href: '#top' }), {
    fontFamily: blueprint.theme.headingFont, fontSize: 22, fontWeight: '800', color: text, letterSpacing: -0.5,
  }))

  const navbarActions = attach(nodes, navbarContainer.id, style(node('stack', 'navbar-actions', navbarContainer.id), {
    display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'end', gap: 24,
  }, { mobile: { gap: 10 } }))
  blueprint.navbar?.links.forEach((link, index) => attach(nodes, navbarActions.id, style(
    node('link', `navbar-link-${index + 1}`, navbarActions.id, link),
    { fontSize: 15, fontWeight: '600', color: mutedText },
    { mobile: { display: 'none' } },
  )))
  const navbarCta = blueprint.navbar?.cta ?? blueprint.hero.cta
  attach(nodes, navbarActions.id, style(node('button', 'navbar-cta', navbarActions.id, navbarCta), {
    backgroundColor: primary, color: onPrimary, borderRadius: 200, shadow: 'sm', fontSize: 15,
  }, { mobile: { fontSize: 14 } }))

  const hero = attach(nodes, 'page-root', style(node('hero', 'hero-1', 'page-root', { label: 'Hero' }), {
    width: 'full', backgroundColor: softerSurface, paddingTop: 84, paddingBottom: 96,
  }, {
    tablet: { paddingTop: 64, paddingBottom: 72 },
    mobile: { paddingTop: 48, paddingBottom: 56 },
  }))
  const heroContainer = attach(nodes, hero.id, style(node('container', 'hero-container', hero.id), {
    ...pagePadding, maxWidth: 1200,
  }, { mobile: mobilePadding }))
  const heroColumns = attach(nodes, heroContainer.id, style(node('columns', 'hero-columns', heroContainer.id), {
    display: 'grid', gridColumns: 2, gap: 72, alignItems: 'center',
  }, {
    tablet: { gridColumns: 1, gap: 48 },
    mobile: { gridColumns: 1, gap: 36 },
  }))

  const heroCopy = attach(nodes, heroColumns.id, style(node('column', 'hero-copy', heroColumns.id), {
    display: 'flex', flexDirection: 'column', alignItems: 'start', gap: 24,
  }, { mobile: { gap: 20 } }))
  attach(nodes, heroCopy.id, style(node('badge', 'hero-badge', heroCopy.id, { text: blueprint.hero.badge ?? 'AI-powered platform' }), {
    backgroundColor: primarySoft, color: primaryDark, borderColor: mixHex(background, primary, 0.24), borderWidth: 1,
    borderRadius: 200, paddingTop: 8, paddingRight: 14, paddingBottom: 8, paddingLeft: 14,
    fontSize: 13, fontWeight: '700', letterSpacing: 0.6,
  }))
  attach(nodes, heroCopy.id, style(node('heading', 'hero-heading', heroCopy.id, { text: blueprint.hero.heading, level: 1 }), {
    fontFamily: blueprint.theme.headingFont, fontSize: 68, fontWeight: '800', lineHeight: 1.04,
    letterSpacing: -2.2, color: text, maxWidth: 680,
  }, {
    tablet: { fontSize: 56, letterSpacing: -1.6 },
    mobile: { fontSize: 42, lineHeight: 1.08, letterSpacing: -1 },
  }))
  attach(nodes, heroCopy.id, style(node('paragraph', 'hero-paragraph', heroCopy.id, { text: blueprint.hero.paragraph }), {
    fontFamily: blueprint.theme.bodyFont, fontSize: 20, lineHeight: 1.65, color: mutedText, maxWidth: 620,
  }, { mobile: { fontSize: 17, lineHeight: 1.6 } }))
  const heroActions = attach(nodes, heroCopy.id, style(node('stack', 'hero-actions', heroCopy.id), {
    display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8,
  }, { mobile: { width: 'full' } }))
  attach(nodes, heroActions.id, style(node('button', 'hero-cta', heroActions.id, blueprint.hero.cta), {
    backgroundColor: primary, color: onPrimary, borderRadius: 200, shadow: 'md', fontSize: 16,
  }, { mobile: { width: 'full' } }))

  const heroVisual = attach(nodes, heroColumns.id, style(node('column', 'hero-visual', heroColumns.id), {
    minHeight: 480, display: 'flex', flexDirection: 'column', justifyContent: 'center',
    backgroundColor: primarySoft, borderColor: mixHex(background, primary, 0.2), borderWidth: 1,
    borderRadius: 32, paddingTop: 28, paddingRight: 28, paddingBottom: 28, paddingLeft: 28, shadow: 'lg',
  }, {
    tablet: { minHeight: 400 },
    mobile: { minHeight: 340, paddingTop: 18, paddingRight: 18, paddingBottom: 18, paddingLeft: 18, borderRadius: 24 },
  }))
  if (heroImage) {
    attach(nodes, heroVisual.id, style(node('image', 'hero-image', heroVisual.id, heroImage), {
      width: 'full', borderRadius: 22, shadow: 'md',
    }))
  } else {
    const visualPanel = attach(nodes, heroVisual.id, style(node('feature-card', 'hero-product-card', heroVisual.id, {
      title: blueprint.features[0]!.heading,
      description: blueprint.features[0]!.paragraph,
    }), {
      display: 'flex', flexDirection: 'column', gap: 20, backgroundColor: background,
      borderColor: border, borderWidth: 1, borderRadius: 24,
      paddingTop: 28, paddingRight: 28, paddingBottom: 28, paddingLeft: 28, shadow: 'md',
    }, { mobile: { gap: 16, paddingTop: 22, paddingRight: 22, paddingBottom: 22, paddingLeft: 22 } }))
    const visualTop = attach(nodes, visualPanel.id, style(node('stack', 'hero-product-top', visualPanel.id), {
      display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12,
    }))
    attach(nodes, visualTop.id, style(node('icon', 'hero-product-icon', visualTop.id, {
      name: blueprint.features[0]!.icon, label: blueprint.features[0]!.heading,
    }), {
      backgroundColor: primary, color: onPrimary, borderRadius: 14,
      paddingTop: 12, paddingRight: 14, paddingBottom: 12, paddingLeft: 14, fontSize: 22,
    }))
    attach(nodes, visualTop.id, style(node('badge', 'hero-product-status', visualTop.id, { text: 'AI is working' }), {
      backgroundColor: primarySoft, color: primaryDark, borderRadius: 200,
      paddingTop: 7, paddingRight: 12, paddingBottom: 7, paddingLeft: 12, fontSize: 12, fontWeight: '700',
    }))
    attach(nodes, visualPanel.id, style(node('heading', 'hero-product-heading', visualPanel.id, {
      text: blueprint.features[0]!.heading, level: 3,
    }), { fontSize: 28, lineHeight: 1.2, fontWeight: '800', color: text }))
    attach(nodes, visualPanel.id, style(node('paragraph', 'hero-product-copy', visualPanel.id, {
      text: blueprint.features[0]!.paragraph,
    }), { fontSize: 16, lineHeight: 1.6, color: mutedText }))
    const progress = attach(nodes, visualPanel.id, style(node('stack', 'hero-product-progress', visualPanel.id), {
      display: 'flex', flexDirection: 'column', gap: 10, backgroundColor: softSurface,
      borderRadius: 16, paddingTop: 18, paddingRight: 18, paddingBottom: 18, paddingLeft: 18,
    }))
    attach(nodes, progress.id, style(node('paragraph', 'hero-product-label', progress.id, { text: 'Intelligent workflow' }), {
      fontSize: 13, fontWeight: '700', color: mutedText,
    }))
    attach(nodes, progress.id, style(node('divider', 'hero-product-divider', progress.id), {
      width: 'full', borderColor: primary, borderWidth: 4, borderRadius: 200,
    }))
  }

  const featureSection = attach(nodes, 'page-root', style(node('section', 'features-section', 'page-root', { label: 'Features' }), {
    width: 'full', backgroundColor: background, paddingTop: 104, paddingBottom: 112,
  }, {
    tablet: { paddingTop: 80, paddingBottom: 88 },
    mobile: { paddingTop: 64, paddingBottom: 68 },
  }))
  const featureContainer = attach(nodes, featureSection.id, style(node('container', 'features-container', featureSection.id), {
    ...pagePadding, maxWidth: 1200,
  }, { mobile: mobilePadding }))
  const featureIntro = attach(nodes, featureContainer.id, style(node('stack', 'features-intro', featureContainer.id), {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginBottom: 52,
  }, { mobile: { alignItems: 'start', marginBottom: 36 } }))
  attach(nodes, featureIntro.id, style(node('badge', 'features-eyebrow', featureIntro.id, { text: 'Năng lực nổi bật' }), {
    color: primaryDark, backgroundColor: primarySoft, borderRadius: 200,
    paddingTop: 8, paddingRight: 14, paddingBottom: 8, paddingLeft: 14,
    fontSize: 13, fontWeight: '700', letterSpacing: 0.6,
  }))
  attach(nodes, featureIntro.id, style(node('heading', 'features-heading', featureIntro.id, {
    text: 'Mọi thứ bạn cần để tăng tốc với AI', level: 2,
  }), {
    maxWidth: 760, fontSize: 46, lineHeight: 1.12, fontWeight: '800', letterSpacing: -1.2, textAlign: 'center', color: text,
  }, {
    mobile: { fontSize: 34, textAlign: 'left', letterSpacing: -0.6 },
  }))
  attach(nodes, featureIntro.id, style(node('paragraph', 'features-copy', featureIntro.id, {
    text: 'Từ tự động hóa đến phân tích chuyên sâu, nền tảng giúp đội ngũ biến AI thành lợi thế kinh doanh thực tế.',
  }), {
    maxWidth: 680, fontSize: 18, lineHeight: 1.65, textAlign: 'center', color: mutedText,
  }, { mobile: { fontSize: 16, textAlign: 'left' } }))

  const featureGrid = attach(nodes, featureContainer.id, style(node('stack', 'features-grid', featureContainer.id), {
    display: 'grid', gridColumns: 3, gap: 24,
  }, {
    tablet: { gridColumns: 2 },
    mobile: { gridColumns: 1, gap: 18 },
  }))
  blueprint.features.forEach((feature, index) => {
    const suffix = index + 1
    const card = attach(nodes, featureGrid.id, style(node('feature-card', `feature-card-${suffix}`, featureGrid.id, {
      title: feature.heading, description: feature.paragraph,
    }), {
      minHeight: 280, display: 'flex', flexDirection: 'column', alignItems: 'start', gap: 18,
      backgroundColor: index === 0 ? softSurface : background, borderColor: border, borderWidth: 1,
      borderRadius: 22, paddingTop: 30, paddingRight: 28, paddingBottom: 30, paddingLeft: 28, shadow: 'sm',
    }, { mobile: { minHeight: 0, paddingTop: 24, paddingRight: 22, paddingBottom: 24, paddingLeft: 22 } }))
    attach(nodes, card.id, style(node('icon', `feature-icon-${suffix}`, card.id, { name: feature.icon, label: feature.heading }), {
      backgroundColor: index === 0 ? primary : primarySoft, color: index === 0 ? onPrimary : primaryDark,
      borderRadius: 14, paddingTop: 11, paddingRight: 13, paddingBottom: 11, paddingLeft: 13, fontSize: 22,
    }))
    attach(nodes, card.id, style(node('heading', `feature-heading-${suffix}`, card.id, { text: feature.heading, level: 3 }), {
      fontSize: 25, lineHeight: 1.25, fontWeight: '800', letterSpacing: -0.4, color: text, marginTop: 6,
    }))
    attach(nodes, card.id, style(node('paragraph', `feature-paragraph-${suffix}`, card.id, { text: feature.paragraph }), {
      fontSize: 16, lineHeight: 1.65, color: mutedText,
    }))
  })

  const closing = blueprint.closingCta ?? {
    heading: 'Sẵn sàng đưa AI vào công việc?',
    paragraph: 'Bắt đầu với một trải nghiệm được thiết kế để tạo ra giá trị thực tế ngay từ hôm nay.',
    cta: blueprint.hero.cta,
  }
  const closingSection = attach(nodes, 'page-root', style(node('section', 'closing-section', 'page-root', { label: 'Call to action' }), {
    width: 'full', backgroundColor: background, paddingTop: 24, paddingBottom: 104,
  }, { mobile: { paddingBottom: 64 } }))
  const closingOuter = attach(nodes, closingSection.id, style(node('container', 'closing-outer', closingSection.id), {
    ...pagePadding, maxWidth: 1200,
  }, { mobile: mobilePadding }))
  const closingPanel = attach(nodes, closingOuter.id, style(node('feature-card', 'closing-panel', closingOuter.id, {
    title: closing.heading, description: closing.paragraph,
  }), {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22,
    backgroundColor: primaryDark, borderRadius: 30, paddingTop: 72, paddingRight: 48,
    paddingBottom: 72, paddingLeft: 48, shadow: 'lg',
  }, {
    mobile: { alignItems: 'start', paddingTop: 48, paddingRight: 24, paddingBottom: 48, paddingLeft: 24, borderRadius: 24 },
  }))
  attach(nodes, closingPanel.id, style(node('heading', 'closing-heading', closingPanel.id, { text: closing.heading, level: 2 }), {
    maxWidth: 760, fontSize: 48, lineHeight: 1.1, fontWeight: '800', letterSpacing: -1.2, textAlign: 'center', color: onPrimary,
  }, { mobile: { fontSize: 34, textAlign: 'left', letterSpacing: -0.6 } }))
  attach(nodes, closingPanel.id, style(node('paragraph', 'closing-paragraph', closingPanel.id, { text: closing.paragraph }), {
    maxWidth: 660, fontSize: 18, lineHeight: 1.65, textAlign: 'center', color: mixHex(onPrimary, primaryDark, 0.24),
  }, { mobile: { fontSize: 16, textAlign: 'left' } }))
  attach(nodes, closingPanel.id, style(node('button', 'closing-cta', closingPanel.id, closing.cta), {
    backgroundColor: white, color: primaryDark, borderRadius: 200, shadow: 'md', fontSize: 16, marginTop: 8,
  }, { mobile: { width: 'full' } }))

  const document: DesignDocument = {
    schemaVersion: 1,
    projectId: input.current.projectId,
    version: input.current.version,
    theme: {
      colors: { primary, background, text },
      fonts: { heading: blueprint.theme.headingFont, body: blueprint.theme.bodyFont },
      radius: structuredClone(input.current.theme.radius),
    },
    pages: [{ id: 'home', name: blueprint.brand, slug: '/', rootNodeId: 'page-root' }],
    nodes,
  }
  const validation = validateDesignDocument(document, input.imagePolicy ? { imagePolicy: input.imagePolicy } : {})
  if (!validation.success) return { accepted: false, issues: ['invalid_blueprint'] }
  if (validateRegistryRelationships(validation.data).length > 0) return { accepted: false, issues: ['invalid_blueprint'] }
  return { accepted: true, document: validation.data }
}
