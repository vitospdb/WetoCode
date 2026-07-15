import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { startOpencodeServer, stopChild } = require('./opencode-server.cjs')

function childProcess() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough
    stderr: PassThrough
    kill: ReturnType<typeof vi.fn>
    exitCode: number | null
    signalCode: string | null
  }
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.kill = vi.fn()
  child.exitCode = null
  child.signalCode = null
  return child
}

describe('OpenCode Server lifecycle', () => {
  it('parses the random local server URL without a shell', async () => {
    const child = childProcess()
    const spawnProcess = vi.fn().mockReturnValueOnce(child)
    const started = startOpencodeServer({ binary: '/bin/opencode', cwd: '/project', env: {}, timeout: 1000, spawnProcess })
    child.stdout.write('opencode server listening on http://127.0.0.1:42731\n')
    await expect(started).resolves.toEqual({ child, url: 'http://127.0.0.1:42731' })
    expect(spawnProcess).toHaveBeenCalledWith('/bin/opencode', ['serve', '--hostname=127.0.0.1', '--port=0'], expect.objectContaining({ cwd: '/project', windowsHide: true }))
  })

  it('terminates a running server', () => {
    const child = childProcess()
    stopChild(child)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })
})
