import { createRemoteImagePolicy, createValidDesignFixture, validateDesignDocument } from '@zenui/design-schema'
import { describe, expect, it } from 'vitest'

import {
  landingPageBlueprintV2JsonSchema,
  landingPageBlueprintV2Schema,
  materializeLandingPageBlueprintV2,
  sectionPresetRegistry,
} from '../src/index.js'

const blueprintV2 = {
  version: 2 as const,
  pagePreset: 'saas' as const,
  brand: 'Atlas AI',
  theme: {
    preset: 'indigo' as const,
    mood: 'confident' as const,
    density: 'balanced' as const,
    headingFont: 'Manrope' as const,
    bodyFont: 'Manrope' as const,
  },
  navbar: {
    variant: 'announcement' as const,
    announcement: 'New: AI workflows for growing teams',
    links: [
      { text: 'Features', href: '#features' },
      { text: 'Pricing', href: '#pricing' },
      { text: 'FAQ', href: '#faq' },
    ],
    cta: { text: 'Start free', href: '#start' },
  },
  hero: {
    variant: 'product-shot' as const,
    badge: 'AI workspace',
    heading: 'Turn every idea into an intelligent workflow',
    paragraph: 'Atlas AI gives focused teams one structured workspace to automate work, find answers, and ship better outcomes.',
    primaryCta: { text: 'Start free', href: '#start' },
    secondaryCta: { text: 'See how it works', href: '#features' },
    image: { src: 'https://images.unsplash.com/photo-1677442136019-21780ecad995', alt: 'Team using an AI workspace' },
    proof: 'Trusted by more than 2,000 focused teams',
  },
  sections: [
    {
      type: 'logo-cloud' as const,
      variant: 'panel' as const,
      eyebrow: 'Used by ambitious teams',
      logos: ['Acme', 'Northstar', 'Vertex', 'Orbit', 'Luma'],
    },
    {
      type: 'stats' as const,
      variant: 'cards' as const,
      heading: 'Measurable impact from the first workflow',
      items: [
        { value: '42%', label: 'less repetitive work' },
        { value: '3.4×', label: 'faster delivery cycles' },
        { value: '24/7', label: 'knowledge available' },
      ],
    },
    {
      type: 'features' as const,
      variant: 'bento' as const,
      eyebrow: 'A complete AI operating layer',
      heading: 'Move from scattered prompts to repeatable results',
      paragraph: 'Build workflows that your whole team can understand, edit, and improve together.',
      items: [
        { icon: 'star' as const, heading: 'Structured workflows', paragraph: 'Turn successful prompts into reusable processes with clear owners and inputs.' },
        { icon: 'check' as const, heading: 'Reliable answers', paragraph: 'Ground every response in the context your team has approved.' },
        { icon: 'arrow-right' as const, heading: 'Fast handoffs', paragraph: 'Move work between people and AI without losing decisions or context.' },
        { icon: 'menu' as const, heading: 'One workspace', paragraph: 'Keep knowledge, tasks, and outcomes visible in one shared operating view.' },
      ],
    },
    {
      type: 'testimonials' as const,
      variant: 'spotlight' as const,
      eyebrow: 'Customer stories',
      heading: 'Teams use Atlas AI to create momentum',
      items: [
        { quote: 'Atlas helped us replace disconnected experiments with a workflow everyone can trust.', name: 'Linh Nguyen', role: 'Head of Operations, Northstar' },
        { quote: 'Our team now ships in days instead of weeks without sacrificing review quality.', name: 'Minh Tran', role: 'Product Lead, Vertex' },
      ],
    },
    {
      type: 'pricing' as const,
      variant: 'contrast' as const,
      eyebrow: 'Simple pricing',
      heading: 'Start small and scale with your team',
      paragraph: 'Every plan includes structured workflows and secure team collaboration.',
      plans: [
        {
          name: 'Starter', price: '$19 per month', description: 'For individuals validating their first AI workflows.',
          features: ['5 active workflows', 'Shared knowledge base', 'Email support'],
          cta: { text: 'Choose Starter', href: '#start' }, highlighted: false,
        },
        {
          name: 'Team', price: '$49 per member monthly', description: 'For teams turning AI into a repeatable operating advantage.',
          features: ['Unlimited workflows', 'Team roles', 'Usage analytics', 'Priority support'],
          cta: { text: 'Start Team plan', href: '#start' }, highlighted: true,
        },
      ],
    },
    {
      type: 'faq' as const,
      variant: 'two-column' as const,
      eyebrow: 'Common questions',
      heading: 'Everything you need before getting started',
      items: [
        { question: 'Can we start with one workflow?', answer: 'Yes. Start with one high-value process and add more as your team proves what works.' },
        { question: 'Can non-technical teammates edit it?', answer: 'Yes. Atlas uses structured building blocks so teammates can improve content without writing code.' },
        { question: 'How is our data handled?', answer: 'Workspace access is controlled and provider output is validated before it can change a workflow.' },
      ],
    },
    {
      type: 'final-cta' as const,
      variant: 'split' as const,
      heading: 'Build your first trusted AI workflow today',
      paragraph: 'Give your team a clear, editable path from prompt to business outcome.',
      primaryCta: { text: 'Start free', href: '#start' },
      secondaryCta: { text: 'Talk to our team', href: 'mailto:hello@example.com' },
    },
    {
      type: 'footer' as const,
      variant: 'columns' as const,
      tagline: 'Structured AI workflows for teams that care about reliable outcomes.',
      columns: [
        { heading: 'Product', links: [{ text: 'Features', href: '#features' }, { text: 'Pricing', href: '#pricing' }] },
        { heading: 'Company', links: [{ text: 'About', href: '/about' }, { text: 'Contact', href: 'mailto:hello@example.com' }] },
      ],
      copyright: '© 2026 Atlas AI. All rights reserved.',
    },
  ],
}

describe('Blueprint v2 and section presets', () => {
  it('exports a strict compact schema without document-tree or raw-code control', () => {
    const schemaText = JSON.stringify(landingPageBlueprintV2JsonSchema)

    expect(landingPageBlueprintV2Schema.safeParse(blueprintV2).success).toBe(true)
    expect(schemaText).toContain('pagePreset')
    expect(schemaText).toContain('product-launch')
    expect(schemaText).toContain('bento')
    expect(schemaText).not.toMatch(/parentId|rootNodeId|rawCss|javascript|documentVersion/i)
    expect(schemaText.length).toBeLessThan(45_000)
  })

  it('registers every section with variants, a template, responsive rules and accessibility rules', () => {
    expect(Object.keys(sectionPresetRegistry).sort()).toEqual([
      'faq', 'features', 'final-cta', 'footer', 'logo-cloud', 'pricing', 'stats', 'testimonials',
    ])
    for (const definition of Object.values(sectionPresetRegistry)) {
      expect(definition.variants.length).toBeGreaterThan(0)
      expect(definition.template.root).toBe('section')
      expect(definition.template.componentTypes.length).toBeGreaterThan(2)
      expect(definition.responsiveContract.length).toBeGreaterThan(0)
      expect(definition.accessibilityRules.length).toBeGreaterThan(0)
    }
  })

  it('rejects duplicate sections, incomplete pages and forbidden fields', () => {
    expect(landingPageBlueprintV2Schema.safeParse({ ...blueprintV2, nodes: {} }).success).toBe(false)
    expect(landingPageBlueprintV2Schema.safeParse({
      ...blueprintV2,
      sections: blueprintV2.sections.filter(section => section.type !== 'footer'),
    }).success).toBe(false)
    expect(landingPageBlueprintV2Schema.safeParse({
      ...blueprintV2,
      sections: [...blueprintV2.sections, blueprintV2.sections[0]],
    }).success).toBe(false)
    expect(landingPageBlueprintV2Schema.safeParse({
      ...blueprintV2,
      sections: [blueprintV2.sections.at(-1), ...blueprintV2.sections.slice(0, -1)],
    }).success).toBe(false)
  })

  it('materializes a complete deterministic editable landing page', () => {
    const current = createValidDesignFixture()
    const policy = createRemoteImagePolicy('images.example.com,images.unsplash.com,images.pexels.com')
    const first = materializeLandingPageBlueprintV2({ blueprint: blueprintV2, current, imagePolicy: policy })
    const second = materializeLandingPageBlueprintV2({ blueprint: blueprintV2, current, imagePolicy: policy })

    expect(first).toEqual(second)
    expect(first).toMatchObject({ accepted: true })
    if (!first.accepted) return
    expect(Object.keys(first.document.nodes).length).toBeGreaterThan(90)
    expect(first.document.nodes['hero-image']).toBeDefined()
    expect(first.document.nodes['logo-cloud-section']).toBeDefined()
    expect(first.document.nodes['stats-section']).toBeDefined()
    expect(first.document.nodes['features-section']).toBeDefined()
    expect(first.document.nodes['testimonials-section']).toBeDefined()
    expect(first.document.nodes['pricing-section']).toBeDefined()
    expect(first.document.nodes['faq-section']).toBeDefined()
    expect(first.document.nodes['final-cta-section']).toBeDefined()
    expect(first.document.nodes['footer-section']).toBeDefined()
    expect(validateDesignDocument(first.document, { imagePolicy: policy }).success).toBe(true)
  })

  it('materializes bounded server-owned Hero and feature media independently of model URLs', () => {
    const withoutRemoteImages = {
      ...blueprintV2,
      hero: { ...blueprintV2.hero, image: undefined },
      sections: blueprintV2.sections.map(section => section.type === 'features'
        ? { ...section, variant: 'alternating' as const }
        : section),
    }
    const result = materializeLandingPageBlueprintV2({
      blueprint: withoutRemoteImages,
      current: createValidDesignFixture(),
      ownedMedia: {
        hero: { assetId: '55555555-5555-4555-8555-555555555555', alt: 'AI workspace team', decorative: false },
        'feature-1': { assetId: '66666666-6666-4666-8666-666666666666', alt: 'Structured workflow board', decorative: false },
        'feature-2': { assetId: '77777777-7777-4777-8777-777777777777', alt: 'Reliable knowledge review', decorative: false },
        'feature-3': { assetId: '88888888-8888-4888-8888-888888888888', alt: 'Fast team handoff', decorative: false },
      },
    })

    expect(result).toMatchObject({ accepted: true })
    if (!result.accepted) return
    expect(result.document.nodes['hero-image']?.props).toMatchObject({ assetId: '55555555-5555-4555-8555-555555555555' })
    expect(result.document.nodes['feature-image-1']?.props).toMatchObject({ assetId: '66666666-6666-4666-8666-666666666666' })
    expect(result.document.nodes['feature-image-2']?.props).toMatchObject({ assetId: '77777777-7777-4777-8777-777777777777' })
    expect(result.document.nodes['feature-image-3']?.props).toMatchObject({ assetId: '88888888-8888-4888-8888-888888888888' })
    expect(Object.keys(result.document.nodes).filter(id => id.startsWith('feature-image-'))).toHaveLength(3)
  })

  it('omits denied optional images without rejecting the generated page', () => {
    const current = createValidDesignFixture()
    const deniedImage = {
      ...blueprintV2,
      hero: { ...blueprintV2.hero, image: { src: 'https://attacker.example/hero.jpg', alt: 'Unsafe host' } },
    }
    const result = materializeLandingPageBlueprintV2({
      blueprint: deniedImage,
      current,
      imagePolicy: createRemoteImagePolicy('images.unsplash.com,images.pexels.com'),
    })

    expect(result, !result.accepted ? result.issues.join(', ') : undefined).toMatchObject({ accepted: true })
    if (!result.accepted) return
    expect(result.document.nodes['hero-image']).toBeUndefined()
    expect(result.document.nodes['hero-product-card']).toBeDefined()
  })
})

export { blueprintV2 }
