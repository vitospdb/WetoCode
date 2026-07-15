import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wetocode-attachment-ui-'))
const userData = path.join(temporaryRoot, 'user-data')
const projectPath = path.join(temporaryRoot, 'project')
const port = 9990 + Math.floor(Math.random() * 8)
await fs.mkdir(userData, { recursive: true })
await fs.mkdir(projectPath)
await fs.writeFile(path.join(userData, 'settings.json'), JSON.stringify({
  recentProjects: [projectPath], accessMode: 'standard',
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

async function until(client, expression, label, timeout = 45_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  const ui = await client.evaluate(`({ assistant: [...document.querySelectorAll('.message.assistant')].map((item) => item.innerText), running: document.querySelector('.composer')?.classList.contains('running') })`)
  throw new Error(`Timed out waiting for ${label}. UI: ${JSON.stringify(ui)}\n${logs}`)
}

let client
try {
  client = cdp(await debuggerUrl())
  await until(client, `Boolean(document.querySelector('.composer textarea'))`, 'composer')
  await client.evaluate(`(() => {
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAE0lEQVR4nGP4z8DwHwwZGP6DAQBJyAn3FGMynQAAAABJRU5ErkJggg=='), (char) => char.charCodeAt(0))
    const file = new File([png], 'pasted-red.png', { type: 'image/png' })
    const transfer = new DataTransfer(); transfer.items.add(file)
    document.querySelector('.composer textarea').dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }))
    return true
  })()`)
  await until(client, `document.querySelector('.attachment-chip')?.innerText.includes('pasted-red.png')`, 'attachment chip')
  await client.evaluate(`(() => { const field = document.querySelector('.composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(field, '请确认已收到附件，并只回复 ATTACHMENT_RECEIVED'); field.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
  await until(client, `!document.querySelector('.send-btn').disabled`, 'send button')
  await client.evaluate(`document.querySelector('.send-btn').click()`)
  await until(client, `Boolean(document.querySelector('.message-attachments img[alt="pasted-red.png"]'))`, 'message attachment')
  await until(client, `!document.querySelector('.composer').classList.contains('running')`, 'agent completion', 90_000)
  await until(client, `[...document.querySelectorAll('.message.assistant .markdown')].some((item) => item.innerText.trim() === 'ATTACHMENT_RECEIVED')`, 'agent attachment acknowledgement', 10_000)
  let exported
  const exportDeadline = Date.now() + 15_000
  while (Date.now() < exportDeadline) {
    exported = await client.evaluate(`(async () => { const sessions = await window.wetocode.listSessions(${JSON.stringify(projectPath)}); return { sessions, exported: sessions[0] ? await window.wetocode.getSession(sessions[0].id, ${JSON.stringify(projectPath)}) : null } })()`)
    if (exported?.exported?.messages?.length) break
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  const filePart = exported?.exported?.messages?.flatMap((message) => message.parts || []).find((part) => part.type === 'file')
  if (!filePart || filePart.mime !== 'image/png' || filePart.filename !== 'pasted-red.png') {
    throw new Error(`OpenCode session is missing the native image file part: ${JSON.stringify({ filePart, sessions: exported?.sessions, messages: exported?.exported?.messages })}\nElectron logs:\n${logs}`)
  }
  console.log(JSON.stringify({ ok: true, paste: true, preview: true, sent: true, sessionFilePart: { mime: filePart.mime, filename: filePart.filename } }, null, 2))
} finally {
  client?.close()
  child.kill('SIGTERM')
  await new Promise((resolve) => setTimeout(resolve, 500))
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  await fs.rm(temporaryRoot, { recursive: true, force: true })
}
