import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wetocode-preview-ui-'))
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
const debugPort = await freePort()
const previewPort = await freePort()
await fs.mkdir(userData, { recursive: true })
await fs.mkdir(projectPath)
await fs.writeFile(path.join(projectPath, 'package.json'), JSON.stringify({ scripts: { dev: 'node server.cjs' } }, null, 2))
await fs.writeFile(path.join(projectPath, 'server.cjs'), `const http = require('node:http')\nconst port = ${previewPort}\nhttp.createServer((_request, response) => { response.setHeader('content-type', 'text/html'); response.end('<h1>WETOCODE_PREVIEW_OK</h1>') }).listen(port, '127.0.0.1', () => console.log('Local: http://localhost:' + port + '/'))\n`)
await fs.writeFile(path.join(userData, 'settings.json'), JSON.stringify({
  recentProjects: [projectPath], appearance: { theme: 'light', density: 'comfortable', zoom: 1, sidebarOpen: true },
}, null, 2))

const electron = path.join(root, 'node_modules', 'electron', 'dist', 'electron')
const child = spawn(electron, [`--remote-debugging-port=${debugPort}`, `--user-data-dir=${userData}`, '--no-sandbox', '.'], {
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
      const pages = await fetch(`http://127.0.0.1:${debugPort}/json`).then((response) => response.json())
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
  const ready = new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
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
  await until(client, `Boolean(document.querySelector('.app-shell'))`, 'application bootstrap')
  const suggestions = await client.evaluate(`window.wetocode.getPreviewSuggestions(${JSON.stringify(projectPath)})`)
  if (!suggestions.some((item) => item.command === 'npm run dev')) throw new Error(`Preview command was not detected: ${JSON.stringify(suggestions)}`)
  await client.evaluate(`window.wetocode.startPreview(${JSON.stringify(projectPath)}, { command: 'npm run dev' })`)
  await until(client, `(async () => (await window.wetocode.getPreview(${JSON.stringify(projectPath)}))?.status === 'running')()`, 'preview server')
  const state = await client.evaluate(`window.wetocode.getPreview(${JSON.stringify(projectPath)})`)
  const html = await fetch(state.url).then((response) => response.text())
  if (!html.includes('WETOCODE_PREVIEW_OK') || !state.output.includes(`localhost:${previewPort}`)) throw new Error(`Preview did not serve expected content: ${JSON.stringify(state)}`)
  await client.evaluate(`window.wetocode.stopPreview(${JSON.stringify(projectPath)})`)
  await new Promise((resolve) => setTimeout(resolve, 500))
  let stopped = false
  try { await fetch(`http://127.0.0.1:${previewPort}/`, { signal: AbortSignal.timeout(1000) }) } catch { stopped = true }
  if (!stopped) throw new Error('Preview server still accepted requests after stop.')
  console.log(JSON.stringify({ ok: true, commandDetected: 'npm run dev', loopbackUrl: state.url, pageLoaded: true, logsCaptured: true, processStopped: true }, null, 2))
} finally {
  client?.close()
  child.kill('SIGTERM')
  await new Promise((resolve) => setTimeout(resolve, 500))
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  await fs.rm(temporaryRoot, { recursive: true, force: true })
}
