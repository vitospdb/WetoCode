import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { enrichSessions, normalizeSessionMetadata, updateSessionMetadata } = require('./session-metadata.cjs')

describe('session metadata', () => {
  it('normalizes unsafe or oversized metadata values', () => {
    expect(normalizeSessionMetadata({
      session1: { title: `  ${'a'.repeat(150)}  `, archivedAt: -1 },
      session2: null,
    })).toEqual({ session1: { title: 'a'.repeat(120) } })
  })

  it('persists rename and archive state without discarding prior metadata', () => {
    const renamed = updateSessionMetadata({}, 'session1', { title: '新的标题' })
    const archived = updateSessionMetadata(renamed, 'session1', { archivedAt: 1234 })
    expect(archived).toEqual({ session1: { title: '新的标题', archivedAt: 1234 } })
  })

  it('enriches engine sessions while preserving engine fields', () => {
    expect(enrichSessions(
      [{ id: 'session1', title: '原始标题', directory: '/project', updated: 1 }],
      { session1: { title: '自定义标题', archivedAt: 1234 } },
    )).toEqual([{ id: 'session1', title: '自定义标题', directory: '/project', updated: 1, archived: true, archivedAt: 1234 }])
  })
})
