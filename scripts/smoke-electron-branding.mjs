import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wetocode-branding-ui-'))
const userData = path.join(temporaryRoot, 'user-data')
const projectPath = path.join(temporaryRoot, 'project')
const port = 9960 + Math.floor(Math.random() * 30)
await fs.mkdir(userData, { recursive: true })
await fs.mkdir(projectPath)
await fs.writeFile(path.join(userData, 'settings.json'), JSON.stringify({
  recentProjects: [projectPath],
  accessMode: 'auto',
  appearance: { theme: 'light', density: 'comfortable', zoom: 1, sidebarOpen: true },
}, null, 2))

const binary = process.env.WETOCODE_PACKAGED_BINARY
if (!binary) throw new Error('WETOCODE_PACKAGED_BINARY is required.')
const child = spawn(binary, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userData}`,
  '--no-sandbox',
], { cwd: projectPath, stdio: ['ignore', 'pipe', 'pipe'] })
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

async function until(client, expression, label, timeout = 20_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Timed out waiting for ${label}. ${logs}`)
}

let client
try {
  client = cdp(await debuggerUrl())
  await until(client, `Boolean(document.querySelector('.app-shell'))`, 'application bootstrap')
  const initial = await client.evaluate(`({
    brand: document.querySelector('.brand span')?.textContent,
    brandFits: document.querySelector('.brand span')?.scrollWidth <= document.querySelector('.brand span')?.clientWidth,
    welcome: document.querySelector('.welcome')?.innerText,
    body: document.body.innerText,
  })`)
  if (initial.brand !== '中文桌面 Coding Agent') throw new Error(`Unexpected brand subtitle: ${initial.brand}`)
  if (!initial.brandFits) throw new Error('Brand subtitle overflows its container.')
  if (!initial.welcome?.includes('更符合中国开发者使用习惯')) throw new Error('Welcome positioning is missing.')
  if (initial.body.includes('银行业')) throw new Error('Legacy industry label is still visible.')
  await client.evaluate(`[...document.querySelectorAll('.header-actions button')].find((button) => button.title === '上下文状态').click()`)
  await until(client, `document.body.innerText.includes('项目安全规则')`, 'project safety rules')
  const finalBody = await client.evaluate(`document.body.innerText`)
  if (finalBody.includes('银行业')) throw new Error('Legacy industry label is visible in context panel.')
  console.log(JSON.stringify({ ok: true, brand: initial.brand, brandFits: true, positioning: true, projectSafetyRules: true, legacyIndustryLabel: false }, null, 2))
} finally {
  client?.close()
  child.kill('SIGTERM')
  await new Promise((resolve) => setTimeout(resolve, 500))
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  await fs.rm(temporaryRoot, { recursive: true, force: true })
}
