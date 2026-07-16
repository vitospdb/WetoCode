import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const binary = process.env.OPENCODE_BIN || path.join(root, 'node_modules', 'opencode-ai', 'bin', 'opencode.exe')
const runtime = process.env.WETOCODE_CLI_RUNTIME || process.execPath
const cliScript = process.env.WETOCODE_CLI_SCRIPT || path.join(root, 'electron', 'wetocode-cli.mjs')
const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'wetocode-cli-smoke-'))
const server = spawn(binary, ['serve', '--hostname=127.0.0.1', '--port=0'], {
  cwd: projectPath,
  env: {
    ...process.env,
    NO_COLOR: '1',
    OPENCODE_CONFIG_CONTENT: JSON.stringify({
      model: 'opencode/mimo-v2.5-free',
      share: 'disabled',
      autoupdate: false,
      permission: { '*': 'allow' },
    }),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverOutput = ''
server.stderr.on('data', (chunk) => { serverOutput += chunk.toString() })

function serverUrl(timeout = 20_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server startup timed out. ${serverOutput}`)), timeout)
    server.stdout.on('data', (chunk) => {
      serverOutput += chunk.toString()
      const match = serverOutput.match(/opencode server listening on (https?:\/\/\S+)/)
      if (!match) return
      clearTimeout(timer)
      resolve(match[1])
    })
    server.once('error', reject)
    server.once('exit', (code) => reject(new Error(`Server exited before startup (${code}). ${serverOutput}`)))
  })
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode) return
  const exited = new Promise((resolve) => child.once('exit', resolve))
  child.kill('SIGTERM')
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ])
}

async function waitFor(condition, label, timeout = 20_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`${label} timed out.`)
}

let cli
try {
  const url = await serverUrl()
  cli = spawn(runtime, [
    cliScript,
    '--service-url', url,
    '--project', projectPath,
    '--provider', 'opencode',
    '--model', 'mimo-v2.5-free',
    '--provider-name', '公共免费模型',
    '--version', 'smoke',
    '--public-free', 'true',
  ], {
    cwd: projectPath,
    env: { ...process.env, ...(process.env.WETOCODE_CLI_RUNTIME ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let output = ''
  cli.stdout.on('data', (chunk) => { output += chunk.toString() })
  cli.stderr.on('data', (chunk) => { output += chunk.toString() })
  await waitFor(() => output.includes('WetoCode >'), 'WetoCode CLI prompt')
  if (!output.includes('\x1b]0;WetoCode\x07')) throw new Error(`WetoCode CLI did not set a terminal title: ${output}`)
  cli.stdin.write('只回复 WETOCODE_CLI_MODEL_OK\n')

  await waitFor(() => output.includes('WETOCODE_CLI_MODEL_OK'), 'CLI model response', 90_000)
  if (/open\s?code/i.test(output)) throw new Error(`Upstream branding is visible: ${output}`)
  cli.stdin.write('/exit\n')
  console.log(JSON.stringify({ ok: true, prompt: 'WetoCode >', terminalTitle: 'WetoCode', modelResponse: 'WETOCODE_CLI_MODEL_OK', upstreamBrandVisible: false }, null, 2))
} finally {
  await stopProcess(cli)
  await stopProcess(server)
  await fs.rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}
