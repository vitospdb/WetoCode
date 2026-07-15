import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wetocode-background-ui-'))
const userData = path.join(temporaryRoot, 'user-data')
const projectPath = path.join(temporaryRoot, 'project')
const port = 10100 + Math.floor(Math.random() * 400)
await fs.mkdir(userData, { recursive: true })
await fs.mkdir(projectPath)
await fs.writeFile(path.join(projectPath, 'README.md'), '# Background task smoke test\n')
await fs.writeFile(path.join(userData, 'settings.json'), JSON.stringify({
  recentProjects: [projectPath], accessMode: 'standard',
  appearance: { theme: 'light', density: 'comfortable', zoom: 1, sidebarOpen: true },
}, null, 2))

const electron = path.join(root, 'node_modules', 'electron', 'dist', 'electron')
const child = spawn(electron, [`--remote-debugging-port=${port}`, `--user-data-dir=${userData}`, '--no-sandbox', '.'], {
  cwd: root,
  env: {
    ...process.env,
    DISPLAY: process.env.DISPLAY || ':0',
    OPENCODE_BIN: path.join(root, 'node_modules', 'opencode-ai', 'bin', 'opencode.exe'),
  },
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
    async command(method, params = {}) {
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

async function until(client, expression, label, timeout = 60_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  const state = await client.evaluate(`(async () => ({
    hidden: document.hidden,
    tasks: await window.wetocode.listAgentTasks(),
    text: document.body.innerText.slice(-2000),
  }))()`)
  throw new Error(`Timed out waiting for ${label}. State: ${JSON.stringify(state)}\n${logs}`)
}

let client
try {
  console.log('[background-smoke] waiting for renderer')
  client = cdp(await debuggerUrl())
  await until(client, `Boolean(document.querySelector('.composer textarea'))`, 'composer', 20_000)
  console.log('[background-smoke] starting delayed task')
  const prompt = '请使用 bash 执行 node -e "setTimeout(() => console.log(\'BACKGROUND_WORK_DONE\'), 4000)"，等待命令完成后只回复 BACKGROUND_AGENT_OK。'
  await client.evaluate(`(() => {
    const field = document.querySelector('.composer textarea')
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    set.call(field, ${JSON.stringify(prompt)})
    field.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await until(client, `!document.querySelector('.send-btn').disabled`, 'enabled send button', 5_000)
  await client.evaluate(`document.querySelector('.send-btn').click()`)
  await until(client, `(async () => (await window.wetocode.listAgentTasks()).some((task) => task.status === 'running'))()`, 'running background task', 30_000)
  console.log('[background-smoke] closing active window')
  await client.evaluate(`setTimeout(() => window.close(), 50); true`)
  client.close()
  client = undefined
  await new Promise((resolve) => setTimeout(resolve, 1000))
  if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Electron exited while a task was active. ${logs}`)
  console.log('[background-smoke] task is running while hidden')
  await new Promise((resolve) => setTimeout(resolve, 20_000))
  if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Electron exited after background completion. ${logs}`)
  console.log('[background-smoke] reopening window')
  const secondInstance = spawn(electron, [`--user-data-dir=${userData}`, '--no-sandbox', '.'], {
    cwd: root,
    env: {
      ...process.env,
      DISPLAY: process.env.DISPLAY || ':0',
      OPENCODE_BIN: path.join(root, 'node_modules', 'opencode-ai', 'bin', 'opencode.exe'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise((resolve) => secondInstance.once('exit', resolve))
  client = cdp(await debuggerUrl())
  await until(client, `!document.hidden`, 'reopened resident window', 5_000)
  await until(client, `(async () => (await window.wetocode.listAgentTasks()).some((task) => task.status === 'completed'))()`, 'background task completion', 30_000)
  await client.evaluate(`document.querySelector('button[title="后台任务"]').click()`)
  await until(client, `document.querySelector('.task-card.completed')?.innerText.includes('已完成')`, 'completed task center record', 5_000)
  if (process.env.WETOCODE_BACKGROUND_SCREENSHOT_PATH) {
    const screenshot = await client.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await fs.writeFile(process.env.WETOCODE_BACKGROUND_SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'))
  }
  await client.evaluate(`document.querySelector('.task-card.completed .task-main').click()`)
  await until(client, `document.body.innerText.includes('BACKGROUND_AGENT_OK')`, 'restored final response', 15_000)
  console.log(JSON.stringify({ ok: true, hiddenWhileRunning: true, processStayedAlive: true, reopened: true, resultRecovered: 'BACKGROUND_AGENT_OK' }, null, 2))
} finally {
  client?.close()
  child.kill('SIGTERM')
  await new Promise((resolve) => setTimeout(resolve, 500))
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  await fs.rm(temporaryRoot, { recursive: true, force: true })
}
