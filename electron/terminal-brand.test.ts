import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { brandTerminalOutput, createTerminalBrandFilter } = require('./terminal-brand.cjs')

describe('terminal branding', () => {
  it('brands upstream names without changing terminal cell width', () => {
    const branded = brandTerminalOutput('OpenCode opencode OPENCODE')
    expect(branded).toBe('WetoCode WetoCode WetoCode')
    expect(branded.length).toBe('OpenCode opencode OPENCODE'.length)
  })

  it('replaces inherited terminal titles including Cursor titles', () => {
    expect(brandTerminalOutput('\x1b]0;Cursor 219\x07ready\x1b]2;OpenCode\x1b\\'))
      .toBe('\x1b]0;WetoCode\x07ready\x1b]0;WetoCode\x07')
  })

  it('handles upstream names and title sequences split across PTY frames', () => {
    const filter = createTerminalBrandFilter()
    expect(filter.write('Open')).toBe('')
    expect(filter.write('Code \x1b]0;Cursor')).toBe('WetoCode ')
    expect(filter.write(' 219\x07ready')).toBe('\x1b]0;WetoCode\x07ready')
    expect(filter.flush()).toBe('')
  })
})
