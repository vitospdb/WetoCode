import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { normalizeTerminalMode, terminalPtyInput } = require('./terminal-tools.cjs')

function decodePowerShellCommand(args: string[]) {
  return Buffer.from(args.at(-1), 'base64').toString('utf16le')
}

describe('integrated terminal modes', () => {
  it('defaults to the branded WetoCode CLI connected to the local service', () => {
    expect(normalizeTerminalMode(undefined)).toBe('cli')
    const input = terminalPtyInput({
      runtime: 'C:\\WetoCode\\WetoCode.exe',
      cliScript: 'C:\\WetoCode\\resources\\app.asar\\electron\\wetocode-cli.mjs',
      serviceUrl: 'http://127.0.0.1:4096',
      projectPath: 'D:\\project',
      provider: { id: 'wetocode-free', providerId: 'opencode', model: 'mimo-v2.5-free', name: '公共免费模型' },
      version: '0.2.5',
      platform: 'win32',
    })
    expect(input).toMatchObject({
      cwd: 'D:\\project',
      title: 'WetoCode CLI',
      command: 'powershell.exe',
      env: { TERM: 'xterm-256color', COLORTERM: 'truecolor', ELECTRON_RUN_AS_NODE: '1' },
    })
    expect(input.args.slice(0, -1)).toEqual([
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand',
    ])
    expect(decodePowerShellCommand(input.args)).toBe(
      "$env:ELECTRON_RUN_AS_NODE='1'; & 'C:\\WetoCode\\WetoCode.exe' 'C:\\WetoCode\\resources\\app.asar\\electron\\wetocode-cli.mjs' '--service-url' 'http://127.0.0.1:4096' '--project' 'D:\\project' '--provider' 'opencode' '--model' 'mimo-v2.5-free' '--provider-name' '公共免费模型' '--version' '0.2.5' '--public-free' 'true'; exit $LASTEXITCODE",
    )
  })

  it('launches the bundled Node runtime directly on Unix', () => {
    expect(terminalPtyInput({
      runtime: '/opt/WetoCode/wetocode',
      cliScript: '/opt/WetoCode/resources/app.asar/electron/wetocode-cli.mjs',
      serviceUrl: 'http://127.0.0.1:4096',
      projectPath: '/project',
      provider: { id: 'custom', providerId: 'openai', model: 'gpt', name: "开发者's 模型" },
      version: '0.2.5',
      platform: 'linux',
    })).toMatchObject({
      command: '/opt/WetoCode/wetocode',
      args: expect.arrayContaining(['--provider-name', "开发者's 模型"]),
    })
  })

  it('keeps a plain project shell available as a secondary mode', () => {
    expect(terminalPtyInput({ mode: 'shell', projectPath: '/project' }))
      .toEqual({ cwd: '/project', title: 'Shell' })
  })
})
