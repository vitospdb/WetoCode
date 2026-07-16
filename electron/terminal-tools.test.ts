import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { normalizeTerminalMode, terminalPtyInput } = require('./terminal-tools.cjs')

describe('integrated terminal modes', () => {
  it('starts the real attached TUI in WetoCode CLI mode', () => {
    expect(normalizeTerminalMode(undefined)).toBe('cli')
    expect(terminalPtyInput({
      binary: 'C:\\WetoCode\\resources\\bin\\opencode.exe',
      serviceUrl: 'http://127.0.0.1:4096',
      projectPath: 'D:\\project',
    })).toEqual({
      cwd: 'D:\\project',
      title: 'WetoCode CLI',
      command: 'C:\\WetoCode\\resources\\bin\\opencode.exe',
      args: ['attach', 'http://127.0.0.1:4096', '--dir', 'D:\\project', '--mini'],
      env: { TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    })
  })

  it('keeps a plain project shell available as a secondary mode', () => {
    expect(terminalPtyInput({ mode: 'shell', projectPath: '/project' }))
      .toEqual({ cwd: '/project', title: 'Shell' })
  })
})
