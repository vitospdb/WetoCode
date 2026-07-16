import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wetocode-terminal-ui-'))
const userData = path.join(temporaryRoot, 'user-data')
const projectPath = path.join(temporaryRoot, 'project')
const port = 9820 + Math.floor(Math.random() * 120)
await fs.mkdir(userData, { recursive: true })
await fs.mkdir(projectPath)
await fs.mkdir(path.join(userData, 'rules'), { recursive: true })
await fs.writeFile(path.join(userData, 'rules', 'bank-coding.md'), 'legacy industry rules\n')
await fs.writeFile(path.join(userData, 'settings.json'), JSON.stringify({
  recentProjects: [projectPath],
  accessMode: 'standard',
  appearance: { theme: 'light', density: 'comfortable', zoom: 1, sidebarOpen: true },
}, null, 2))

const binary = process.env.WETOCODE_PACKAGED_BINARY || path.join(root, 'node_modules', 'electron', 'dist', 'electron')
const child = spawn(binary, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userData}`,
  '--no-sandbox',
  ...(process.env.WETOCODE_PACKAGED_BINARY ? [] : ['.']),
], {
  cwd: root,
  env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0', OPENCODE_BIN: path.join(root, 'node_modules', 'opencode-ai', 'bin', 'opencode.exe') },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = ''
child.stdout.on('data', (chunk) => { logs += chunk.toString() })
child.stderr.on('data', (chunk) => { logs += chunk.toString() })

async function debuggerUrl() {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json())
      const page = pages.find((item) => item.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Electron debugger did not start. ${logs}`)
}

function cdp(url) {
  const socket = new WebSocket(url)
  let id = 0
  const pending = new Map()
  socket.addEventListener('message', (message) => {
    const payload = JSON.parse(message.data)
    const request = pending.get(payload.id)
    if (!request) return
    pending.delete(payload.id)
    payload.error ? request.reject(new Error(payload.error.message)) : request.resolve(payload.result)
  })
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  return {
    async send(method, params = {}) {
      await ready
      const requestId = ++id
      const response = new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }))
      socket.send(JSON.stringify({ id: requestId, method, params }))
      return response
    },
    async evaluate(expression) {
      await ready
      const requestId = ++id
      const response = new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }))
      socket.send(JSON.stringify({ id: requestId, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
      const result = await response
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
      return result.result.value
    },
    close: () => socket.close(),
  }
}

async function until(client, expression, label, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  const ui = await client.evaluate(`({
    toolbar: document.querySelector('.terminal-toolbar')?.innerText,
    toast: document.querySelector('.toast')?.innerText,
    pty: document.querySelector('.terminal-panel')?.dataset.ptyId,
  })`).catch(() => undefined)
  throw new Error(`Timed out waiting for ${label}. UI: ${JSON.stringify(ui)}. ${logs}`)
}

async function terminalText(client) {
  const tree = await client.send('Accessibility.getFullAXTree')
  return [
    tree.nodes.map((node) => node.name?.value || node.value?.value || '').join('\n'),
    await client.evaluate(`document.querySelector('.xterm-accessibility-tree')?.innerText || ''`),
  ].join('\n')
}

async function waitForTerminalText(client, marker, label, timeout = 90_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const value = await terminalText(client)
    if (value.includes(marker)) return value
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${label}. ${logs}`)
}

let client
try {
  client = cdp(await debuggerUrl())
  await until(client, `Boolean(document.querySelector('.app-shell'))`, 'application bootstrap')
  await client.evaluate(`[...document.querySelectorAll('.header-actions button')].find((button) => button.title === '打开终端').click()`)
  await until(client, `document.querySelector('.terminal-toolbar')?.innerText.includes('运行中')`, 'running terminal', 60_000)
  await until(client, `document.querySelector('.terminal-mode-switch button.active')?.textContent.includes('WetoCode CLI')`, 'embedded CLI mode', 10_000)
  const cliPtyId = await client.evaluate(`document.querySelector('.terminal-panel')?.dataset.ptyId`)
  await new Promise((resolve) => setTimeout(resolve, 2_000))
  const cliState = await client.evaluate(`({
    status: document.querySelector('.terminal-toolbar')?.innerText,
    text: document.querySelector('.xterm-accessibility-tree')?.innerText || '',
  })`)
  if (!cliState.status?.includes('运行中')) throw new Error(`WetoCode CLI exited during startup: ${JSON.stringify(cliState)}`)
  if (/open\s?code/i.test(cliState.text)) throw new Error(`Upstream branding is visible in WetoCode CLI: ${cliState.text}`)
  await until(client, `['修复代码库中的 TODO', '这个项目使用了哪些技术？', '修复失败的测试'].some((text) => document.querySelector('.xterm-accessibility-tree')?.innerText.includes(text))`, 'localized home prompt', 15_000)

  const imePrompt = '只回复 WETOCODE_IME_OK'
  await client.evaluate(`(async () => {
    const textarea = document.querySelector('.xterm-helper-textarea')
    if (!textarea) throw new Error('Missing xterm helper textarea')
    textarea.focus()
    textarea.dispatchEvent(new CompositionEvent('compositionstart', { data: '', bubbles: true }))
    textarea.value = ${JSON.stringify(imePrompt)}
    textarea.dispatchEvent(new CompositionEvent('compositionupdate', { data: ${JSON.stringify(imePrompt)}, bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    textarea.dispatchEvent(new CompositionEvent('compositionend', { data: ${JSON.stringify(imePrompt)}, bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 100))
  })()`)
  await client.evaluate(`window.wetocode.sendTerminalInput(${JSON.stringify(cliPtyId)}, '\\r')`)
  let cliText = await waitForTerminalText(client, 'WETOCODE_IME_OK', 'Chinese IME model response')
  if (/open\s?code/i.test(cliText)) throw new Error(`Upstream branding is visible in WetoCode CLI: ${cliText}`)

  await new Promise((resolve) => setTimeout(resolve, 1_000))
  await client.evaluate(`window.wetocode.writeClipboardText('只回复 WETOCODE_PASTE_OK')`)
  await client.evaluate(`(() => {
    const host = document.querySelector('.terminal-host')
    const bounds = host.getBoundingClientRect()
    host.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + 20,
      clientY: bounds.top + 20,
    }))
  })()`)
  await until(client, `[...document.querySelectorAll('.terminal-context-menu button')].map((button) => button.textContent).join(',') === '复制,粘贴'`, 'terminal context menu', 5_000)
  await client.evaluate(`[...document.querySelectorAll('.terminal-context-menu button')].find((button) => button.textContent === '粘贴').click()`)
  await new Promise((resolve) => setTimeout(resolve, 200))
  await client.evaluate(`window.wetocode.sendTerminalInput(${JSON.stringify(cliPtyId)}, '\\r')`)
  cliText = await waitForTerminalText(client, 'WETOCODE_PASTE_OK', 'clipboard paste model response')
  if (/open\s?code/i.test(cliText)) throw new Error(`Upstream branding is visible in WetoCode CLI: ${cliText}`)

  await client.evaluate(`[...document.querySelectorAll('.terminal-mode-switch button')].find((button) => button.textContent === 'Shell').click()`)
  await until(client, `document.querySelector('.terminal-mode-switch button.active')?.textContent === 'Shell' && document.querySelector('.terminal-toolbar')?.innerText.includes('运行中') && document.querySelector('.terminal-panel')?.dataset.ptyId && document.querySelector('.terminal-panel')?.dataset.ptyId !== ${JSON.stringify(cliPtyId)}`, 'shell mode', 30_000)
  const shellCommand = process.platform === 'win32'
    ? `Set-Content -Path terminal-ui-result.txt -Value 'WETOCODE_TERMINAL_UI_OK'\r`
    : `printf 'WETOCODE_TERMINAL_UI_OK\\n' | tee terminal-ui-result.txt\r`
  await client.evaluate(`window.wetocode.sendTerminalInput(document.querySelector('.terminal-panel').dataset.ptyId, ${JSON.stringify(shellCommand)})`)
  const resultDeadline = Date.now() + 20_000
  let resultFile = ''
  while (Date.now() < resultDeadline) {
    resultFile = await fs.readFile(path.join(projectPath, 'terminal-ui-result.txt'), 'utf8').catch(() => '')
    if (resultFile.includes('WETOCODE_TERMINAL_UI_OK')) break
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  if (!resultFile.includes('WETOCODE_TERMINAL_UI_OK')) {
    const debugText = await client.evaluate(`({ host: document.querySelector('.terminal-host')?.innerText, tree: document.querySelector('.xterm-accessibility-tree')?.innerText, pty: document.querySelector('.terminal-panel')?.dataset.ptyId })`)
    throw new Error(`Terminal command did not create the result file. UI: ${JSON.stringify(debugText)}. ${logs}`)
  }
  const outputDeadline = Date.now() + 20_000
  let terminalText = ''
  while (Date.now() < outputDeadline) {
    const tree = await client.send('Accessibility.getFullAXTree')
    terminalText = [
      tree.nodes.map((node) => node.name?.value || node.value?.value || '').join('\n'),
      await client.evaluate(`document.querySelector('.xterm-accessibility-tree')?.innerText || ''`),
    ].join('\n')
    if (terminalText.includes('WETOCODE_TERMINAL_UI_OK')) break
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  if (!terminalText.includes('WETOCODE_TERMINAL_UI_OK')) throw new Error(`Timed out waiting for terminal accessibility output. ${logs}`)
  const legacyRulesExist = await fs.access(path.join(userData, 'rules', 'bank-coding.md')).then(() => true).catch(() => false)
  const developmentRules = await fs.readFile(path.join(userData, 'rules', 'development-safety.md'), 'utf8').catch(() => '')
  if (legacyRulesExist || !developmentRules.includes('中国开发者使用习惯')) {
    throw new Error('Legacy rules were not migrated to the generic development safety rules.')
  }
  await client.evaluate(`[...document.querySelectorAll('.terminal-toolbar button')].find((button) => button.title === '关闭终端').click()`)
  await until(client, `!document.querySelector('.terminal-panel')`, 'terminal close', 5_000)
  console.log(JSON.stringify({ ok: true, terminalPanel: true, defaultMode: 'cli', localizedTui: true, chineseIme: 'WETOCODE_IME_OK', contextMenu: ['复制', '粘贴'], clipboardPaste: 'WETOCODE_PASTE_OK', upstreamBrandVisible: false, shellOutput: 'WETOCODE_TERMINAL_UI_OK', rulesMigration: true }, null, 2))
} finally {
  client?.close()
  child.kill('SIGTERM')
  await new Promise((resolve) => setTimeout(resolve, 500))
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  await fs.rm(temporaryRoot, { recursive: true, force: true })
}
