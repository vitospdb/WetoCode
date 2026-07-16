import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { startOpencodeServer, stopChild, stopProcessTree, withAbortTimeout, withTimeout } = require('./opencode-server.cjs')

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

  it('accepts the Windows server URL when OpenCode writes startup status to stderr', async () => {
    const child = childProcess()
    const spawnProcess = vi.fn().mockReturnValueOnce(child)
    const started = startOpencodeServer({ binary: 'opencode.exe', cwd: 'C:\\project', env: {}, timeout: 1000, spawnProcess, getPort: () => Promise.resolve(42732) })
    child.stderr.write('opencode server listening on http://127.0.0.1:42732\r\n')
    await expect(started).resolves.toEqual({ child, url: 'http://127.0.0.1:42732' })
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

  it('stops the Windows process tree before sending a signal', async () => {
    const child = childProcess()
    child.pid = 42731
    const killProcessTree = vi.fn().mockImplementation(() => {
      child.signalCode = 'SIGKILL'
      child.emit('exit', null, 'SIGKILL')
      return { status: 0 }
    })
    await expect(stopChild(child, { platform: 'win32', killProcessTree })).resolves.toBe(true)
    expect(child.kill).not.toHaveBeenCalled()
    expect(killProcessTree).toHaveBeenCalledWith('taskkill.exe', ['/pid', '42731', '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore',
    })
  })

  it('uses a hard signal if Windows process-tree termination fails', async () => {
    const child = childProcess()
    child.pid = 42731
    child.kill.mockImplementation(() => {
      child.signalCode = 'SIGKILL'
      child.emit('exit', null, 'SIGKILL')
    })
    const killProcessTree = vi.fn().mockReturnValue({ status: 1 })
    await expect(stopChild(child, { platform: 'win32', killProcessTree })).resolves.toBe(true)
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
  })

  it('still checks the Windows process tree after Node reports an exit', async () => {
    const child = childProcess()
    child.pid = 42731
    child.exitCode = 1
    const killProcessTree = vi.fn().mockReturnValue({ status: 255 })
    await expect(stopChild(child, { platform: 'win32', killProcessTree })).resolves.toBe(true)
    expect(killProcessTree).toHaveBeenCalledWith('taskkill.exe', ['/pid', '42731', '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore',
    })
    expect(child.kill).not.toHaveBeenCalled()
  })

  it('can terminate an orphaned Windows PTY process tree by pid', () => {
    const killProcessTree = vi.fn().mockReturnValue({ status: 0 })
    expect(stopProcessTree(42732, { platform: 'win32', killProcessTree })).toBe(true)
    expect(killProcessTree).toHaveBeenCalledWith('taskkill.exe', ['/pid', '42732', '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore',
    })
  })

  it('bounds a stalled service request with its Chinese error', async () => {
    vi.useFakeTimers()
    const pending = withTimeout(new Promise(() => {}), 12_000, '本地执行服务连接超时，请重试。')
    const assertion = expect(pending).rejects.toThrow('本地执行服务连接超时，请重试。')
    await vi.advanceTimersByTimeAsync(12_000)
    await assertion
    vi.useRealTimers()
  })

  it('clears the timeout after a service request succeeds', async () => {
    vi.useFakeTimers()
    await expect(withTimeout(Promise.resolve({ id: 'pty-1' }), 12_000, '不应超时')).resolves.toEqual({ id: 'pty-1' })
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  it('aborts and settles a stalled request before reporting its timeout', async () => {
    vi.useFakeTimers()
    let aborted = false
    const pending = withAbortTimeout((signal: AbortSignal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => {
        aborted = true
        reject(new Error('aborted'))
      }, { once: true })
    }), 12_000, '终端启动超时。')
    const assertion = expect(pending).rejects.toThrow('终端启动超时。')
    await vi.advanceTimersByTimeAsync(12_000)
    await assertion
    expect(aborted).toBe(true)
    vi.useRealTimers()
  })
})
