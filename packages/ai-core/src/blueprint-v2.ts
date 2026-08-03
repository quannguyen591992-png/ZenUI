import { componentRegistry, validateRegistryRelationships } from '@zenui/component-registry'
import {
  FONT_ALLOWLIST,
  validateDesignDocument,
  ownedImagePropsSchema,
  type DesignDocument,
  type DesignNode,
  type NodeStyle,
  type RemoteImagePolicy,
} from '@zenui/design-schema'
import { z } from 'zod'

import {
  DENSITY_PRESET_IDS,
  MOOD_PRESET_IDS,
  PAGE_PRESET_IDS,
  THEME_PRESET_IDS,
  blueprintV2SectionSchema,
  heroPresetSchema,
  navbarPresetSchema,
  type BlueprintV2Section,
} from './section-presets'

const themeInputSchema = z.object({
  preset: z.enum(THEME_PRESET_IDS),
  mood: z.enum(MOOD_PRESET_IDS),
  density: z.enum(DENSITY_PRESET_IDS),
  headingFont: z.enum(FONT_ALLOWLIST),
  bodyFont: z.enum(FONT_ALLOWLIST),
}).strict()

export const landingPageBlueprintV2Schema = z.object({
  version: z.literal(2),
  pagePreset: z.enum(PAGE_PRESET_IDS),
  brand: z.string().trim().min(1).max(100),
  theme: themeInputSchema,
  navbar: navbarPresetSchema,
  hero: heroPresetSchema,
  sections: z.array(blueprintV2SectionSchema).min(4).max(10),
}).strict().superRefine((value, context) => {
  const seen = new Set<string>()
  for (const [index, section] of value.sections.entries()) {
    if (seen.has(section.type)) {
      context.addIssue({ code: 'custom', path: ['sections', index, 'type'], message: 'duplicate_section_type' })
    }
    seen.add(section.type)
  }
  if (!seen.has('features')) {
    context.addIssue({ code: 'custom', path: ['sections'], message: 'features_section_required' })
  }
  if (!seen.has('final-cta')) {
    context.addIssue({ code: 'custom', path: ['sections'], message: 'final_cta_section_required' })
  }
  if (!seen.has('footer')) {
    context.addIssue({ code: 'custom', path: ['sections'], message: 'footer_section_required' })
  }
  if (value.sections.at(-1)?.type !== 'footer') {
    context.addIssue({ code: 'custom', path: ['sections'], message: 'footer_must_be_last' })
  }
})

export type LandingPageBlueprintV2 = z.infer<typeof landingPageBlueprintV2Schema>
export const landingPageBlueprintV2JsonSchema = z.toJSONSchema(landingPageBlueprintV2Schema, { target: 'draft-7' })

type OwnedImageProps = z.infer<typeof ownedImagePropsSchema>
export type OwnedMediaSlot = 'hero' | 'feature-1' | 'feature-2' | 'feature-3'
export type OwnedMediaMap = Partial<Record<OwnedMediaSlot, OwnedImageProps>>

interface ResolvedTheme {
  primary: string
  background: string
  text: string
  surface: string
  soft: string
  border: string
  muted: string
  primaryDark: string
  primarySoft: string
  onPrimary: string
  headingFont: LandingPageBlueprintV2['theme']['headingFont']
  bodyFont: LandingPageBlueprintV2['theme']['bodyFont']
  radius: { sm: number; md: number; lg: number }
  sectionPadding: number
  cardPadding: number
  compactTypography: boolean
}

const themePalettes = {
  indigo: { primary: '#4f46e5', background: '#ffffff', text: '#111827' },
  emerald: { primary: '#059669', background: '#fbfffd', text: '#10231b' },
  coral: { primary: '#e85d4a', background: '#fffdfb', text: '#241412' },
  violet: { primary: '#7c3aed', background: '#fefcff', text: '#1c1530' },
  graphite: { primary: '#334155', background: '#ffffff', text: '#0f172a' },
} as const

function mixHex(left: string, right: string, rightWeight: number): string {
  const mix = (offset: number): string => {
    const leftValue = Number.parseInt(left.slice(offset, offset + 2), 16)
    const rightValue = Number.parseInt(right.slice(offset, offset + 2), 16)
    return Math.round(leftValue * (1 - rightWeight) + rightValue * rightWeight).toString(16).padStart(2, '0')
  }
  return `#${mix(1)}${mix(3)}${mix(5)}`
}

function resolveTheme(input: LandingPageBlueprintV2['theme'], pagePreset: LandingPageBlueprintV2['pagePreset']): ResolvedTheme {
  const palette = themePalettes[input.preset]
  const primary = input.mood === 'bold' ? mixHex(palette.primary, palette.text, 0.1) : palette.primary
  const density = pagePreset === 'saas'
    ? {
        compact: { sectionPadding: 56, cardPadding: 22 },
        balanced: { sectionPadding: 72, cardPadding: 26 },
        airy: { sectionPadding: 88, cardPadding: 30 },
      }[input.density]
    : {
        compact: { sectionPadding: 64, cardPadding: 24 },
        balanced: { sectionPadding: 84, cardPadding: 30 },
        airy: { sectionPadding: 104, cardPadding: 34 },
      }[input.density]
  return {
    primary,
    background: palette.background,
    text: palette.text,
    surface: mixHex(palette.background, palette.primary, 0.035),
    soft: mixHex(palette.background, palette.primary, 0.08),
    border: mixHex(palette.background, palette.text, 0.14),
    muted: mixHex(palette.text, palette.background, 0.34),
    primaryDark: mixHex(primary, palette.text, 0.24),
    primarySoft: mixHex(palette.background, primary, 0.13),
    onPrimary: '#ffffff',
    headingFont: pagePreset === 'saas' ? 'Manrope' : input.headingFont,
    bodyFont: input.bodyFont,
    compactTypography: pagePreset === 'saas',
    radius: input.mood === 'editorial'
      ? { sm: 4, md: 10, lg: 18 }
      : input.mood === 'friendly'
        ? { sm: 12, md: 20, lg: 32 }
        : { sm: 8, md: 16, lg: 26 },
    ...density,
  }
}

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

function style(target: DesignNode, value: NodeStyle, responsive?: { tablet?: NodeStyle; mobile?: NodeStyle }): DesignNode {
  target.style = { ...target.style, ...value }
  if (responsive?.tablet) target.responsive.tablet = responsive.tablet
  if (responsive?.mobile) target.responsive.mobile = responsive.mobile
  return target
}

class DocumentBuilder {
  readonly nodes: DesignDocument['nodes'] = {}
  private readonly ids = new Map<string, number>()

  create(type: DesignNode['type'], key: string, parentId: string | null, props?: Record<string, unknown>, nodeStyle?: NodeStyle, responsive?: { tablet?: NodeStyle; mobile?: NodeStyle }): DesignNode {
    const count = (this.ids.get(key) ?? 0) + 1
    this.ids.set(key, count)
    const id = count === 1 ? key : `${key}-${count}`
    const created = style(node(type, id, parentId, props), nodeStyle ?? {}, responsive)
    this.nodes[id] = created
    if (parentId) this.nodes[parentId]!.children.push(id)
    return created
  }
}

const pagePadding = { paddingLeft: 32, paddingRight: 32 }
const mobilePadding = { paddingLeft: 20, paddingRight: 20 }

function addContainer(builder: DocumentBuilder, parentId: string, key: string): DesignNode {
  return builder.create('container', key, parentId, {}, { ...pagePadding, maxWidth: 1200 }, { mobile: mobilePadding })
}

function addSectionHeading(builder: DocumentBuilder, parentId: string, key: string, theme: ResolvedTheme, input: { eyebrow?: string; heading: string; paragraph?: string; align?: 'left' | 'center'; compact?: boolean }): void {
  const align = input.align ?? 'center'
  const stack = builder.create('stack', `${key}-intro`, parentId, {}, {
    display: 'flex', flexDirection: 'column', alignItems: align === 'center' ? 'center' : 'start', gap: input.compact ? 13 : 16,
    marginBottom: input.compact ? 36 : 44,
  }, { mobile: { alignItems: 'start', gap: 12, marginBottom: input.compact ? 26 : 30 } })
  if (input.eyebrow) builder.create('badge', `${key}-eyebrow`, stack.id, { text: input.eyebrow }, {
    backgroundColor: theme.primarySoft, color: theme.primaryDark, borderRadius: 200,
    paddingTop: 8, paddingRight: 14, paddingBottom: 8, paddingLeft: 14, fontSize: 13, fontWeight: '700', letterSpacing: 0.5,
  })
  builder.create('heading', `${key}-heading`, stack.id, { text: input.heading, level: 2 }, {
    maxWidth: 820, fontFamily: theme.headingFont, fontSize: input.compact ? 40 : 44, lineHeight: 1.14, fontWeight: '800', letterSpacing: -1,
    textAlign: align, color: theme.text,
  }, { mobile: { fontSize: input.compact ? 30 : 32, textAlign: 'left', letterSpacing: -0.5 } })
  if (input.paragraph) builder.create('paragraph', `${key}-paragraph`, stack.id, { text: input.paragraph }, {
    maxWidth: 700, fontFamily: theme.bodyFont, fontSize: 18, lineHeight: 1.65, textAlign: align, color: theme.muted,
  }, { mobile: { fontSize: 16, textAlign: 'left' } })
}

function safeImage(image: { src: string; alt: string } | undefined, policy?: RemoteImagePolicy): { src: string; alt: string } | undefined {
  return image && (!policy || policy.allows(image.src)) ? image : undefined
}

function renderNavbar(builder: DocumentBuilder, blueprint: LandingPageBlueprintV2, theme: ResolvedTheme): void {
  if (blueprint.navbar.variant === 'announcement' && blueprint.navbar.announcement) {
    const bar = builder.create('section', 'announcement-bar', 'page-root', { label: 'Announcement' }, {
      width: 'full', backgroundColor: theme.primaryDark, paddingTop: 10, paddingBottom: 10,
    })
    const barContainer = addContainer(builder, bar.id, 'announcement-container')
    builder.create('paragraph', 'announcement-copy', barContainer.id, { text: blueprint.navbar.announcement }, {
      color: theme.onPrimary, fontSize: 13, fontWeight: '600', textAlign: 'center',
    })
  }
  const navbar = builder.create('navbar', 'navbar-1', 'page-root', { brand: blueprint.brand }, {
    width: 'full', backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1,
  })
  const container = addContainer(builder, navbar.id, 'navbar-container')
  style(container, {
    ...container.style, display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    gap: 24, paddingTop: 18, paddingBottom: 18,
  }, { mobile: { ...mobilePadding, gap: 12, paddingTop: 14, paddingBottom: 14 } })
  builder.create('link', 'navbar-brand', container.id, { text: blueprint.brand, href: '#top' }, {
    fontFamily: theme.headingFont, fontSize: 22, fontWeight: '800', color: theme.text, letterSpacing: -0.6,
  })
  const actions = builder.create('stack', 'navbar-actions', container.id, {}, {
    display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: blueprint.navbar.variant === 'centered' ? 'center' : 'end', gap: 22,
  }, { mobile: { gap: 10 } })
  blueprint.navbar.links.forEach((link, index) => builder.create('link', `navbar-link-${index + 1}`, actions.id, link, {
    fontSize: 15, fontWeight: '600', color: theme.muted,
  }, { mobile: { display: 'none' } }))
  builder.create('button', 'navbar-cta', actions.id, blueprint.navbar.cta, {
    backgroundColor: theme.primary, color: theme.onPrimary, borderRadius: 200, shadow: 'sm', fontSize: 15,
  }, { mobile: { fontSize: 14 } })
}

function renderProductVisual(
  builder: DocumentBuilder,
  parentId: string,
  blueprint: LandingPageBlueprintV2,
  theme: ResolvedTheme,
  imagePolicy?: RemoteImagePolicy,
  ownedImage?: OwnedImageProps,
): void {
  const image = ownedImage ?? safeImage(blueprint.hero.image, imagePolicy)
  const visual = builder.create('column', 'hero-visual', parentId, {}, {
    minHeight: image ? 0 : 460, display: 'flex', flexDirection: 'column', justifyContent: 'center', backgroundColor: theme.primarySoft,
    borderColor: theme.border, borderWidth: 1, borderRadius: theme.radius.lg, paddingTop: 26, paddingRight: 26,
    paddingBottom: 26, paddingLeft: 26, shadow: 'lg',
  }, {
    tablet: { minHeight: image ? 0 : 390 },
    mobile: { minHeight: image ? 0 : 320, paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16 },
  })
  if (image) {
    builder.create('image', 'hero-image', visual.id, image, {
      width: 'full', aspectRatio: 'wide', objectFit: 'cover', objectPosition: 'center',
      borderRadius: theme.radius.md, shadow: 'md', backgroundColor: theme.soft,
    }, {
      tablet: { aspectRatio: 'landscape' },
      mobile: { aspectRatio: 'landscape', objectPosition: 'top' },
    })
    return
  }
  const firstFeature = blueprint.sections.find(section => section.type === 'features')?.items[0]
  const panel = builder.create('feature-card', 'hero-product-card', visual.id, {
    title: firstFeature?.heading ?? blueprint.hero.heading,
    description: firstFeature?.paragraph ?? blueprint.hero.paragraph,
    mediaSlot: 'hero-image',
  }, {
    display: 'flex', flexDirection: 'column', gap: 18, backgroundColor: theme.background, borderColor: theme.border,
    borderWidth: 1, borderRadius: theme.radius.md, paddingTop: 28, paddingRight: 28, paddingBottom: 28, paddingLeft: 28, shadow: 'md',
  })
  builder.create('badge', 'hero-product-status', panel.id, { text: blueprint.hero.proof ?? 'Built for focused teams' }, {
    backgroundColor: theme.primarySoft, color: theme.primaryDark, borderRadius: 200,
    paddingTop: 7, paddingRight: 12, paddingBottom: 7, paddingLeft: 12, fontSize: 12, fontWeight: '700',
  })
  builder.create('heading', 'hero-product-heading', panel.id, { text: firstFeature?.heading ?? blueprint.brand, level: 3 }, {
    fontFamily: theme.headingFont, fontSize: 28, lineHeight: 1.2, fontWeight: '800', color: theme.text,
  })
  builder.create('paragraph', 'hero-product-copy', panel.id, { text: firstFeature?.paragraph ?? blueprint.hero.paragraph }, {
    fontFamily: theme.bodyFont, fontSize: 16, lineHeight: 1.6, color: theme.muted,
  })
  const progress = builder.create('stack', 'hero-product-progress', panel.id, {}, {
    display: 'flex', flexDirection: 'column', gap: 8, backgroundColor: theme.soft, borderRadius: theme.radius.sm,
    paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16,
  })
  builder.create('divider', 'hero-product-divider', progress.id, {}, { width: 'full', borderColor: theme.primary, borderWidth: 4, borderRadius: 200 })
}

function renderHero(
  builder: DocumentBuilder,
  blueprint: LandingPageBlueprintV2,
  theme: ResolvedTheme,
  imagePolicy?: RemoteImagePolicy,
  ownedImage?: OwnedImageProps,
): void {
  const centered = blueprint.hero.variant === 'centered'
  const editorial = blueprint.hero.variant === 'editorial'
  const hero = builder.create('hero', 'hero-1', 'page-root', { label: 'Hero' }, {
    width: 'full', backgroundColor: editorial ? theme.background : theme.surface,
    paddingTop: theme.compactTypography ? 72 : editorial ? 104 : 84,
    paddingBottom: theme.compactTypography ? 76 : editorial ? 108 : 88,
  }, { tablet: { paddingTop: 60, paddingBottom: 64 }, mobile: { paddingTop: 44, paddingBottom: 50 } })
  const container = addContainer(builder, hero.id, 'hero-container')
  const layout = builder.create('columns', 'hero-columns', container.id, {}, {
    display: centered ? 'flex' : 'grid', flexDirection: 'column', gridColumns: centered ? undefined : 2,
    gap: editorial ? 84 : 64, alignItems: 'center',
  }, { tablet: { display: 'grid', gridColumns: 1, gap: 44 }, mobile: { gridColumns: 1, gap: 34 } })
  const copy = builder.create('column', 'hero-copy', layout.id, {}, {
    display: 'flex', flexDirection: 'column', alignItems: centered ? 'center' : 'start', gap: 22,
  }, { mobile: { alignItems: 'start', gap: 18 } })
  if (blueprint.hero.badge) builder.create('badge', 'hero-badge', copy.id, { text: blueprint.hero.badge }, {
    backgroundColor: theme.primarySoft, color: theme.primaryDark, borderRadius: 200, borderColor: theme.border, borderWidth: 1,
    paddingTop: 8, paddingRight: 14, paddingBottom: 8, paddingLeft: 14, fontSize: 13, fontWeight: '700', letterSpacing: 0.5,
  })
  builder.create('heading', 'hero-heading', copy.id, { text: blueprint.hero.heading, level: 1 }, {
    maxWidth: centered ? 900 : 700, fontFamily: theme.headingFont,
    fontSize: theme.compactTypography ? 58 : editorial ? 72 : 64,
    lineHeight: theme.compactTypography ? 1.08 : 1.04, fontWeight: '800',
    letterSpacing: theme.compactTypography ? -1.7 : -2.1,
    textAlign: centered ? 'center' : 'left', color: theme.text,
  }, {
    tablet: { fontSize: theme.compactTypography ? 48 : 54 },
    mobile: { fontSize: theme.compactTypography ? 38 : 40, lineHeight: 1.1, letterSpacing: -0.9, textAlign: 'left' },
  })
  builder.create('paragraph', 'hero-paragraph', copy.id, { text: blueprint.hero.paragraph }, {
    maxWidth: centered ? 720 : 620, fontFamily: theme.bodyFont, fontSize: 20, lineHeight: 1.65,
    textAlign: centered ? 'center' : 'left', color: theme.muted,
  }, { mobile: { fontSize: 17, textAlign: 'left' } })
  const actions = builder.create('stack', 'hero-actions', copy.id, {}, {
    display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: centered ? 'center' : 'start', gap: 14, marginTop: 6,
  }, { mobile: { width: 'full', flexDirection: 'column', alignItems: 'stretch' } })
  builder.create('button', 'hero-primary-cta', actions.id, blueprint.hero.primaryCta, {
    backgroundColor: theme.primary, color: theme.onPrimary, borderRadius: 200, shadow: 'md', fontSize: 16,
  }, { mobile: { width: 'full' } })
  if (blueprint.hero.secondaryCta) builder.create('button', 'hero-secondary-cta', actions.id, blueprint.hero.secondaryCta, {
    backgroundColor: theme.background, color: theme.text, borderColor: theme.border, borderWidth: 1, borderRadius: 200, fontSize: 16,
  }, { mobile: { width: 'full' } })
  if (blueprint.hero.proof) builder.create('paragraph', 'hero-proof', copy.id, { text: blueprint.hero.proof }, {
    fontSize: 13, fontWeight: '600', color: theme.muted,
  })
  if (!centered || blueprint.hero.variant === 'product-shot') {
    renderProductVisual(builder, layout.id, blueprint, theme, imagePolicy, ownedImage)
  } else {
    const image = ownedImage ?? safeImage(blueprint.hero.image, imagePolicy)
    if (image) {
      builder.create('image', 'hero-image', container.id, image, {
        width: 'full', maxWidth: 980, aspectRatio: 'wide', objectFit: 'cover', objectPosition: 'center',
        borderRadius: theme.radius.lg, shadow: 'lg', backgroundColor: theme.soft, marginTop: 44,
      }, { mobile: { aspectRatio: 'landscape', objectPosition: 'top', marginTop: 30 } })
    } else {
      renderProductVisual(builder, layout.id, blueprint, theme, imagePolicy)
    }
  }
}

function sectionShell(builder: DocumentBuilder, key: string, label: string, theme: ResolvedTheme, alternate = false): DesignNode {
  return builder.create('section', key, 'page-root', { label }, {
    width: 'full', backgroundColor: alternate ? theme.surface : theme.background,
    paddingTop: theme.sectionPadding, paddingBottom: theme.sectionPadding,
  }, {
    tablet: { paddingTop: theme.compactTypography ? 60 : 68, paddingBottom: theme.compactTypography ? 60 : 68 },
    mobile: { paddingTop: theme.compactTypography ? 46 : 52, paddingBottom: theme.compactTypography ? 46 : 52 },
  })
}

function renderLogoCloud(builder: DocumentBuilder, section: Extract<BlueprintV2Section, { type: 'logo-cloud' }>, theme: ResolvedTheme, index: number): void {
  const shell = sectionShell(builder, 'logo-cloud-section', 'Trusted by', theme, index % 2 === 1)
  const container = addContainer(builder, shell.id, 'logo-cloud-container')
  const panel = builder.create('stack', 'logo-cloud-panel', container.id, {}, {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
    backgroundColor: section.variant === 'panel' ? theme.background : undefined,
    borderColor: section.variant === 'panel' ? theme.border : undefined,
    borderWidth: section.variant === 'panel' ? 1 : undefined,
    borderRadius: section.variant === 'panel' ? theme.radius.md : undefined,
    paddingTop: section.variant === 'panel' ? 32 : 0, paddingRight: section.variant === 'panel' ? 32 : 0,
    paddingBottom: section.variant === 'panel' ? 32 : 0, paddingLeft: section.variant === 'panel' ? 32 : 0,
  })
  if (section.eyebrow) builder.create('paragraph', 'logo-cloud-eyebrow', panel.id, { text: section.eyebrow }, {
    fontSize: 14, fontWeight: '700', color: theme.muted, textAlign: 'center', letterSpacing: 0.5,
  })
  const logos = builder.create('stack', 'logo-cloud-list', panel.id, {}, {
    display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 24, width: 'full',
  }, { mobile: { display: 'grid', gridColumns: 2, gap: 18 } })
  section.logos.forEach((logo, logoIndex) => builder.create('badge', `logo-${logoIndex + 1}`, logos.id, { text: logo }, {
    backgroundColor: theme.soft, color: theme.text, borderRadius: 200, paddingTop: 10, paddingRight: 16, paddingBottom: 10, paddingLeft: 16,
    fontFamily: theme.headingFont, fontSize: 15, fontWeight: '700',
  }))
}

function renderStats(builder: DocumentBuilder, section: Extract<BlueprintV2Section, { type: 'stats' }>, theme: ResolvedTheme, index: number): void {
  const shell = sectionShell(builder, 'stats-section', 'Results', theme, index % 2 === 1)
  const container = addContainer(builder, shell.id, 'stats-container')
  if (section.heading) addSectionHeading(builder, container.id, 'stats', theme, { heading: section.heading, compact: theme.compactTypography })
  const grid = builder.create('stack', 'stats-grid', container.id, {}, {
    display: 'grid', gridColumns: section.items.length === 4 ? 2 : 3, gap: 20,
  }, { tablet: { gridColumns: 2 }, mobile: { gridColumns: 1, gap: 14 } })
  section.items.forEach((item, itemIndex) => {
    const card = builder.create('feature-card', `stat-card-${itemIndex + 1}`, grid.id, { title: item.value, description: item.label }, {
      display: 'flex', flexDirection: 'column', gap: 8, backgroundColor: section.variant === 'cards' ? theme.background : theme.primarySoft,
      borderColor: theme.border, borderWidth: 1, borderRadius: theme.radius.md,
      paddingTop: theme.cardPadding, paddingRight: theme.cardPadding, paddingBottom: theme.cardPadding, paddingLeft: theme.cardPadding,
    })
    builder.create('heading', `stat-value-${itemIndex + 1}`, card.id, { text: item.value, level: 3 }, {
      fontFamily: theme.headingFont, fontSize: 42, lineHeight: 1.05, fontWeight: '800', color: theme.primaryDark,
    })
    builder.create('paragraph', `stat-label-${itemIndex + 1}`, card.id, { text: item.label }, { fontSize: 15, lineHeight: 1.5, color: theme.muted })
  })
}

function renderFeatures(
  builder: DocumentBuilder,
  section: Extract<BlueprintV2Section, { type: 'features' }>,
  theme: ResolvedTheme,
  imagePolicy: RemoteImagePolicy | undefined,
  index: number,
  ownedMedia: OwnedMediaMap,
): void {
  const shell = sectionShell(builder, 'features-section', 'Features', theme, index % 2 === 1)
  const container = addContainer(builder, shell.id, 'features-container')
  addSectionHeading(builder, container.id, 'features', theme, { ...(section.eyebrow ? { eyebrow: section.eyebrow } : {}), heading: section.heading, paragraph: section.paragraph, compact: theme.compactTypography })
  const alternating = section.variant === 'alternating'
  const grid = builder.create('stack', 'features-grid', container.id, {}, {
    display: alternating ? 'flex' : 'grid', flexDirection: 'column', gridColumns: section.variant === 'bento' ? 2 : 3, gap: 24,
  }, { tablet: { gridColumns: 2 }, mobile: { gridColumns: 1, gap: 18 } })
  section.items.forEach((item, itemIndex) => {
    const featureSlots: readonly OwnedMediaSlot[] = ['feature-1', 'feature-2', 'feature-3']
    const slot = featureSlots[itemIndex] ?? null
    const image = (slot ? ownedMedia[slot] : undefined) ?? safeImage(item.image, imagePolicy)
    const bentoLead = section.variant === 'bento' && itemIndex === 0
    const bentoWide = section.variant === 'bento' && (bentoLead || itemIndex === section.items.length - 1 && section.items.length % 2 === 0)
    const card = builder.create('feature-card', `feature-card-${itemIndex + 1}`, grid.id, { title: item.heading, description: item.paragraph }, {
      minHeight: alternating ? 0 : bentoLead ? 340 : 250,
      gridColumnSpan: bentoWide ? 2 : undefined,
      gridRowSpan: bentoLead ? 2 : undefined,
      display: alternating ? 'grid' : 'flex', gridColumns: alternating ? 2 : undefined, flexDirection: 'column', alignItems: 'start', gap: 18,
      backgroundColor: itemIndex === 0 ? theme.primarySoft : theme.background, borderColor: theme.border, borderWidth: 1,
      borderRadius: theme.radius.md, paddingTop: theme.cardPadding, paddingRight: theme.cardPadding,
      paddingBottom: theme.cardPadding, paddingLeft: theme.cardPadding, shadow: 'sm',
    }, {
      ...(section.variant === 'bento' ? { tablet: { gridColumnSpan: bentoLead ? 2 : 1, gridRowSpan: 1 } } : {}),
      mobile: {
        display: 'flex', flexDirection: 'column', gridColumnSpan: 1, gridRowSpan: 1, minHeight: 0,
        paddingTop: 24, paddingRight: 22, paddingBottom: 24, paddingLeft: 22,
      },
    })
    const copy = alternating ? builder.create('stack', `feature-copy-${itemIndex + 1}`, card.id, {}, {
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'start', gap: 16,
    }) : card
    builder.create('icon', `feature-icon-${itemIndex + 1}`, copy.id, { name: item.icon, label: item.heading }, {
      backgroundColor: itemIndex === 0 ? theme.primary : theme.primarySoft, color: itemIndex === 0 ? theme.onPrimary : theme.primaryDark,
      borderRadius: theme.radius.sm, paddingTop: 11, paddingRight: 13, paddingBottom: 11, paddingLeft: 13, fontSize: 22,
    })
    builder.create('heading', `feature-heading-${itemIndex + 1}`, copy.id, { text: item.heading, level: 3 }, {
      fontFamily: theme.headingFont, fontSize: 25, lineHeight: 1.25, fontWeight: '800', letterSpacing: -0.4, color: theme.text,
    })
    builder.create('paragraph', `feature-paragraph-${itemIndex + 1}`, copy.id, { text: item.paragraph }, {
      fontFamily: theme.bodyFont, fontSize: 16, lineHeight: 1.65, color: theme.muted,
    })
    if (image) {
      builder.create('image', `feature-image-${itemIndex + 1}`, card.id, image, {
        width: 'full', aspectRatio: 'landscape', objectFit: 'cover', objectPosition: 'center',
        borderRadius: theme.radius.sm, backgroundColor: theme.soft,
      })
    } else if (slot) {
      builder.create('feature-card', `feature-media-slot-${itemIndex + 1}`, card.id, {
        title: item.heading,
        description: item.paragraph,
        mediaSlot: slot,
      }, {
        width: 'full', minHeight: alternating ? 220 : 140, backgroundColor: theme.soft,
        borderColor: theme.border, borderWidth: 1, borderRadius: theme.radius.sm,
      })
    }
  })
}

function renderTestimonials(builder: DocumentBuilder, section: Extract<BlueprintV2Section, { type: 'testimonials' }>, theme: ResolvedTheme, index: number): void {
  const shell = sectionShell(builder, 'testimonials-section', 'Testimonials', theme, index % 2 === 1)
  const container = addContainer(builder, shell.id, 'testimonials-container')
  addSectionHeading(builder, container.id, 'testimonials', theme, { ...(section.eyebrow ? { eyebrow: section.eyebrow } : {}), heading: section.heading, compact: theme.compactTypography })
  const grid = builder.create('stack', 'testimonials-grid', container.id, {}, {
    display: 'grid', gridColumns: section.variant === 'spotlight' ? 2 : Math.min(3, section.items.length), gap: 22,
  }, { tablet: { gridColumns: section.variant === 'spotlight' ? 2 : Math.min(2, section.items.length) }, mobile: { gridColumns: 1, gap: 16 } })
  section.items.forEach((item, itemIndex) => {
    const spotlightLead = section.variant === 'spotlight' && itemIndex === 0 && section.items.length === 3
    const card = builder.create('feature-card', `testimonial-card-${itemIndex + 1}`, grid.id, { title: item.name, description: item.quote }, {
      minHeight: spotlightLead ? 320 : 250,
      gridColumnSpan: spotlightLead ? 1 : undefined,
      gridRowSpan: spotlightLead ? 2 : undefined,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 26,
      backgroundColor: itemIndex === 0 ? theme.primaryDark : theme.background, borderColor: theme.border, borderWidth: 1,
      borderRadius: theme.radius.md, paddingTop: theme.cardPadding, paddingRight: theme.cardPadding,
      paddingBottom: theme.cardPadding, paddingLeft: theme.cardPadding, shadow: itemIndex === 0 ? 'md' : 'sm',
    }, {
      tablet: { gridColumnSpan: 1, gridRowSpan: spotlightLead ? 2 : 1 },
      mobile: { gridColumnSpan: 1, gridRowSpan: 1, minHeight: 0 },
    })
    builder.create('paragraph', `testimonial-quote-${itemIndex + 1}`, card.id, { text: `“${item.quote}”` }, {
      fontFamily: theme.headingFont, fontSize: itemIndex === 0 ? 23 : 19, lineHeight: 1.55,
      color: itemIndex === 0 ? theme.onPrimary : theme.text,
    })
    const author = builder.create('stack', `testimonial-author-${itemIndex + 1}`, card.id, {}, { display: 'flex', flexDirection: 'column', gap: 4 })
    builder.create('paragraph', `testimonial-name-${itemIndex + 1}`, author.id, { text: item.name }, {
      fontSize: 15, fontWeight: '800', color: itemIndex === 0 ? theme.onPrimary : theme.text,
    })
    builder.create('paragraph', `testimonial-role-${itemIndex + 1}`, author.id, { text: item.role }, {
      fontSize: 13, color: itemIndex === 0 ? mixHex(theme.onPrimary, theme.primaryDark, 0.25) : theme.muted,
    })
  })
}

function renderPricing(builder: DocumentBuilder, section: Extract<BlueprintV2Section, { type: 'pricing' }>, theme: ResolvedTheme, index: number): void {
  const shell = sectionShell(builder, 'pricing-section', 'Pricing', theme, index % 2 === 1)
  const container = addContainer(builder, shell.id, 'pricing-container')
  addSectionHeading(builder, container.id, 'pricing', theme, { ...(section.eyebrow ? { eyebrow: section.eyebrow } : {}), heading: section.heading, paragraph: section.paragraph, compact: theme.compactTypography })
  const grid = builder.create('stack', 'pricing-grid', container.id, {}, {
    display: 'grid', gridColumns: section.plans.length, gap: 22, alignItems: 'stretch',
  }, { tablet: { gridColumns: 2 }, mobile: { gridColumns: 1, gap: 18 } })
  section.plans.forEach((plan, planIndex) => {
    const card = builder.create('feature-card', `pricing-card-${planIndex + 1}`, grid.id, { title: plan.name, description: plan.description }, {
      display: 'flex', flexDirection: 'column', gap: 18, backgroundColor: plan.highlighted ? theme.primaryDark : theme.background,
      borderColor: plan.highlighted ? theme.primaryDark : theme.border, borderWidth: 1, borderRadius: theme.radius.md,
      paddingTop: theme.cardPadding, paddingRight: theme.cardPadding, paddingBottom: theme.cardPadding, paddingLeft: theme.cardPadding,
      shadow: plan.highlighted ? 'lg' : 'sm',
    })
    if (plan.highlighted) builder.create('badge', `pricing-badge-${planIndex + 1}`, card.id, { text: 'Recommended' }, {
      backgroundColor: theme.primary, color: theme.onPrimary, borderRadius: 200,
      paddingTop: 7, paddingRight: 12, paddingBottom: 7, paddingLeft: 12, fontSize: 12, fontWeight: '700',
    })
    builder.create('heading', `pricing-name-${planIndex + 1}`, card.id, { text: plan.name, level: 3 }, {
      fontFamily: theme.headingFont, fontSize: 24, fontWeight: '800', color: plan.highlighted ? theme.onPrimary : theme.text,
    })
    builder.create('heading', `pricing-price-${planIndex + 1}`, card.id, { text: plan.price, level: 4 }, {
      fontFamily: theme.headingFont, fontSize: 38, lineHeight: 1.1, fontWeight: '800', color: plan.highlighted ? theme.onPrimary : theme.primaryDark,
    })
    builder.create('paragraph', `pricing-description-${planIndex + 1}`, card.id, { text: plan.description }, {
      fontSize: 15, lineHeight: 1.6, color: plan.highlighted ? mixHex(theme.onPrimary, theme.primaryDark, 0.25) : theme.muted,
    })
    const list = builder.create('stack', `pricing-features-${planIndex + 1}`, card.id, {}, { display: 'flex', flexDirection: 'column', gap: 12 })
    plan.features.forEach((feature, featureIndex) => {
      const row = builder.create('stack', `pricing-feature-${planIndex + 1}-${featureIndex + 1}`, list.id, {}, {
        display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10,
      })
      builder.create('icon', `pricing-check-${planIndex + 1}-${featureIndex + 1}`, row.id, { name: 'check', label: 'Included' }, {
        color: plan.highlighted ? theme.onPrimary : theme.primaryDark, fontSize: 16,
      })
      builder.create('paragraph', `pricing-feature-copy-${planIndex + 1}-${featureIndex + 1}`, row.id, { text: feature }, {
        fontSize: 14, color: plan.highlighted ? theme.onPrimary : theme.text,
      })
    })
    builder.create('button', `pricing-cta-${planIndex + 1}`, card.id, plan.cta, {
      width: 'full', backgroundColor: plan.highlighted ? theme.onPrimary : theme.primary,
      color: plan.highlighted ? theme.primaryDark : theme.onPrimary, borderRadius: 200, fontSize: 15, marginTop: 8,
    })
  })
}

function renderFaq(builder: DocumentBuilder, section: Extract<BlueprintV2Section, { type: 'faq' }>, theme: ResolvedTheme, index: number): void {
  const shell = sectionShell(builder, 'faq-section', 'Frequently asked questions', theme, index % 2 === 1)
  const container = addContainer(builder, shell.id, 'faq-container')
  addSectionHeading(builder, container.id, 'faq', theme, { ...(section.eyebrow ? { eyebrow: section.eyebrow } : {}), heading: section.heading, compact: theme.compactTypography })
  const grid = builder.create('stack', 'faq-grid', container.id, {}, {
    display: 'grid', gridColumns: section.variant === 'two-column' ? 2 : 1, gap: 16, maxWidth: section.variant === 'stacked' ? 860 : 1200,
  }, { mobile: { gridColumns: 1, gap: 12 } })
  section.items.forEach((item, itemIndex) => {
    const card = builder.create('feature-card', `faq-card-${itemIndex + 1}`, grid.id, { title: item.question, description: item.answer }, {
      display: 'flex', flexDirection: 'column', gap: 12, backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1,
      borderRadius: theme.radius.md, paddingTop: 24, paddingRight: 24, paddingBottom: 24, paddingLeft: 24,
    })
    builder.create('heading', `faq-question-${itemIndex + 1}`, card.id, { text: item.question, level: 3 }, {
      fontFamily: theme.headingFont, fontSize: 19, lineHeight: 1.35, fontWeight: '800', color: theme.text,
    })
    builder.create('paragraph', `faq-answer-${itemIndex + 1}`, card.id, { text: item.answer }, {
      fontFamily: theme.bodyFont, fontSize: 15, lineHeight: 1.65, color: theme.muted,
    })
  })
}

function renderFinalCta(builder: DocumentBuilder, section: Extract<BlueprintV2Section, { type: 'final-cta' }>, theme: ResolvedTheme): void {
  const shell = builder.create('section', 'final-cta-section', 'page-root', { label: 'Call to action' }, {
    width: 'full', backgroundColor: theme.background, paddingTop: 32, paddingBottom: 96,
  }, { mobile: { paddingTop: 20, paddingBottom: 64 } })
  const container = addContainer(builder, shell.id, 'final-cta-container')
  const panel = builder.create('feature-card', 'final-cta-panel', container.id, { title: section.heading, description: section.paragraph }, {
    display: section.variant === 'split' ? 'grid' : 'flex', gridColumns: section.variant === 'split' ? 2 : undefined,
    flexDirection: 'column', alignItems: section.variant === 'split' ? 'start' : 'center', gap: 24,
    backgroundColor: theme.primaryDark, borderRadius: theme.radius.lg, paddingTop: 68, paddingRight: 48,
    paddingBottom: 68, paddingLeft: 48, shadow: 'lg',
  }, { mobile: { display: 'flex', flexDirection: 'column', alignItems: 'start', paddingTop: 46, paddingRight: 24, paddingBottom: 46, paddingLeft: 24 } })
  const copy = builder.create('stack', 'final-cta-copy', panel.id, {}, {
    display: 'flex', flexDirection: 'column', alignItems: section.variant === 'split' ? 'start' : 'center', gap: 18,
  }, { mobile: { alignItems: 'start' } })
  builder.create('heading', 'final-cta-heading', copy.id, { text: section.heading, level: 2 }, {
    maxWidth: 760, fontFamily: theme.headingFont, fontSize: 48, lineHeight: 1.1, fontWeight: '800', letterSpacing: -1.2,
    textAlign: section.variant === 'split' ? 'left' : 'center', color: theme.onPrimary,
  }, { mobile: { fontSize: 34, textAlign: 'left', letterSpacing: -0.6 } })
  builder.create('paragraph', 'final-cta-paragraph', copy.id, { text: section.paragraph }, {
    maxWidth: 660, fontFamily: theme.bodyFont, fontSize: 18, lineHeight: 1.65,
    textAlign: section.variant === 'split' ? 'left' : 'center', color: mixHex(theme.onPrimary, theme.primaryDark, 0.24),
  }, { mobile: { fontSize: 16, textAlign: 'left' } })
  const actions = builder.create('stack', 'final-cta-actions', panel.id, {}, {
    display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14,
  }, { mobile: { width: 'full', flexDirection: 'column', alignItems: 'stretch' } })
  builder.create('button', 'final-primary-cta', actions.id, section.primaryCta, {
    backgroundColor: theme.onPrimary, color: theme.primaryDark, borderRadius: 200, shadow: 'md', fontSize: 16,
  }, { mobile: { width: 'full' } })
  if (section.secondaryCta) builder.create('button', 'final-secondary-cta', actions.id, section.secondaryCta, {
    backgroundColor: theme.primaryDark, color: theme.onPrimary, borderColor: theme.onPrimary, borderWidth: 1, borderRadius: 200, fontSize: 16,
  }, { mobile: { width: 'full' } })
}

function renderFooter(builder: DocumentBuilder, section: Extract<BlueprintV2Section, { type: 'footer' }>, blueprint: LandingPageBlueprintV2, theme: ResolvedTheme): void {
  const shell = builder.create('section', 'footer-section', 'page-root', { label: 'Footer' }, {
    width: 'full', backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, paddingTop: 64, paddingBottom: 32,
  })
  const container = addContainer(builder, shell.id, 'footer-container')
  const layout = builder.create('stack', 'footer-layout', container.id, {}, {
    display: section.variant === 'columns' ? 'grid' : 'flex', gridColumns: section.variant === 'columns' ? 3 : undefined,
    flexDirection: 'column', gap: 36,
  }, { mobile: { display: 'flex', flexDirection: 'column', gap: 28 } })
  const brand = builder.create('stack', 'footer-brand', layout.id, {}, { display: 'flex', flexDirection: 'column', gap: 12 })
  builder.create('heading', 'footer-brand-heading', brand.id, { text: blueprint.brand, level: 2 }, {
    fontFamily: theme.headingFont, fontSize: 24, fontWeight: '800', color: theme.text,
  })
  builder.create('paragraph', 'footer-tagline', brand.id, { text: section.tagline }, { maxWidth: 360, fontSize: 15, lineHeight: 1.6, color: theme.muted })
  if (section.variant === 'columns') section.columns.forEach((column, columnIndex) => {
    const group = builder.create('stack', `footer-column-${columnIndex + 1}`, layout.id, {}, { display: 'flex', flexDirection: 'column', gap: 12 })
    builder.create('heading', `footer-column-heading-${columnIndex + 1}`, group.id, { text: column.heading, level: 3 }, {
      fontFamily: theme.headingFont, fontSize: 15, fontWeight: '800', color: theme.text,
    })
    column.links.forEach((link, linkIndex) => builder.create('link', `footer-link-${columnIndex + 1}-${linkIndex + 1}`, group.id, link, {
      fontSize: 14, color: theme.muted,
    }))
  })
  builder.create('divider', 'footer-divider', container.id, {}, { width: 'full', borderColor: theme.border, borderWidth: 1, marginTop: 36, marginBottom: 24 })
  builder.create('paragraph', 'footer-copyright', container.id, { text: section.copyright }, { fontSize: 13, color: theme.muted })
}

function renderSection(
  builder: DocumentBuilder,
  section: BlueprintV2Section,
  blueprint: LandingPageBlueprintV2,
  theme: ResolvedTheme,
  imagePolicy: RemoteImagePolicy | undefined,
  index: number,
  ownedMedia: OwnedMediaMap,
): void {
  switch (section.type) {
    case 'logo-cloud': renderLogoCloud(builder, section, theme, index); break
    case 'stats': renderStats(builder, section, theme, index); break
    case 'features': renderFeatures(builder, section, theme, imagePolicy, index, ownedMedia); break
    case 'testimonials': renderTestimonials(builder, section, theme, index); break
    case 'pricing': renderPricing(builder, section, theme, index); break
    case 'faq': renderFaq(builder, section, theme, index); break
    case 'final-cta': renderFinalCta(builder, section, theme); break
    case 'footer': renderFooter(builder, section, blueprint, theme); break
  }
}

export function materializeLandingPageBlueprintV2(input: {
  blueprint: unknown
  current: DesignDocument
  imagePolicy?: RemoteImagePolicy
  heroImage?: OwnedImageProps
  ownedMedia?: OwnedMediaMap
}): { accepted: true; document: DesignDocument } | { accepted: false; issues: string[] } {
  const parsed = landingPageBlueprintV2Schema.safeParse(input.blueprint)
  if (!parsed.success) return { accepted: false, issues: ['invalid_blueprint'] }
  const ownedMediaInput = { ...(input.ownedMedia ?? {}), ...(input.heroImage ? { hero: input.heroImage } : {}) }
  const ownedMedia: OwnedMediaMap = {}
  for (const [slot, image] of Object.entries(ownedMediaInput)) {
    if (!['hero', 'feature-1', 'feature-2', 'feature-3'].includes(slot)) return { accepted: false, issues: ['invalid_owned_media'] }
    const parsedImage = ownedImagePropsSchema.safeParse(image)
    if (!parsedImage.success) return { accepted: false, issues: ['invalid_owned_media'] }
    ownedMedia[slot as OwnedMediaSlot] = parsedImage.data
  }
  const blueprint = parsed.data
  const theme = resolveTheme(blueprint.theme, blueprint.pagePreset)
  const builder = new DocumentBuilder()
  builder.create('page', 'page-root', null, {}, { width: 'full', backgroundColor: theme.background })
  renderNavbar(builder, blueprint, theme)
  renderHero(builder, blueprint, theme, input.imagePolicy, ownedMedia.hero)
  blueprint.sections.forEach((section, index) => renderSection(
    builder, section, blueprint, theme, input.imagePolicy, index, ownedMedia,
  ))

  const document: DesignDocument = {
    schemaVersion: 1,
    projectId: input.current.projectId,
    version: input.current.version,
    theme: {
      colors: { primary: theme.primary, background: theme.background, text: theme.text },
      fonts: { heading: theme.headingFont, body: theme.bodyFont },
      radius: theme.radius,
    },
    pages: [{ id: 'home', name: blueprint.brand, slug: '/', rootNodeId: 'page-root' }],
    nodes: builder.nodes,
  }
  const validation = validateDesignDocument(document, input.imagePolicy ? { imagePolicy: input.imagePolicy } : {})
  if (!validation.success) return { accepted: false, issues: ['invalid_blueprint'] }
  if (validateRegistryRelationships(validation.data).length > 0) return { accepted: false, issues: ['invalid_blueprint'] }
  return { accepted: true, document: validation.data }
}
