function changeKind(indexStatus, worktreeStatus) {
  const statuses = `${indexStatus}${worktreeStatus}`
  if (statuses === '??' || statuses.includes('A')) return 'added'
  if (statuses.includes('D')) return 'deleted'
  if (statuses.includes('R')) return 'renamed'
  if (statuses.includes('C')) return 'copied'
  if (statuses.includes('U') || ['DD', 'AA'].includes(statuses)) return 'conflict'
  return 'modified'
}

function parseGitStatus(output) {
  const entries = String(output || '').split('\0')
  const changes = []
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (!entry || entry.length < 4) continue
    const indexStatus = entry[0]
    const worktreeStatus = entry[1]
    const filePath = entry.slice(3)
    let originalPath
    if (['R', 'C'].includes(indexStatus) || ['R', 'C'].includes(worktreeStatus)) {
      originalPath = entries[index + 1] || undefined
      index += 1
    }
    changes.push({
      path: filePath,
      originalPath,
      indexStatus,
      worktreeStatus,
      kind: changeKind(indexStatus, worktreeStatus),
      staged: indexStatus !== ' ' && indexStatus !== '?',
    })
  }
  return changes
}

function countDiffLines(diff) {
  let additions = 0
  let deletions = 0
  for (const line of String(diff || '').split(/\r?\n/)) {
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) additions += 1
    if (line.startsWith('-')) deletions += 1
  }
  return { additions, deletions }
}

function isSafeRelativePath(filePath) {
  if (!filePath || typeof filePath !== 'string') return false
  const normalized = filePath.replaceAll('\\', '/')
  return !normalized.startsWith('/') && !normalized.split('/').includes('..') && !/^[a-zA-Z]:/.test(normalized)
}

module.exports = { countDiffLines, isSafeRelativePath, parseGitStatus }
