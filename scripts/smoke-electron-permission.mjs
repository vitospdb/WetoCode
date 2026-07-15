import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wetocode-electron-smoke-'))
const userData = path.join(temporaryRoot, 'user-data')
const projectPath = path.join(temporaryRoot, 'project')
const externalPath = path.join(temporaryRoot, 'outside.txt')
const port = 9320 + Math.floor(Math.random() * 500)
await fs.mkdir(userData, { recursive: true })
await fs.mkdir(projectPath)
await fs.writeFile(externalPath, 'WETOCODE_ELECTRON_PERMISSION_OK\n')
await fs.writeFile(path.join(userData, 'settings.json'), JSON.stringify({
  recentProjects: [projectPath],
  accessMode: 'standard',
  appearance: { theme: 'light', density: 'comfortable', zoom: 1, sidebarOpen: true },
}, null, 2))

const packagedBinary = process.env.WETOCODE_PACKAGED_BINARY
const electron = packagedBinary || path.join(root, 'node_modules', 'electron', 'dist', 'electron')
const child = spawn(electron, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userData}`,
  '--no-sandbox',
  ...(packagedBinary ? [] : ['.']),
], {
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

async function waitForDebugger(timeout = 20_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json())
      const page = pages.find((item) => item.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {
      // Electron is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Electron debugger did not start. ${logs}`)
}

function cdp(url) {
  const socket = new WebSocket(url)
  let sequence = 0
  const pending = new Map()
  socket.addEventListener('message', (message) => {
    const payload = JSON.parse(message.data)
    if (!payload.id || !pending.has(payload.id)) return
    const { resolve, reject } = pending.get(payload.id)
    pending.delete(payload.id)
    if (payload.error) reject(new Error(payload.error.message))
    else resolve(payload.result)
  })
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  return {
    async evaluate(expression) {
      await ready
      const id = ++sequence
      const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
      socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
      const result = await response
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
      return result.result.value
    },
    close() { socket.close() },
  }
}

async function until(client, expression, label, timeout = 60_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${label}. ${logs}`)
}

let client
try {
  client = cdp(await waitForDebugger())
  await until(client, `Boolean(document.querySelector('.app-shell') && document.querySelector('.composer textarea'))`, 'application bootstrap', 20_000)
  const prompt = `Read the exact contents of ${externalPath} and reply with only those contents.`
  await client.evaluate(`(() => {
    const field = document.querySelector('.composer textarea')
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(field, ${JSON.stringify(prompt)})
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  await until(client, `!document.querySelector('.send-btn').disabled`, 'enabled send button', 5_000)
  await client.evaluate(`document.querySelector('.send-btn').click()`)
  await until(client, `Boolean(document.querySelector('.permission-dialog'))`, 'permission dialog', 60_000)
  const dialogText = await client.evaluate(`document.querySelector('.permission-dialog').innerText`)
  if (!dialogText.includes('访问项目外目录') || !dialogText.includes(`${temporaryRoot}/*`)) {
    throw new Error(`Unexpected permission dialog: ${dialogText}`)
  }
  await client.evaluate(`[...document.querySelectorAll('.permission-dialog button')].find((button) => button.textContent.includes('允许一次')).click()`)
  await until(client, `document.querySelector('.message-list')?.innerText.includes('WETOCODE_ELECTRON_PERMISSION_OK')`, 'final agent response', 60_000)
  await until(client, `!document.querySelector('.composer').classList.contains('running')`, 'idle composer', 10_000)
  console.log(JSON.stringify({ ok: true, permissionDialog: true, finalResponse: 'WETOCODE_ELECTRON_PERMISSION_OK' }, null, 2))
} finally {
  client?.close()
  child.kill('SIGTERM')
  await new Promise((resolve) => setTimeout(resolve, 500))
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  await fs.rm(temporaryRoot, { recursive: true, force: true })
}
