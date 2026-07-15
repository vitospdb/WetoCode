const GOAL_STATUSES = new Set(['active', 'paused', 'budget_limited', 'complete', 'failed'])
const DEFAULT_LIMITS = Object.freeze({ maxIterations: 8, maxMinutes: 120, maxTokens: 1_000_000 })

function cleanLimits(value = {}) {
  return {
    maxIterations: Math.min(50, Math.max(1, Number(value.maxIterations) || DEFAULT_LIMITS.maxIterations)),
    maxMinutes: Math.min(24 * 60, Math.max(5, Number(value.maxMinutes) || DEFAULT_LIMITS.maxMinutes)),
    maxTokens: Math.min(20_000_000, Math.max(10_000, Number(value.maxTokens) || DEFAULT_LIMITS.maxTokens)),
  }
}

function normalizeGoal(value) {
  if (!value || typeof value.id !== 'string' || typeof value.sessionId !== 'string' || typeof value.objective !== 'string') return undefined
  return {
    id: value.id,
    sessionId: value.sessionId,
    projectPath: String(value.projectPath || ''),
    objective: value.objective.trim().slice(0, 4000),
    status: GOAL_STATUSES.has(value.status) ? value.status : 'paused',
    iteration: Math.max(0, Number(value.iteration) || 0),
    createdAt: Number(value.createdAt) || Date.now(),
    updatedAt: Number(value.updatedAt) || Date.now(),
    startedAt: Number(value.startedAt) || Date.now(),
    completedAt: value.completedAt ? Number(value.completedAt) : undefined,
    tokenUsage: Math.max(0, Number(value.tokenUsage) || 0),
    toolCalls: Math.max(0, Number(value.toolCalls) || 0),
    nextAction: String(value.nextAction || '').slice(0, 2000),
    limits: cleanLimits(value.limits),
    timeline: Array.isArray(value.timeline) ? value.timeline.slice(-100).map((entry) => ({
      id: String(entry.id || ''),
      at: Number(entry.at) || Date.now(),
      iteration: Math.max(0, Number(entry.iteration) || 0),
      result: ['continue', 'complete', 'error'].includes(entry.result) ? entry.result : 'error',
      summary: String(entry.summary || '').slice(0, 4000),
    })) : [],
  }
}

function normalizeGoals(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).flatMap(([sessionId, goal]) => {
    const normalized = normalizeGoal(goal)
    return normalized ? [[sessionId, normalized]] : []
  }))
}

function goalBudgetReason(goal, now = Date.now()) {
  if (!goal) return undefined
  if (goal.iteration >= goal.limits.maxIterations) return 'iteration'
  if (goal.tokenUsage >= goal.limits.maxTokens) return 'tokens'
  if (now - goal.startedAt >= goal.limits.maxMinutes * 60_000) return 'time'
  return undefined
}

function createGoalState({ id, sessionId, projectPath, objective, limits }, now = Date.now()) {
  const cleanObjective = String(objective || '').trim().slice(0, 4000)
  if (!cleanObjective) throw new Error('目标不能为空。')
  return normalizeGoal({
    id, sessionId, projectPath, objective: cleanObjective, status: 'active', iteration: 1,
    createdAt: now, updatedAt: now, startedAt: now, tokenUsage: 0, toolCalls: 0, limits, timeline: [],
  })
}

function updateGoalState(goal, patch, now = Date.now()) {
  const current = normalizeGoal(goal)
  if (!current) throw new Error('目标不存在。')
  const next = normalizeGoal({ ...current, ...patch, updatedAt: now })
  if (next.status === 'complete' && !next.completedAt) next.completedAt = now
  if (next.status !== 'complete') next.completedAt = undefined
  return next
}

module.exports = { DEFAULT_LIMITS, createGoalState, goalBudgetReason, normalizeGoal, normalizeGoals, updateGoalState }
