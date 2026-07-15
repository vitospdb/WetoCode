import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createOpencodeClient } from '@opencode-ai/sdk/v2/client'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const binary = process.env.OPENCODE_BIN || path.join(root, 'node_modules', 'opencode-ai', 'bin', 'opencode.exe')
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wetocode-server-smoke-'))
const projectPath = path.join(temporaryRoot, 'project')
const externalPath = path.join(temporaryRoot, 'outside.txt')
await fs.mkdir(projectPath)
await fs.writeFile(externalPath, 'WETOCODE_PERMISSION_SMOKE_OK\n')

const server = spawn(binary, ['serve', '--hostname=127.0.0.1', '--port=0'], {
  cwd: projectPath,
  env: {
    ...process.env,
    NO_COLOR: '1',
    OPENCODE_CONFIG_CONTENT: JSON.stringify({
      share: 'disabled',
      autoupdate: false,
      permission: {
        '*': 'allow',
        external_directory: 'ask',
      },
    }),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let stderr = ''
server.stderr.on('data', (chunk) => { stderr += chunk.toString() })

function serverUrl(timeout = 15_000) {
  return new Promise((resolve, reject) => {
    let stdout = ''
    const timer = setTimeout(() => reject(new Error(`Server startup timed out. ${stderr}`)), timeout)
    server.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
      const match = stdout.match(/opencode server listening on (https?:\/\/\S+)/)
      if (!match) return
      clearTimeout(timer)
      resolve(match[1])
    })
    server.once('error', reject)
    server.once('exit', (code) => reject(new Error(`Server exited before startup (${code}). ${stderr}`)))
  })
}

function dataOf(result) {
  if (result?.error) throw new Error(JSON.stringify(result.error))
  return result?.data ?? result
}

const controller = new AbortController()
let sessionId
let permissionSeen = false
let permissionReplied = false
let finalText = ''
const seenEvents = new Set()

try {
  const url = await serverUrl()
  const client = createOpencodeClient({ baseUrl: url, directory: projectPath })
  const subscription = await client.event.subscribe({}, { signal: controller.signal })

  const events = (async () => {
    for await (const event of subscription.stream) {
      if (!seenEvents.has(event.type)) {
        seenEvents.add(event.type)
        console.log(`event: ${event.type}`)
      }
      if (event.type === 'permission.asked' && event.properties.sessionID === sessionId) {
        permissionSeen = true
        const result = await client.permission.reply({ requestID: event.properties.id, reply: 'once' })
        dataOf(result)
        permissionReplied = true
      }
      if (event.type === 'message.part.updated' && event.properties.part.sessionID === sessionId) {
        const part = event.properties.part
        if (part.type === 'text') finalText = part.text
      }
      if (event.type === 'session.idle' && event.properties.sessionID === sessionId) return
      if (event.type === 'session.error' && event.properties.sessionID === sessionId) {
        throw new Error(JSON.stringify(event.properties.error))
      }
    }
  })()

  const session = dataOf(await client.session.create({ title: 'WetoCode permission smoke' }))
  sessionId = session.id
  console.log(`session: ${sessionId}`)
  const promptResult = await client.session.promptAsync({
    sessionID: sessionId,
    model: { providerID: 'opencode', modelID: 'mimo-v2.5-free' },
    parts: [{
      type: 'text',
      text: `Read the exact contents of ${externalPath} and reply with only those contents.`,
    }],
  })
  dataOf(promptResult)
  console.log(`prompt: accepted (${promptResult.response?.status || 204})`)

  let timeout
  try {
    await Promise.race([
      events,
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(`Agent run timed out. Events: ${[...seenEvents].join(', ') || 'none'}. Server: ${stderr.trim()}`)), 45_000) }),
    ])
  } finally {
    clearTimeout(timeout)
  }

  if (!permissionSeen || !permissionReplied) throw new Error('The external-directory permission request was not completed.')
  if (!finalText.includes('WETOCODE_PERMISSION_SMOKE_OK')) throw new Error(`Unexpected final response: ${finalText}`)
  const savedSession = dataOf(await client.session.get({ sessionID: sessionId }))
  const savedMessages = dataOf(await client.session.messages({ sessionID: sessionId }))
  console.log(JSON.stringify({ ok: true, permissionSeen, permissionReplied, finalText: finalText.trim(), saved: { directory: savedSession.directory, messages: savedMessages.map((message) => ({ role: message.info.role, parts: message.parts.map((part) => part.type) })) } }, null, 2))
} finally {
  controller.abort()
  server.kill('SIGTERM')
  await fs.rm(temporaryRoot, { recursive: true, force: true })
}
