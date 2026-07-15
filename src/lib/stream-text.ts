export function mergeStreamText(current: string, incoming: string, mode: 'delta' | 'snapshot') {
  if (!incoming) return current
  if (mode === 'snapshot') {
    if (incoming === current || current.endsWith(incoming)) return current
    if (incoming.startsWith(current)) return incoming
    return incoming
  }
  if (current.endsWith(incoming)) return current
  return `${current}${incoming}`
}
