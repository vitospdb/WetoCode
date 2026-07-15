import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { loopbackPreviewUrl, packagePreviewCommands, parsePreviewCommand, urlFromOutput } = require('./preview-tools.cjs')

describe('preview tools', () => {
  it('parses supported commands without a shell', () => {
    expect(parsePreviewCommand('npm run dev -- --port 4173', 'win32')).toEqual({ command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', 'npm.cmd run dev -- --port 4173'] })
    expect(() => parsePreviewCommand('npm run dev && rm -rf .')).toThrow(/控制符/)
    expect(() => parsePreviewCommand('npm run %MALICIOUS%', 'win32')).toThrow(/控制符/)
    expect(() => parsePreviewCommand('npm run "dev server"', 'win32')).toThrow(/控制符/)
    expect(() => parsePreviewCommand('powershell script.ps1')).toThrow(/仅允许/)
    expect(() => parsePreviewCommand('/tmp/node server.js')).toThrow(/PATH/)
    expect(() => parsePreviewCommand('C:\\temp\\node.exe server.js', 'win32')).toThrow(/PATH/)
  })

  it('only accepts loopback preview URLs', () => {
    expect(loopbackPreviewUrl('http://0.0.0.0:5173/app')).toBe('http://127.0.0.1:5173/app')
    expect(() => loopbackPreviewUrl('https://example.com')).toThrow(/回环/)
    expect(urlFromOutput('Local: http://localhost:4173/')).toBe('http://localhost:4173/')
  })

  it('detects common package scripts and package managers', () => {
    expect(packagePreviewCommands({ packageManager: 'pnpm@10.0.0', scripts: { dev: 'vite', test: 'vitest' } })).toEqual([
      { name: 'dev', command: 'pnpm run dev', description: 'vite' },
    ])
  })
})
