import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wetocode-onboarding-'))
const userData = path.join(temporaryRoot, 'user-data')
const port = 9900 + Math.floor(Math.random() * 50)
await fs.mkdir(userData, { recursive: true })

const binary = path.join(root, 'node_modules', 'electron', 'dist', 'electron')
const child = spawn(binary, [`--remote-debugging-port=${port}`, `--user-data-dir=${userData}`, '--no-sandbox', '.'], {
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
  throw new Error(`Timed out waiting for ${label}. ${logs}`)
}

let client
try {
  client = cdp(await debuggerUrl())
  await until(client, `document.querySelector('.onboarding-dialog')?.innerText.includes('检查电脑环境')`, 'Chinese first-run onboarding')
  await client.evaluate(`[...document.querySelectorAll('.doctor-start')].find((button) => button.textContent.includes('开始检查')).click()`)
  await until(client, `document.querySelectorAll('.doctor-list article').length >= 6`, 'environment doctor results', 30_000)
  const report = await client.evaluate(`document.querySelector('.doctor-list')?.innerText || ''`)
  if (!report.includes('Node.js') || !report.includes('模型服务配置')) throw new Error(`Environment doctor did not include required checks: ${report}`)
  console.log(JSON.stringify({ ok: true, onboarding: 'five-step-chinese', environmentDoctor: ['Node.js', '模型服务配置'] }, null, 2))
} finally {
  client?.close()
  child.kill('SIGTERM')
  await new Promise((resolve) => setTimeout(resolve, 500))
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  await fs.rm(temporaryRoot, { recursive: true, force: true })
}
