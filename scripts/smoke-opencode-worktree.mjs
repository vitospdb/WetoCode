import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createOpencodeClient } from '@opencode-ai/sdk/v2/client'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const binary = process.env.OPENCODE_BIN || path.join(root, 'node_modules', 'opencode-ai', 'bin', 'opencode.exe')
const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'wetocode-worktree-smoke-'))
execFileSync('git', ['init', '-b', 'main'], { cwd: projectPath })
execFileSync('git', ['config', 'user.name', 'WetoCode Smoke'], { cwd: projectPath })
execFileSync('git', ['config', 'user.email', 'smoke@wetocode.local'], { cwd: projectPath })
await fs.writeFile(path.join(projectPath, 'README.md'), 'worktree smoke\n')
execFileSync('git', ['add', 'README.md'], { cwd: projectPath })
execFileSync('git', ['commit', '-m', 'initial'], { cwd: projectPath })

const server = spawn(binary, ['serve', '--hostname=127.0.0.1', '--port=0'], {
  cwd: projectPath,
  env: { ...process.env, NO_COLOR: '1', OPENCODE_CONFIG_CONTENT: JSON.stringify({ autoupdate: false }) },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
server.stderr.on('data', (chunk) => { output += chunk.toString() })

function serverUrl() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server startup timed out. ${output}`)), 15_000)
    server.stdout.on('data', (chunk) => {
      output += chunk.toString()
      const match = output.match(/opencode server listening on (https?:\/\/\S+)/)
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

let created
try {
  const client = createOpencodeClient({ baseUrl: await serverUrl(), directory: projectPath })
  created = dataOf(await client.worktree.create({ worktreeCreateInput: { name: 'smoke-workspace' } }))
  const listed = dataOf(await client.worktree.list())
  if (!listed.includes(created.directory)) throw new Error(`Created worktree was not listed: ${JSON.stringify({ created, listed })}`)
  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: created.directory, encoding: 'utf8' }).trim()
  await fs.writeFile(path.join(created.directory, 'worktree-created.txt'), 'ok\n')
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: created.directory, encoding: 'utf8' }).trim()
  if (!dirty) throw new Error('Expected an isolated dirty worktree.')
  await fs.rm(path.join(created.directory, 'worktree-created.txt'))
  const createdSummary = { name: created.name, branch, outsidePrimary: !created.directory.startsWith(`${projectPath}${path.sep}`) }
  dataOf(await client.worktree.remove({ worktreeRemoveInput: { directory: created.directory } }))
  created = undefined
  console.log(JSON.stringify({ ok: true, created: createdSummary, dirtyDetected: true, removed: true }, null, 2))
} finally {
  if (created?.directory) {
    try { execFileSync('git', ['worktree', 'remove', '--force', created.directory], { cwd: projectPath }) } catch {}
  }
  server.kill('SIGTERM')
  await fs.rm(projectPath, { recursive: true, force: true })
}
