const MAX_HISTORY = 30
const VALID_KINDS = new Set(['once', 'interval', 'daily', 'weekly'])

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, Math.round(number))) : fallback
}

function normalizeSchedule(input = {}) {
  const kind = VALID_KINDS.has(input.kind) ? input.kind : 'daily'
  const schedule = { kind }
  if (kind === 'once') schedule.onceAt = Math.max(0, Number(input.onceAt) || 0)
  if (kind === 'interval') schedule.intervalMinutes = clamp(input.intervalMinutes, 15, 10_080, 60)
  if (kind === 'daily' || kind === 'weekly') {
    schedule.hour = clamp(input.hour, 0, 23, 9)
    schedule.minute = clamp(input.minute, 0, 59, 0)
  }
  if (kind === 'weekly') {
    const days = [...new Set((Array.isArray(input.days) ? input.days : [1, 2, 3, 4, 5])
      .map((day) => clamp(day, 0, 6, 1)))].sort((left, right) => left - right)
    schedule.days = days.length ? days : [1]
  }
  return schedule
}

function nextRunAt(input, after = Date.now()) {
  const schedule = normalizeSchedule(input)
  if (schedule.kind === 'once') return schedule.onceAt > after ? schedule.onceAt : undefined
  if (schedule.kind === 'interval') return after + schedule.intervalMinutes * 60_000

  const candidate = new Date(after)
  candidate.setSeconds(0, 0)
  candidate.setHours(schedule.hour, schedule.minute, 0, 0)
  if (schedule.kind === 'daily') {
    if (candidate.getTime() <= after) candidate.setDate(candidate.getDate() + 1)
    return candidate.getTime()
  }

  for (let offset = 0; offset <= 7; offset += 1) {
    const date = new Date(candidate)
    date.setDate(candidate.getDate() + offset)
    if (!schedule.days.includes(date.getDay())) continue
    if (date.getTime() > after) return date.getTime()
  }
  return undefined
}

function normalizeHistory(input) {
  return (Array.isArray(input) ? input : []).filter((item) => item && typeof item.id === 'string').map((item) => ({
    id: item.id,
    scheduledAt: Number(item.scheduledAt) || Number(item.startedAt) || Date.now(),
    startedAt: Number(item.startedAt) || Date.now(),
    completedAt: Number(item.completedAt) || undefined,
    status: ['running', 'completed', 'error', 'aborted', 'budget_limited'].includes(item.status) ? item.status : 'error',
    runId: typeof item.runId === 'string' ? item.runId : undefined,
    sessionId: typeof item.sessionId === 'string' ? item.sessionId : undefined,
    message: typeof item.message === 'string' ? item.message.slice(0, 1000) : undefined,
  })).sort((left, right) => right.startedAt - left.startedAt).slice(0, MAX_HISTORY)
}

function normalizeAutomation(input, now = Date.now()) {
  if (!input || typeof input.id !== 'string' || typeof input.projectPath !== 'string') return undefined
  const schedule = normalizeSchedule(input.schedule)
  const enabled = Boolean(input.enabled)
  return {
    id: input.id,
    name: String(input.name || '未命名自动化').trim().slice(0, 120) || '未命名自动化',
    prompt: String(input.prompt || '').trim().slice(0, 20_000),
    projectPath: input.projectPath,
    providerId: typeof input.providerId === 'string' ? input.providerId : '',
    enabled,
    schedule,
    nextRunAt: enabled ? (Number(input.nextRunAt) > 0 ? Number(input.nextRunAt) : schedule.kind === 'once' ? schedule.onceAt : nextRunAt(schedule, now)) : undefined,
    lastRunAt: Number(input.lastRunAt) || undefined,
    lastStatus: typeof input.lastStatus === 'string' ? input.lastStatus : undefined,
    lastMessage: typeof input.lastMessage === 'string' ? input.lastMessage.slice(0, 1000) : undefined,
    runningRunId: typeof input.runningRunId === 'string' ? input.runningRunId : undefined,
    createdAt: Number(input.createdAt) || now,
    updatedAt: Number(input.updatedAt) || now,
    history: normalizeHistory(input.history),
  }
}

function normalizeAutomations(input, now = Date.now()) {
  return (Array.isArray(input) ? input : []).map((item) => normalizeAutomation(item, now)).filter(Boolean)
}

module.exports = { MAX_HISTORY, nextRunAt, normalizeAutomation, normalizeAutomations, normalizeSchedule }
