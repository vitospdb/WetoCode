import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { startOpencodeServer, stopChild, stopProcessTree } = require('./opencode-server.cjs')

function childProcess() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough
    stderr: PassThrough
    kill: ReturnType<typeof vi.fn>
    pid?: number
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
    const started = startOpencodeServer({ binary: '/bin/opencode', cwd: '/project', env: {}, timeout: 1000, spawnProcess, getPort: () => Promise.resolve(42731) })
    child.stdout.write('opencode server listening on http://127.0.0.1:42731\n')
    await expect(started).resolves.toEqual({ child, url: 'http://127.0.0.1:42731' })
    expect(spawnProcess).toHaveBeenCalledWith('/bin/opencode', ['serve', '--hostname=127.0.0.1', '--port=42731'], expect.objectContaining({ cwd: '/project', windowsHide: true }))
  })

  it('terminates a running server with signals outside Windows', async () => {
    const child = childProcess()
    child.kill.mockImplementation(() => {
      child.signalCode = 'SIGTERM'
      child.emit('exit', null, 'SIGTERM')
    })
    await stopChild(child, { platform: 'linux' })
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('uses the Windows process tree fallback only after graceful exit times out', async () => {
    const child = childProcess()
    child.pid = 42731
    const killProcessTree = vi.fn().mockReturnValue({ status: 0 })
    vi.useFakeTimers()
    const stopping = stopChild(child, { platform: 'win32', killProcessTree })
    await vi.advanceTimersByTimeAsync(3000)
    child.signalCode = 'SIGTERM'
    child.emit('exit', null, 'SIGTERM')
    await stopping
    vi.useRealTimers()
    expect(child.kill).toHaveBeenCalledWith('SIGBREAK')
    expect(killProcessTree).toHaveBeenCalledWith('taskkill.exe', ['/pid', '42731', '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore',
    })
  })

  it('can terminate an orphaned Windows PTY process tree by pid', () => {
    const killProcessTree = vi.fn().mockReturnValue({ status: 0 })
    expect(stopProcessTree(42732, { platform: 'win32', killProcessTree })).toBe(true)
    expect(killProcessTree).toHaveBeenCalledWith('taskkill.exe', ['/pid', '42732', '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore',
    })
  })
})
