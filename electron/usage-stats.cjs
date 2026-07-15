function emptyUsage() {
  return { version: 2, days: {}, models: {}, dailyModels: {}, totals: { tokens: 0, messages: 0, toolCalls: 0, sessions: 0, completed: 0, failed: 0 } }
}

function nonNegative(value) {
  return Math.max(0, Number(value) || 0)
}

function normalizeUsage(value) {
  const source = value && typeof value === 'object' ? value : {}
  const result = emptyUsage()
  for (const [date, day] of Object.entries(source.days || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !day || typeof day !== 'object') continue
    result.days[date] = {
      tokens: nonNegative(day.tokens), messages: nonNegative(day.messages), toolCalls: nonNegative(day.toolCalls),
      sessions: nonNegative(day.sessions), completed: nonNegative(day.completed), failed: nonNegative(day.failed),
    }
  }
  for (const [model, stats] of Object.entries(source.models || {})) {
    if (!model || !stats || typeof stats !== 'object') continue
    result.models[model] = { tokens: nonNegative(stats.tokens), messages: nonNegative(stats.messages), toolCalls: nonNegative(stats.toolCalls) }
  }
  for (const [date, models] of Object.entries(source.dailyModels || {})) {
    if (!result.days[date] || !models || typeof models !== 'object') continue
    result.dailyModels[date] = {}
    for (const [model, stats] of Object.entries(models)) {
      if (!model || !stats || typeof stats !== 'object') continue
      result.dailyModels[date][model] = { tokens: nonNegative(stats.tokens), messages: nonNegative(stats.messages), toolCalls: nonNegative(stats.toolCalls) }
    }
  }
  result.totals = Object.values(result.days).reduce((totals, day) => {
    for (const key of Object.keys(totals)) totals[key] += day[key]
    return totals
  }, { ...result.totals })
  return result
}

function dateKey(timestamp = Date.now()) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function recordUsage(value, event) {
  const usage = normalizeUsage(value)
  const date = dateKey(event.at)
  const day = usage.days[date] || { tokens: 0, messages: 0, toolCalls: 0, sessions: 0, completed: 0, failed: 0 }
  const delta = {
    tokens: nonNegative(event.tokens), messages: nonNegative(event.messages), toolCalls: nonNegative(event.toolCalls),
    sessions: nonNegative(event.sessions), completed: nonNegative(event.completed), failed: nonNegative(event.failed),
  }
  for (const key of Object.keys(day)) day[key] += delta[key]
  usage.days[date] = day
  if (event.model) {
    const model = usage.models[event.model] || { tokens: 0, messages: 0, toolCalls: 0 }
    model.tokens += delta.tokens; model.messages += delta.messages; model.toolCalls += delta.toolCalls
    usage.models[event.model] = model
    const dailyModels = usage.dailyModels[date] || {}
    const dailyModel = dailyModels[event.model] || { tokens: 0, messages: 0, toolCalls: 0 }
    dailyModel.tokens += delta.tokens; dailyModel.messages += delta.messages; dailyModel.toolCalls += delta.toolCalls
    dailyModels[event.model] = dailyModel
    usage.dailyModels[date] = dailyModels
  }
  const retainedDates = Object.keys(usage.days).sort().slice(-400)
  return normalizeUsage({
    ...usage,
    days: Object.fromEntries(retainedDates.map((date) => [date, usage.days[date]])),
    dailyModels: Object.fromEntries(retainedDates.flatMap((date) => usage.dailyModels[date] ? [[date, usage.dailyModels[date]]] : [])),
  })
}

function usageSummary(value, range = '30d', now = Date.now()) {
  const usage = normalizeUsage(value)
  const days = Object.entries(usage.days).filter(([date]) => {
    if (range === 'all') return true
    const length = range === '7d' ? 7 : 30
    return new Date(`${date}T23:59:59`).getTime() >= now - length * 86400000
  })
  const totals = days.reduce((sum, [, day]) => {
    for (const key of Object.keys(sum)) sum[key] += day[key]
    return sum
  }, { tokens: 0, messages: 0, toolCalls: 0, sessions: 0, completed: 0, failed: 0 })
  const rangeModels = {}
  for (const [date] of days) {
    for (const [model, stats] of Object.entries(usage.dailyModels[date] || {})) {
      const current = rangeModels[model] || { tokens: 0, messages: 0, toolCalls: 0 }
      current.tokens += stats.tokens; current.messages += stats.messages; current.toolCalls += stats.toolCalls
      rangeModels[model] = current
    }
  }
  return {
    range,
    totals,
    activeDays: days.filter(([, day]) => day.messages || day.sessions).length,
    days: days.map(([date, day]) => ({ date, ...day })),
    models: Object.entries(rangeModels).map(([model, stats]) => ({ model, ...stats })).sort((left, right) => right.tokens - left.tokens),
  }
}

module.exports = { dateKey, emptyUsage, normalizeUsage, recordUsage, usageSummary }
