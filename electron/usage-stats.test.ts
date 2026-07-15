import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { emptyUsage, recordUsage, usageSummary } = require('./usage-stats.cjs')

describe('usage statistics', () => {
  it('aggregates local events by day and model', () => {
    const at = new Date(2026, 6, 15, 10).getTime()
    let usage = recordUsage(emptyUsage(), { at, model: 'openai/gpt-5.4', tokens: 120, messages: 1, toolCalls: 2, sessions: 1 })
    usage = recordUsage(usage, { at, model: 'openai/gpt-5.4', tokens: 80, messages: 1, completed: 1 })
    expect(usage.totals).toMatchObject({ tokens: 200, messages: 2, toolCalls: 2, sessions: 1, completed: 1 })
    expect(usage.models['openai/gpt-5.4'].tokens).toBe(200)
  })

  it('filters range summaries without trusting stored totals', () => {
    const now = new Date(2026, 6, 15, 10).getTime()
    let usage = recordUsage(emptyUsage(), { at: now, model: 'recent/model', tokens: 10, messages: 1 })
    usage = recordUsage(usage, { at: new Date(2025, 0, 1).getTime(), model: 'old/model', tokens: 99, messages: 1 })
    expect(usageSummary(usage, '7d', now).totals.tokens).toBe(10)
    expect(usageSummary(usage, '7d', now).models.map((item) => item.model)).toEqual(['recent/model'])
    expect(usageSummary(usage, 'all', now).totals.tokens).toBe(109)
  })
})
