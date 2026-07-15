import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { normalizeAccessMode, permissionForAccessMode } = require('./access-mode.cjs')

describe('Agent access modes', () => {
  it('normalizes the four execution modes and migrates standard mode', () => {
    expect(normalizeAccessMode(undefined)).toBe('auto')
    expect(normalizeAccessMode('unexpected')).toBe('auto')
    expect(normalizeAccessMode('standard')).toBe('auto')
    expect(normalizeAccessMode('confirm')).toBe('confirm')
    expect(normalizeAccessMode('plan')).toBe('plan')
    expect(normalizeAccessMode('full')).toBe('full')
  })

  it('allows all OpenCode permissions in full control mode', () => {
    expect(permissionForAccessMode('full')).toEqual({ '*': 'allow' })
  })

  it('asks before sensitive files and destructive commands in automatic edit mode', () => {
    expect(permissionForAccessMode('auto')).toMatchObject({
      external_directory: 'ask',
      read: { '*.env': 'ask' },
      bash: { 'rm *': 'ask', 'sudo *': 'ask', 'git push *': 'ask' },
    })
  })

  it('requires confirmation for edits and prevents edits in plan mode', () => {
    expect(permissionForAccessMode('confirm').edit).toBe('ask')
    expect(permissionForAccessMode('confirm').bash['*']).toBe('ask')
    expect(permissionForAccessMode('plan').edit).toBe('deny')
    expect(permissionForAccessMode('plan').bash['*']).toBe('deny')
  })
})
