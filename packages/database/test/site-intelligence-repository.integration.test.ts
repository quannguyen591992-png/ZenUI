import { PGlite } from '@electric-sql/pglite'
import { analyzeSiteIntelligence, type WebsiteBrief } from '@zenui/ai-core'
import { createValidDesignFixture } from '@zenui/design-schema'
import { drizzle } from 'drizzle-orm/pglite'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  createDesignDirectionRepository,
  createProjectRepository,
  createSiteIntelligenceRepository,
  migrateTestDatabase,
} from '../src/index'
import * as schema from '../src/schema'

const owner = { userId: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222' }
const outsider = { userId: '33333333-3333-4333-8333-333333333333', workspaceId: '44444444-4444-4444-8444-444444444444' }
const brief: WebsiteBrief = {
  description: 'NovaFlow giúp nhóm nhỏ lên kế hoạch ra mắt.',
  offer: 'Công cụ lập kế hoạch ra mắt', audience: 'nhóm sản phẩm nhỏ',
  primaryGoal: 'đặt lịch tư vấn', cta: 'Đặt lịch tư vấn', tone: 'rõ ràng',
  brandDetails: 'NovaFlow', mustHaveSections: ['introduction', 'benefits', 'trust', 'faq', 'contact'],
}

describe('site intelligence repository', () => {
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
    const projects = createProjectRepository(db)
    const project = await projects.create(owner, { name: 'NovaFlow', document: createValidDesignFixture() })
    await createDesignDirectionRepository(db).saveBrief(owner, project.id, brief)
    return { project, projects, intelligence: createSiteIntelligenceRepository(db) }
  }

  it('creates one idempotent version-bound snapshot without mutating project history', async () => {
    const { project, projects, intelligence } = await setup()
    const analysis = analyzeSiteIntelligence({ document: project.document, brief })
    const input = { requestId: crypto.randomUUID(), expectedVersion: 1, analysis }

    const first = await intelligence.create(owner, project.id, input)
    const duplicate = await intelligence.create(owner, project.id, input)

    expect(duplicate.id).toBe(first.id)
    expect(first).toMatchObject({ documentVersion: 1, stale: false, analysis })
    expect((await projects.findById(owner, project.id))?.version).toBe(1)
    expect(await projects.listRevisions(owner, project.id)).toEqual([])
    expect(await intelligence.findById(outsider, first.id)).toBeNull()
    expect(await intelligence.findLatest(outsider, project.id)).toBeNull()
  })

  it('marks a snapshot stale after relevant project version changes', async () => {
    const { project, projects, intelligence } = await setup()
    const analysis = analyzeSiteIntelligence({ document: project.document, brief })
    const review = await intelligence.create(owner, project.id, {
      requestId: crypto.randomUUID(), expectedVersion: 1, analysis,
    })
    const updated = structuredClone(project.document)
    updated.version = 2
    updated.nodes['heading-1']!.props = { text: 'A newer heading', level: 1 }
    expect(await projects.replaceDocument(owner, project.id, 1, updated)).toMatchObject({ accepted: true })

    expect(await intelligence.findById(owner, review.id)).toMatchObject({ stale: true })
    expect(await intelligence.findLatest(owner, project.id)).toMatchObject({ id: review.id, stale: true })
  })

  it('dismisses and restores findings idempotently per actor and evidence fingerprint', async () => {
    const { project, intelligence } = await setup()
    const analysis = analyzeSiteIntelligence({ document: project.document, brief })
    const review = await intelligence.create(owner, project.id, {
      requestId: crypto.randomUUID(), expectedVersion: 1, analysis,
    })
    const finding = review.analysis.findings[0]!

    const dismissed = await intelligence.dismiss(owner, project.id, finding.fingerprint)
    const duplicate = await intelligence.dismiss(owner, project.id, finding.fingerprint)
    expect(dismissed).toEqual(duplicate)
    expect((await intelligence.findById(owner, review.id))?.dismissedFindingFingerprints).toContain(finding.fingerprint)
    expect(await intelligence.dismiss(outsider, project.id, finding.fingerprint)).toBeNull()

    expect(await intelligence.restore(owner, project.id, finding.fingerprint)).toMatchObject({ active: false })
    expect(await intelligence.restore(owner, project.id, finding.fingerprint)).toMatchObject({ active: false })
    expect((await intelligence.findById(owner, review.id))?.dismissedFindingFingerprints).not.toContain(finding.fingerprint)
  })

  it('reopens the same finding type only when its evidence fingerprint changes', async () => {
    const { project, projects, intelligence } = await setup()
    const firstAnalysis = analyzeSiteIntelligence({ document: project.document, brief })
    const firstReview = await intelligence.create(owner, project.id, {
      requestId: crypto.randomUUID(), expectedVersion: 1, analysis: firstAnalysis,
    })
    const firstFinding = firstReview.analysis.findings.find(finding => finding.code === 'cta-needs-clarity')!
    await intelligence.dismiss(owner, project.id, firstFinding.fingerprint)

    const updated = structuredClone(project.document)
    updated.version = 2
    updated.nodes['button-1']!.props = { text: 'Tìm hiểu thêm', href: '#more' }
    expect(await projects.replaceDocument(owner, project.id, 1, updated)).toMatchObject({ accepted: true })
    const secondAnalysis = analyzeSiteIntelligence({ document: updated, brief })
    const secondReview = await intelligence.create(owner, project.id, {
      requestId: crypto.randomUUID(), expectedVersion: 2, analysis: secondAnalysis,
    })
    const secondFinding = secondReview.analysis.findings.find(finding => finding.code === 'cta-needs-clarity')!

    expect(secondFinding.evidenceFingerprint).not.toBe(firstFinding.evidenceFingerprint)
    expect(secondFinding.fingerprint).not.toBe(firstFinding.fingerprint)
    expect(secondReview.dismissedFindingFingerprints).toContain(firstFinding.fingerprint)
    expect(secondReview.dismissedFindingFingerprints).not.toContain(secondFinding.fingerprint)
  })

  it('rejects malformed, stale, mismatched and unknown finding inputs', async () => {
    const { project, intelligence } = await setup()
    const analysis = analyzeSiteIntelligence({ document: project.document, brief })
    await expect(intelligence.create(owner, project.id, {
      requestId: 'invalid', expectedVersion: 1, analysis,
    })).rejects.toThrow('invalid_site_intelligence_input')
    const staleAnalysis = { ...analysis, documentVersion: 2 }
    await expect(intelligence.create(owner, project.id, {
      requestId: crypto.randomUUID(), expectedVersion: 2, analysis: staleAnalysis,
    })).rejects.toThrow('stale_document_version')
    const tampered = { ...analysis, documentVersion: 2 }
    await expect(intelligence.create(owner, project.id, {
      requestId: crypto.randomUUID(), expectedVersion: 1, analysis: tampered,
    })).rejects.toThrow('invalid_site_intelligence_input')
    expect(await intelligence.dismiss(owner, project.id, '0000000000000000')).toBeNull()
    expect(await intelligence.restore(owner, project.id, 'invalid')).toBeNull()
    expect(await intelligence.findById(owner, crypto.randomUUID())).toBeNull()
  })
})
