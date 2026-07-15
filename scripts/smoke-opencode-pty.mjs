import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createOpencodeClient } from '@opencode-ai/sdk/v2/client'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const binary = process.env.OPENCODE_BIN || path.join(root, 'node_modules', 'opencode-ai', 'bin', 'opencode.exe')
const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'wetocode-pty-smoke-'))
const server = spawn(binary, ['serve', '--hostname=127.0.0.1', '--port=0'], {
  cwd: projectPath,
  env: { ...process.env, NO_COLOR: '1', OPENCODE_CONFIG_CONTENT: JSON.stringify({ autoupdate: false }) },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverOutput = ''
server.stderr.on('data', (chunk) => { serverOutput += chunk.toString() })

function serverUrl() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server startup timed out. ${serverOutput}`)), 15_000)
    server.stdout.on('data', (chunk) => {
      serverOutput += chunk.toString()
      const match = serverOutput.match(/opencode server listening on (https?:\/\/\S+)/)
      if (!match) return
      clearTimeout(timer)
      resolve(match[1])
    })
    server.once('error', reject)
  })
}

function dataOf(result) {
  if (result?.error) throw new Error(JSON.stringify(result.error))
  return result?.data ?? result
}

let socket
let pty
try {
  const url = await serverUrl()
  const client = createOpencodeClient({ baseUrl: url, directory: projectPath })
  pty = dataOf(await client.pty.create({ cwd: projectPath, title: 'WetoCode PTY smoke' }))
  const token = dataOf(await client.pty.connectToken({ ptyID: pty.id }, { headers: { 'x-opencode-ticket': '1' } }))
  const websocketUrl = new URL(`/pty/${encodeURIComponent(pty.id)}/connect`, url)
  websocketUrl.protocol = websocketUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  websocketUrl.searchParams.set('directory', projectPath)
  websocketUrl.searchParams.set('ticket', token.ticket)
  socket = new WebSocket(websocketUrl, { headers: { Origin: url } })

  let output = ''
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`PTY output timed out: ${JSON.stringify(output)}`)), 15_000)
    socket.addEventListener('open', () => socket.send("printf 'WETOCODE_PTY_OK\\n'\r"))
    socket.addEventListener('message', async (event) => {
      const text = typeof event.data === 'string' ? event.data : Buffer.from(await event.data.arrayBuffer()).toString()
      output += text
      if (!output.includes('WETOCODE_PTY_OK')) return
      clearTimeout(timer)
      resolve()
    })
    socket.addEventListener('error', reject)
  })
  console.log(JSON.stringify({ ok: true, pty: { id: pty.id, command: pty.command, cwd: pty.cwd }, output: 'WETOCODE_PTY_OK' }, null, 2))
  dataOf(await client.pty.remove({ ptyID: pty.id }))
} finally {
  socket?.close()
  server.kill('SIGTERM')
  await fs.rm(projectPath, { recursive: true, force: true })
}
