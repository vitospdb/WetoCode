const path = require('node:path')

const ALLOWED_COMMANDS = new Set([
  'npm', 'pnpm', 'yarn', 'bun', 'npx', 'vite', 'node', 'deno',
  'python', 'python3', 'py', 'php', 'ruby', 'dotnet', 'cargo', 'go',
])

function parsePreviewCommand(input, platform = process.platform) {
  const source = String(input || '').trim()
  if (!source || source.length > 500 || /[\r\n\0;&|<>`^%!()]/.test(source) || source.includes('$(') || (platform === 'win32' && /["']/.test(source))) {
    throw new Error('开发服务器命令无效或包含 shell 控制符。')
  }
  const tokens = source.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s]+/g) || []
  const values = tokens.map((token) => {
    const quoted = (token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))
    return quoted ? token.slice(1, -1).replace(/\\([\\"'])/g, '$1') : token
  })
  const commandPath = platform === 'win32' ? path.win32 : path.posix
  const commandToken = values[0] || ''
  const commandName = commandPath.basename(commandToken)
  if (commandName !== commandToken) throw new Error('开发服务器命令必须通过系统 PATH 查找。')
  const base = commandName.toLowerCase().replace(/\.(cmd|exe)$/i, '')
  if (!ALLOWED_COMMANDS.has(base)) throw new Error('仅允许常见的本地开发服务器命令。')
  const executable = platform === 'win32' && ['npm', 'pnpm', 'yarn', 'bun', 'npx', 'vite'].includes(base) ? `${base}.cmd` : commandName
  if (platform !== 'win32' || !executable.toLowerCase().endsWith('.cmd')) return { command: executable, args: values.slice(1) }
  return { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', [executable, ...values.slice(1)].join(' ')] }
}

function loopbackPreviewUrl(input) {
  let url
  try { url = new URL(String(input || '').trim()) } catch { throw new Error('预览地址必须是有效的 HTTP(S) URL。') }
  const host = url.hostname.toLowerCase()
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].includes(host) || url.username || url.password) {
    throw new Error('预览只允许连接本机回环地址。')
  }
  if (host === '0.0.0.0' || host === '::1' || host === '[::1]') url.hostname = '127.0.0.1'
  return url.toString()
}

function urlFromOutput(input) {
  const matches = String(input || '').match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)(?::\d{1,5})?(?:\/[^\s]*)?/gi) || []
  for (const match of matches) {
    try { return loopbackPreviewUrl(match.replace(/[),.;]+$/, '')) } catch {}
  }
  return undefined
}

function packagePreviewCommands(packageJson) {
  const scripts = packageJson && typeof packageJson.scripts === 'object' ? packageJson.scripts : {}
  const preferred = ['dev', 'start', 'serve', 'preview']
  const manager = packageJson?.packageManager?.startsWith('pnpm@') ? 'pnpm' : packageJson?.packageManager?.startsWith('yarn@') ? 'yarn' : packageJson?.packageManager?.startsWith('bun@') ? 'bun' : 'npm'
  return preferred.filter((name) => typeof scripts[name] === 'string').map((name) => ({
    name,
    command: manager === 'yarn' ? `yarn ${name}` : manager === 'bun' ? `bun run ${name}` : `${manager} run ${name}`,
    description: String(scripts[name]).slice(0, 200),
  }))
}

module.exports = { loopbackPreviewUrl, packagePreviewCommands, parsePreviewCommand, urlFromOutput }
