import { PGlite } from '@electric-sql/pglite'
import { createValidDesignFixture } from '@zenui/design-schema'
import { drizzle } from 'drizzle-orm/pglite'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  createProjectRepository,
  createUsageRepository,
  migrateTestDatabase,
} from '../src/index'
import * as schema from '../src/schema'

const owner = {
  userId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
}
const member = {
  userId: '33333333-3333-4333-8333-333333333333',
  workspaceId: owner.workspaceId,
}
const outsider = {
  userId: '44444444-4444-4444-8444-444444444444',
  workspaceId: '55555555-5555-4555-8555-555555555555',
}
const now = new Date('2026-08-18T08:00:00.000Z')

describe('current-user AI usage repository', () => {
  let client: PGlite

  beforeEach(async () => {
    client = new PGlite()
    await migrateTestDatabase(client)
    await client.exec(`
      INSERT INTO users (id, name, email) VALUES
        ('${owner.userId}', 'Owner', 'owner@example.test'),
        ('${member.userId}', 'Member', 'member@example.test'),
        ('${outsider.userId}', 'Outsider', 'outsider@example.test');
      INSERT INTO workspaces (id, name, created_by) VALUES
        ('${owner.workspaceId}', 'Owner Workspace', '${owner.userId}'),
        ('${outsider.workspaceId}', 'Other Workspace', '${outsider.userId}');
      INSERT INTO workspace_members (workspace_id, user_id, role) VALUES
        ('${owner.workspaceId}', '${owner.userId}', 'owner'),
        ('${owner.workspaceId}', '${member.userId}', 'editor'),
        ('${outsider.workspaceId}', '${outsider.userId}', 'owner');
    `)
  })

  async function setup() {
    const db = drizzle(client, { schema })
    const projects = createProjectRepository(db)
    const first = await projects.create(owner, {
      name: 'Alpha Landing',
      document: createValidDesignFixture(),
    })
    const second = await projects.create(owner, {
      name: 'Beta Store',
      document: createValidDesignFixture(),
    })
    const foreign = await createProjectRepository(db).create(outsider, {
      name: 'Foreign',
      document: createValidDesignFixture(),
    })
    await client.exec(`
      INSERT INTO usage_records (
        workspace_id, project_id, user_id, provider, model,
        input_tokens, output_tokens, total_tokens,
        pricing_version, input_rate_micro_usd_per_million,
        output_rate_micro_usd_per_million,
        input_estimated_micro_usd, output_estimated_micro_usd,
        total_estimated_micro_usd, currency, created_at
      ) VALUES
        ('${owner.workspaceId}', '${first.id}', '${owner.userId}',
          'google-gemini', 'gemini-2.5-flash', 10, 20, 30,
          'google-gemini-2026-08-13', 300000, 2500000,
          3, 50, 53, 'USD', '2026-08-18T00:00:00.000Z'),
        ('${owner.workspaceId}', '${second.id}', '${owner.userId}',
          'google-gemini', 'unknown-model', 4, 8, 12,
          NULL, NULL, NULL, NULL, NULL, NULL, NULL,
          '2026-08-17T16:30:00.000Z'),
        ('${owner.workspaceId}', '${first.id}', '${owner.userId}',
          'google-gemini', 'old-model', 100, 100, 200,
          NULL, NULL, NULL, NULL, NULL, NULL, NULL,
          '2026-07-19T16:59:59.000Z'),
        ('${owner.workspaceId}', '${first.id}', '${member.userId}',
          'google-gemini', 'member-model', 500, 500, 1000,
          NULL, NULL, NULL, NULL, NULL, NULL, NULL,
          '2026-08-18T01:00:00.000Z'),
        ('${outsider.workspaceId}', '${foreign.id}', '${outsider.userId}',
          'google-gemini', 'foreign-model', 900, 900, 1800,
          NULL, NULL, NULL, NULL, NULL, NULL, NULL,
          '2026-08-18T01:00:00.000Z');
    `)
    return {
      first,
      second,
      usage: createUsageRepository(db),
    }
  }

  it('returns bounded timezone aggregates for only the authenticated user', async () => {
    const { usage } = await setup()

    const report = await usage.report(owner, {
      days: 30,
      page: 1,
      pageSize: 25,
      timezone: 'Asia/Ho_Chi_Minh',
    }, now)

    expect(report.range).toEqual({
      days: 30,
      timezone: 'Asia/Ho_Chi_Minh',
      from: '2026-07-19T17:00:00.000Z',
      to: now.toISOString(),
    })
    expect(report.totals).toEqual({
      todayTokens: 30,
      inputTokens: 14,
      outputTokens: 28,
      totalTokens: 42,
      pricedEstimatedMicroUsd: 53,
      unpricedCount: 1,
      currency: 'USD',
    })
    expect(report.items).toHaveLength(2)
    expect(report.items.map(item => item.model)).toEqual([
      'gemini-2.5-flash',
      'unknown-model',
    ])
    expect(report.items[0]).toMatchObject({
      text: {
        provider: 'google-gemini',
        model: 'gemini-2.5-flash',
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        pricing: {
          status: 'priced',
          totalEstimatedMicroUsd: 53,
        },
      },
      pricing: {
        status: 'priced',
        totalEstimatedMicroUsd: 53,
      },
    })
    expect(report.items[1]?.pricing).toEqual({
      status: 'unpriced',
      reason: 'unknown_model',
    })
    expect(report.series).toHaveLength(30)
    expect(report.series.at(-1)).toEqual({
      date: '2026-08-18',
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
    })
  })

  it('filters and paginates without accepting another user scope', async () => {
    const { second, usage } = await setup()

    const filtered = await usage.report(owner, {
      days: 30,
      projectId: second.id,
      provider: 'google-gemini',
      model: 'unknown-model',
      search: 'Beta',
      page: 1,
      pageSize: 1,
      timezone: 'UTC',
    }, now)

    expect(filtered.total).toBe(1)
    expect(filtered.totalPages).toBe(1)
    expect(filtered.items[0]).toMatchObject({
      projectId: second.id,
      projectName: 'Beta Store',
      model: 'unknown-model',
    })
    await expect(usage.report(owner, {
      days: 30,
      page: 1,
      pageSize: 25,
      timezone: 'UTC',
      userId: member.userId,
    } as never, now)).rejects.toThrow('invalid_usage_query')
  })

  it('returns an empty report without leaking data for a missing membership', async () => {
    const { usage } = await setup()
    const missing = {
      userId: crypto.randomUUID(),
      workspaceId: owner.workspaceId,
    }

    await expect(usage.report(missing, {
      days: 30,
      page: 1,
      pageSize: 25,
      timezone: 'UTC',
    }, now)).rejects.toThrow('not_found')
  })
})
