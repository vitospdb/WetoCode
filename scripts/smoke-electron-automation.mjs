import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wetocode-automation-ui-'))
const userData = path.join(temporaryRoot, 'user-data')
const projectPath = path.join(temporaryRoot, 'project')
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    server.close(() => resolve(address.port))
  })
})
const port = await freePort()
await fs.mkdir(userData, { recursive: true })
await fs.mkdir(projectPath)
await fs.writeFile(path.join(projectPath, 'README.md'), '# Automation smoke\n')
await fs.writeFile(path.join(userData, 'settings.json'), JSON.stringify({
  recentProjects: [projectPath], accessMode: 'auto', reasoningEffort: 'off',
  appearance: { theme: 'light', density: 'comfortable', zoom: 1, sidebarOpen: true },
}, null, 2))

const electron = path.join(root, 'node_modules', 'electron', 'dist', 'electron')
const child = spawn(electron, [`--remote-debugging-port=${port}`, `--user-data-dir=${userData}`, '--no-sandbox', '.'], {
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

async function until(client, expression, label, timeout = 90_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  const state = await client.evaluate(`({ automations: await window.wetocode.listAutomations(), tasks: await window.wetocode.listAgentTasks() })`)
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(state)}\n${logs}`)
}

let client
try {
  client = cdp(await debuggerUrl())
  await until(client, `Boolean(document.querySelector('.app-shell'))`, 'application bootstrap', 20_000)
  const saved = await client.evaluate(`window.wetocode.saveAutomation({
    name: '自动化冒烟', prompt: '只回复 AUTOMATION_AGENT_OK。', projectPath: ${JSON.stringify(projectPath)},
    providerId: 'wetocode-free', enabled: true, schedule: { kind: 'daily', hour: 23, minute: 59 }
  })`)
  const automationId = saved[0]?.id
  if (!automationId) throw new Error(`Automation was not saved: ${JSON.stringify(saved)}`)
  const started = await client.evaluate(`window.wetocode.runAutomationNow(${JSON.stringify(automationId)})`)
  if (!started.result?.runId) throw new Error(`Automation did not start: ${JSON.stringify(started)}`)
  await until(client, `(async () => {
    const item = (await window.wetocode.listAutomations()).find((entry) => entry.id === ${JSON.stringify(automationId)})
    return item?.history?.[0]?.status === 'completed'
  })()`, 'automation completion')
  const state = await client.evaluate(`(async () => {
    const item = (await window.wetocode.listAutomations()).find((entry) => entry.id === ${JSON.stringify(automationId)})
    const session = await window.wetocode.getSession(item.history[0].sessionId, item.projectPath)
    return { item, session }
  })()`)
  const text = state.session.messages.flatMap((message) => message.parts.filter((part) => part.type === 'text').map((part) => part.text)).join('\n')
  if (!text.includes('AUTOMATION_AGENT_OK')) throw new Error(`Unexpected automation output: ${text}`)
  if (!state.item.nextRunAt || state.item.runningRunId) throw new Error(`Automation state was not finalized: ${JSON.stringify(state.item)}`)
  console.log(JSON.stringify({ ok: true, persisted: true, completed: true, resultRecovered: 'AUTOMATION_AGENT_OK', nextRunScheduled: true }, null, 2))
} finally {
  client?.close()
  child.kill('SIGTERM')
  await new Promise((resolve) => setTimeout(resolve, 500))
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  await fs.rm(temporaryRoot, { recursive: true, force: true })
}
