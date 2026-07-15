import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { nextRunAt, normalizeAutomation, normalizeSchedule } = require('./automation-state.cjs')

describe('automation state', () => {
  it('normalizes unsafe schedule values', () => {
    expect(normalizeSchedule({ kind: 'interval', intervalMinutes: 1 })).toEqual({ kind: 'interval', intervalMinutes: 15 })
    expect(normalizeSchedule({ kind: 'weekly', hour: 40, minute: -2, days: [1, 1, 8] })).toEqual({ kind: 'weekly', hour: 23, minute: 0, days: [1, 6] })
  })

  it('finds the next local daily and weekly occurrence', () => {
    const mondayMorning = new Date(2026, 6, 13, 8, 30).getTime()
    expect(new Date(nextRunAt({ kind: 'daily', hour: 9, minute: 0 }, mondayMorning)).getHours()).toBe(9)
    const nextMonday = nextRunAt({ kind: 'weekly', hour: 8, minute: 0, days: [1] }, mondayMorning)
    expect(new Date(nextMonday).getDate()).toBe(20)
  })

  it('keeps an overdue one-time automation ready for startup catch-up', () => {
    const automation = normalizeAutomation({
      id: 'automation-1', name: 'Review', prompt: 'Review changes', projectPath: '/project',
      enabled: true, schedule: { kind: 'once', onceAt: 100 }, createdAt: 1,
    }, 200)
    expect(automation.enabled).toBe(true)
    expect(automation.nextRunAt).toBe(100)
  })
})
