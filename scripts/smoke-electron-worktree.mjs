import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wetocode-worktree-ui-'))
const userData = path.join(temporaryRoot, 'user-data')
const projectPath = path.join(temporaryRoot, 'project')
const port = 9960 + Math.floor(Math.random() * 30)
await fs.mkdir(userData, { recursive: true })
await fs.mkdir(projectPath)
execFileSync('git', ['init', '-b', 'main'], { cwd: projectPath })
execFileSync('git', ['config', 'user.name', 'WetoCode UI Smoke'], { cwd: projectPath })
execFileSync('git', ['config', 'user.email', 'ui-smoke@wetocode.local'], { cwd: projectPath })
await fs.writeFile(path.join(projectPath, 'README.md'), 'worktree ui smoke\n')
execFileSync('git', ['add', 'README.md'], { cwd: projectPath })
execFileSync('git', ['commit', '-m', 'initial'], { cwd: projectPath })
await fs.writeFile(path.join(userData, 'settings.json'), JSON.stringify({
  recentProjects: [projectPath],
  accessMode: 'standard',
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

async function until(client, expression, label, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Timed out waiting for ${label}. ${logs}`)
}

let client
let worktreePath
try {
  client = cdp(await debuggerUrl())
  await until(client, `document.querySelector('.worktree-button')?.textContent.includes('主工作区') && !document.querySelector('.worktree-button').disabled`, 'main workspace')
  await client.evaluate(`document.querySelector('.worktree-button').click()`)
  await until(client, `Boolean(document.querySelector('.worktree-create'))`, 'worktree menu')
  await client.evaluate(`document.querySelector('.worktree-create').click()`)
  await until(client, `Boolean(document.querySelector('.worktree-dialog input'))`, 'create dialog')
  await client.evaluate(`(() => { const input = document.querySelector('.worktree-dialog input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, 'feature-ui'); input.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
  await until(client, `!document.querySelector('.worktree-dialog .solid-button').disabled`, 'create button')
  await client.evaluate(`document.querySelector('.worktree-dialog .solid-button').click()`)
  await until(client, `document.querySelector('.worktree-button')?.textContent.includes('feature-ui')`, 'created workspace', 40_000)
  const metadata = JSON.parse(await fs.readFile(path.join(userData, 'worktrees.json'), 'utf8'))
  worktreePath = metadata[0].directory
  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: worktreePath, encoding: 'utf8' }).trim()
  if (branch !== 'opencode/feature-ui') throw new Error(`Unexpected branch: ${branch}`)
  await fs.writeFile(path.join(worktreePath, 'dirty.txt'), 'dirty\n')
  await client.evaluate(`document.querySelector('.worktree-button').click()`)
  await until(client, `document.querySelector('.worktree-menu')?.innerText.includes('有变更')`, 'dirty workspace state')
  const deleteDisabled = await client.evaluate(`document.querySelector('.worktree-menu-row:not(:first-child) button[title="删除隔离工作区"]')?.disabled`)
  if (!deleteDisabled) throw new Error('Dirty worktree delete button must be disabled.')
  await client.evaluate(`document.querySelector('.worktree-menu-row:not(:first-child) button[title="重置隔离工作区"]').click()`)
  await until(client, `document.querySelector('.worktree-dialog')?.innerText.includes('永久重置')`, 'reset dialog')
  await client.evaluate(`document.querySelector('.worktree-dialog .danger-button').click()`)
  await until(client, `!document.querySelector('.worktree-dialog')`, 'reset completion', 40_000)
  if (await fs.stat(path.join(worktreePath, 'dirty.txt')).then(() => true).catch(() => false)) throw new Error('Reset did not remove dirty file.')
  await client.evaluate(`document.querySelector('.worktree-button').click()`)
  await until(client, `Boolean(document.querySelector('.worktree-menu'))`, 'clean worktree menu')
  await client.evaluate(`document.querySelector('.worktree-menu-row:not(:first-child) button[title="删除隔离工作区"]').click()`)
  await until(client, `document.querySelector('.worktree-dialog')?.innerText.includes('删除工作区')`, 'remove dialog')
  await client.evaluate(`document.querySelector('.worktree-dialog .danger-button').click()`)
  await until(client, `document.querySelector('.worktree-button')?.textContent.includes('主工作区')`, 'return to primary', 40_000)
  if (await fs.stat(worktreePath).then(() => true).catch(() => false)) throw new Error('Worktree directory still exists after removal.')
  console.log(JSON.stringify({ ok: true, created: true, switched: true, dirtyDeleteBlocked: true, reset: true, removed: true }, null, 2))
} finally {
  client?.close()
  child.kill('SIGTERM')
  await new Promise((resolve) => setTimeout(resolve, 500))
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  if (worktreePath) {
    try { execFileSync('git', ['worktree', 'remove', '--force', worktreePath], { cwd: projectPath, stdio: 'ignore' }) } catch {}
  }
  await fs.rm(temporaryRoot, { recursive: true, force: true })
}
