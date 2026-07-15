import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { countDiffLines, isSafeRelativePath, parseGitStatus } = require('./git-tools.cjs')

describe('git tools', () => {
  it('parses modified, untracked and renamed porcelain entries', () => {
    expect(parseGitStatus(' M src/app.ts\0?? notes.txt\0R  new.ts\0old.ts\0')).toEqual([
      expect.objectContaining({ path: 'src/app.ts', kind: 'modified', staged: false }),
      expect.objectContaining({ path: 'notes.txt', kind: 'added', staged: false }),
      expect.objectContaining({ path: 'new.ts', originalPath: 'old.ts', kind: 'renamed', staged: true }),
    ])
  })

  it('counts only content lines in a unified diff', () => {
    expect(countDiffLines('--- a/a\n+++ b/a\n@@ -1 +1,2 @@\n-old\n+new\n+line')).toEqual({ additions: 2, deletions: 1 })
  })

  it('rejects absolute paths and traversal', () => {
    expect(isSafeRelativePath('src/app.ts')).toBe(true)
    expect(isSafeRelativePath('../secret')).toBe(false)
    expect(isSafeRelativePath('C:\\secret')).toBe(false)
    expect(isSafeRelativePath('/etc/passwd')).toBe(false)
  })
})
