function normalizeSessionMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).flatMap(([id, item]) => {
    if (!id || !item || typeof item !== 'object' || Array.isArray(item)) return []
    const title = typeof item.title === 'string' ? item.title.trim().slice(0, 120) : ''
    const archivedAt = Number.isFinite(item.archivedAt) && item.archivedAt > 0 ? item.archivedAt : undefined
    return title || archivedAt ? [[id, { ...(title ? { title } : {}), ...(archivedAt ? { archivedAt } : {}) }]] : []
  }))
}

function updateSessionMetadata(metadata, sessionId, update) {
  const normalized = normalizeSessionMetadata(metadata)
  const current = normalized[sessionId] || {}
  const next = {
    ...current,
    ...(Object.hasOwn(update, 'title') ? { title: String(update.title || '').trim().slice(0, 120) } : {}),
    ...(Object.hasOwn(update, 'archivedAt') ? { archivedAt: update.archivedAt || undefined } : {}),
  }
  const compact = Object.fromEntries(Object.entries(next).filter(([, value]) => value !== '' && value !== undefined))
  if (Object.keys(compact).length) normalized[sessionId] = compact
  else delete normalized[sessionId]
  return normalized
}

function enrichSessions(sessions, metadata) {
  const normalized = normalizeSessionMetadata(metadata)
  return sessions.map((session) => {
    const item = normalized[session.id] || {}
    return {
      ...session,
      title: item.title || session.title,
      archived: Boolean(item.archivedAt),
      archivedAt: item.archivedAt,
    }
  })
}

module.exports = { enrichSessions, normalizeSessionMetadata, updateSessionMetadata }
