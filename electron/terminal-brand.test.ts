import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  TERMINAL_TRANSLATIONS,
  brandTerminalOutput,
  createTerminalBrandFilter,
  localizeTerminalText,
  terminalDisplayWidth,
} = require('./terminal-brand.cjs')

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

  it('localizes fixed TUI phrases without changing terminal display width', () => {
    for (const [source] of TERMINAL_TRANSLATIONS) {
      const localized = localizeTerminalText(source)
      expect(localized).not.toBe(source)
      expect(terminalDisplayWidth(localized)).toBe(terminalDisplayWidth(source))
    }
    expect(localizeTerminalText('System Help Cancel const value = 1')).toBe('System Help Cancel const value = 1')
  })

  it('localizes TUI phrases split across PTY frames', () => {
    const filter = createTerminalBrandFilter()
    expect(filter.write('Fix a TODO in')).toBe('')
    expect(filter.write(' the codebase\r\nShow command')).toContain('修复代码库中的 TODO')
    expect(filter.write(' palette')).toContain('显示命令面板')
    expect(filter.flush()).toBe('')
  })
})
