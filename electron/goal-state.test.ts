import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createGoalState, goalBudgetReason, normalizeGoals, updateGoalState } = require('./goal-state.cjs')

describe('goal state', () => {
  it('creates a bounded persistent goal contract', () => {
    const goal = createGoalState({ id: 'goal-1', sessionId: 'session-1', projectPath: '/project', objective: '  修复全部测试  ', limits: { maxIterations: 999, maxMinutes: 1, maxTokens: 2 } }, 1000)
    expect(goal).toMatchObject({ objective: '修复全部测试', status: 'active', iteration: 1 })
    expect(goal.limits).toEqual({ maxIterations: 50, maxMinutes: 5, maxTokens: 10000 })
  })

  it('fails closed when any budget is exhausted', () => {
    const goal = createGoalState({ id: 'goal-1', sessionId: 'session-1', projectPath: '/project', objective: '完成任务', limits: { maxIterations: 2, maxMinutes: 10, maxTokens: 50000 } }, 1000)
    expect(goalBudgetReason({ ...goal, iteration: 2 }, 2000)).toBe('iteration')
    expect(goalBudgetReason({ ...goal, tokenUsage: 50000 }, 2000)).toBe('tokens')
    expect(goalBudgetReason(goal, 601001)).toBe('time')
  })

  it('normalizes storage and records terminal completion time', () => {
    const goal = createGoalState({ id: 'goal-1', sessionId: 'session-1', projectPath: '/project', objective: '完成任务' }, 1000)
    const complete = updateGoalState(goal, { status: 'complete' }, 2000)
    expect(complete.completedAt).toBe(2000)
    expect(normalizeGoals({ 'session-1': complete, broken: { nope: true } })).toEqual({ 'session-1': complete })
  })
})
