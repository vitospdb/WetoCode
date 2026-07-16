function normalizeTerminalMode(value) {
  return value === 'shell' ? 'shell' : 'cli'
}

function terminalPtyInput({ mode, binary, serviceUrl, projectPath }) {
  const normalizedMode = normalizeTerminalMode(mode)
  if (normalizedMode === 'shell') return { cwd: projectPath, title: 'Shell' }
  return {
    cwd: projectPath,
    title: 'WetoCode CLI',
    command: binary,
    args: ['attach', serviceUrl, '--dir', projectPath, '--mini'],
    env: { TERM: 'xterm-256color', COLORTERM: 'truecolor' },
  }
}

module.exports = { normalizeTerminalMode, terminalPtyInput }
