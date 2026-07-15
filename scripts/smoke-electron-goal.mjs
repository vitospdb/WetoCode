import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wetocode-goal-ui-'))
const userData = path.join(temporaryRoot, 'user-data')
const projectPath = path.join(temporaryRoot, 'project')
const port = 10600 + Math.floor(Math.random() * 300)
await fs.mkdir(userData, { recursive: true })
await fs.mkdir(projectPath)
await fs.writeFile(path.join(projectPath, 'README.md'), '# Goal smoke\n')
await fs.writeFile(path.join(userData, 'settings.json'), JSON.stringify({
  recentProjects: [projectPath], accessMode: 'plan', reasoningEffort: 'off',
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
  const state = await client.evaluate(`(async () => ({ tasks: await window.wetocode.listAgentTasks(), text: document.body.innerText.slice(-1500) }))()`)
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(state)}\n${logs}`)
}

let client
try {
  client = cdp(await debuggerUrl())
  await until(client, `Boolean(document.querySelector('.composer textarea'))`, 'composer', 20_000)
  const started = await client.evaluate(`window.wetocode.runAgent({
    clientRunId: crypto.randomUUID(),
    prompt: '请创建 GOAL_SHOULD_NOT_EXIST.txt 并写入 done。',
    projectPath: ${JSON.stringify(projectPath)},
    providerId: 'wetocode-free',
    goalObjective: '必须创建 GOAL_SHOULD_NOT_EXIST.txt 并写入 done。',
    goalLimits: { maxIterations: 1, maxMinutes: 10, maxTokens: 200000 }
  })`)
  await until(client, `(async () => {
    const task = (await window.wetocode.listAgentTasks()).find((item) => item.runId === ${JSON.stringify(started.runId)})
    if (task?.permission) await window.wetocode.replyPermission(task.permission.id, 'once')
    return task?.status === 'budget_limited'
  })()`, 'goal budget stop')
  const result = await client.evaluate(`(async () => {
    const task = (await window.wetocode.listAgentTasks()).find((item) => item.runId === ${JSON.stringify(started.runId)})
    const goal = await window.wetocode.getGoal(task.sessionId, task.projectPath)
    const resumed = await window.wetocode.setGoalStatus(task.sessionId, task.projectPath, 'resume')
    const resumedTasks = await window.wetocode.listAgentTasks()
    return { task, goal, resumed, resumedTasks }
  })()`)
  if (result.goal.status !== 'budget_limited' || result.goal.timeline.length !== 1) throw new Error(`Unexpected goal result: ${JSON.stringify(result)}`)
  if (result.resumed.status !== 'active' || result.resumed.limits.maxIterations <= result.goal.limits.maxIterations) throw new Error(`Goal resume did not extend budget: ${JSON.stringify(result)}`)
  if (!result.resumedTasks.some((task) => task.sessionId === result.task.sessionId && (task.status === 'running' || task.status === 'waiting_permission'))) throw new Error(`Goal resume did not restart execution: ${JSON.stringify(result)}`)
  try { await fs.access(path.join(projectPath, 'GOAL_SHOULD_NOT_EXIST.txt')); throw new Error('Plan mode unexpectedly edited the project.') } catch (error) { if (error.code !== 'ENOENT') throw error }
  console.log(JSON.stringify({ ok: true, status: result.goal.status, verificationCount: result.goal.timeline.length, resumeExtendedBudget: true, resumeRestartedExecution: true, planModePreventedEdit: true }, null, 2))
} finally {
  client?.close()
  child.kill('SIGTERM')
  await new Promise((resolve) => setTimeout(resolve, 500))
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  await fs.rm(temporaryRoot, { recursive: true, force: true })
}
