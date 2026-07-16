function normalizeTerminalMode(value) {
  return value === 'shell' ? 'shell' : 'cli'
}

function powershellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function windowsCliCommand(runtime, args) {
  const script = [
    "$env:ELECTRON_RUN_AS_NODE='1'",
    `& ${powershellLiteral(runtime)} ${args.map(powershellLiteral).join(' ')}`,
    'exit $LASTEXITCODE',
  ].join('; ')
  return {
    command: 'powershell.exe',
    args: [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64'),
    ],
  }
}

function terminalPtyInput({ mode, runtime, cliScript, serviceUrl, projectPath, provider, version, platform = process.platform }) {
  const normalizedMode = normalizeTerminalMode(mode)
  if (normalizedMode === 'shell') return { cwd: projectPath, title: 'Shell' }
  const args = [
    cliScript,
    '--service-url', serviceUrl,
    '--project', projectPath,
    '--provider', provider.providerId,
    '--model', provider.model,
    '--provider-name', provider.name,
    '--version', version,
    '--public-free', String(provider.id === 'wetocode-free'),
  ]
  const launch = platform === 'win32'
    ? windowsCliCommand(runtime, args)
    : { command: runtime, args }
  return {
    cwd: projectPath,
    title: 'WetoCode CLI',
    ...launch,
    env: { TERM: 'xterm-256color', COLORTERM: 'truecolor', ELECTRON_RUN_AS_NODE: '1' },
  }
}

module.exports = { normalizeTerminalMode, powershellLiteral, terminalPtyInput, windowsCliCommand }
