import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

describe('Electron preload subscriptions', () => {
  it('replaces listeners without returning a cross-context cleanup function', () => {
    const exposed: Record<string, unknown> = {}
    const ipcRenderer = {
      invoke: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    }
    const contextBridge = {
      exposeInMainWorld: (_name: string, bridge: Record<string, unknown>) => Object.assign(exposed, bridge),
    }

    runInNewContext(readFileSync(new URL('./preload.cjs', import.meta.url), 'utf8'), {
      require: (name: string) => {
        if (name === 'electron') return { contextBridge, ipcRenderer }
        throw new Error(`Unexpected require: ${name}`)
      },
    })

    const subscribe = exposed.onAgentEvent as (listener: (payload: unknown) => void) => void
    const first = vi.fn()
    const second = vi.fn()

    expect(subscribe(first)).toBeUndefined()
    const firstHandler = ipcRenderer.on.mock.calls[0][1]
    expect(subscribe(second)).toBeUndefined()
    const secondHandler = ipcRenderer.on.mock.calls[1][1]

    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('agent:event', firstHandler)
    secondHandler({}, { type: 'finished' })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith({ type: 'finished' })
  })

  it('exposes access mode changes through a fixed IPC channel', async () => {
    const exposed: Record<string, unknown> = {}
    const ipcRenderer = { invoke: vi.fn().mockResolvedValue({ accessMode: 'full' }), on: vi.fn(), removeListener: vi.fn() }
    const contextBridge = {
      exposeInMainWorld: (_name: string, bridge: Record<string, unknown>) => Object.assign(exposed, bridge),
    }

    runInNewContext(readFileSync(new URL('./preload.cjs', import.meta.url), 'utf8'), {
      require: (name: string) => {
        if (name === 'electron') return { contextBridge, ipcRenderer }
        throw new Error(`Unexpected require: ${name}`)
      },
    })

    await (exposed.setAccessMode as (mode: string) => Promise<unknown>)('full')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('settings:set-access-mode', 'full')
  })

  it('exposes appearance changes through a fixed IPC channel', async () => {
    const exposed: Record<string, unknown> = {}
    const ipcRenderer = { invoke: vi.fn().mockResolvedValue({}), on: vi.fn(), removeListener: vi.fn() }
    const contextBridge = { exposeInMainWorld: (_name: string, bridge: Record<string, unknown>) => Object.assign(exposed, bridge) }

    runInNewContext(readFileSync(new URL('./preload.cjs', import.meta.url), 'utf8'), {
      require: (name: string) => {
        if (name === 'electron') return { contextBridge, ipcRenderer }
        throw new Error(`Unexpected require: ${name}`)
      },
    })

    await (exposed.setAppearance as (value: unknown) => Promise<unknown>)({ theme: 'dark' })
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('settings:set-appearance', { theme: 'dark' })
  })

  it('tests provider credentials through a fixed IPC channel', async () => {
    const exposed: Record<string, unknown> = {}
    const ipcRenderer = { invoke: vi.fn().mockResolvedValue({ ok: true }), on: vi.fn(), removeListener: vi.fn() }
    const contextBridge = { exposeInMainWorld: (_name: string, bridge: Record<string, unknown>) => Object.assign(exposed, bridge) }
    runInNewContext(readFileSync(new URL('./preload.cjs', import.meta.url), 'utf8'), {
      require: (name: string) => {
        if (name === 'electron') return { contextBridge, ipcRenderer }
        throw new Error(`Unexpected require: ${name}`)
      },
    })
    const provider = { providerId: 'xfyun-spark', model: '4.0Ultra', baseUrl: 'https://spark-api-open.xf-yun.com/v1', apiKey: 'secret' }
    await (exposed.testProvider as (value: unknown) => Promise<unknown>)(provider)
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('provider:test', provider)
  })

  it('switches the active provider through a fixed IPC channel', async () => {
    const exposed: Record<string, unknown> = {}
    const ipcRenderer = { invoke: vi.fn().mockResolvedValue({}), on: vi.fn(), removeListener: vi.fn() }
    const contextBridge = { exposeInMainWorld: (_name: string, bridge: Record<string, unknown>) => Object.assign(exposed, bridge) }
    runInNewContext(readFileSync(new URL('./preload.cjs', import.meta.url), 'utf8'), {
      require: (name: string) => {
        if (name === 'electron') return { contextBridge, ipcRenderer }
        throw new Error(`Unexpected require: ${name}`)
      },
    })
    await (exposed.setActiveProvider as (id: string) => Promise<unknown>)('provider-1')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('provider:set-active', 'provider-1')
  })

  it('checks engine status without coupling it to bootstrap', async () => {
    const exposed: Record<string, unknown> = {}
    const ipcRenderer = { invoke: vi.fn().mockResolvedValue({ installed: true }), on: vi.fn(), removeListener: vi.fn() }
    const contextBridge = { exposeInMainWorld: (_name: string, bridge: Record<string, unknown>) => Object.assign(exposed, bridge) }
    runInNewContext(readFileSync(new URL('./preload.cjs', import.meta.url), 'utf8'), {
      require: (name: string) => {
        if (name === 'electron') return { contextBridge, ipcRenderer }
        throw new Error(`Unexpected require: ${name}`)
      },
    })
    await (exposed.getEngineStatus as () => Promise<unknown>)()
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('app:engine-status')
  })

  it('can reopen the resident main window through a fixed IPC channel', async () => {
    const exposed: Record<string, unknown> = {}
    const ipcRenderer = { invoke: vi.fn().mockResolvedValue(true), on: vi.fn(), removeListener: vi.fn() }
    const contextBridge = { exposeInMainWorld: (_name: string, bridge: Record<string, unknown>) => Object.assign(exposed, bridge) }
    runInNewContext(readFileSync(new URL('./preload.cjs', import.meta.url), 'utf8'), {
      require: (name: string) => {
        if (name === 'electron') return { contextBridge, ipcRenderer }
        throw new Error(`Unexpected require: ${name}`)
      },
    })
    await (exposed.showMainWindow as () => Promise<unknown>)()
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('app:show-window')
  })

  it('replies to agent permissions through a fixed IPC channel', async () => {
    const exposed: Record<string, unknown> = {}
    const ipcRenderer = { invoke: vi.fn().mockResolvedValue(true), on: vi.fn(), removeListener: vi.fn() }
    const contextBridge = { exposeInMainWorld: (_name: string, bridge: Record<string, unknown>) => Object.assign(exposed, bridge) }
    runInNewContext(readFileSync(new URL('./preload.cjs', import.meta.url), 'utf8'), {
      require: (name: string) => {
        if (name === 'electron') return { contextBridge, ipcRenderer }
        throw new Error(`Unexpected require: ${name}`)
      },
    })
    await (exposed.replyPermission as (id: string, response: string) => Promise<unknown>)('permission-1', 'once')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('agent:permission-reply', 'permission-1', 'once')
  })

  it('exposes background task recovery through fixed IPC channels', async () => {
    const exposed: Record<string, unknown> = {}
    const ipcRenderer = { invoke: vi.fn().mockResolvedValue([]), on: vi.fn(), removeListener: vi.fn() }
    const contextBridge = { exposeInMainWorld: (_name: string, bridge: Record<string, unknown>) => Object.assign(exposed, bridge) }
    runInNewContext(readFileSync(new URL('./preload.cjs', import.meta.url), 'utf8'), {
      require: (name: string) => {
        if (name === 'electron') return { contextBridge, ipcRenderer }
        throw new Error(`Unexpected require: ${name}`)
      },
    })
    await (exposed.listAgentTasks as () => Promise<unknown>)()
    await (exposed.dismissAgentTask as (id: string) => Promise<unknown>)('run-1')
    expect(ipcRenderer.invoke.mock.calls).toEqual(expect.arrayContaining([
      ['agent:tasks'], ['agent:task-dismiss', 'run-1'],
    ]))

    const listener = vi.fn()
    ;(exposed.onAgentTasksChanged as (listener: (payload: unknown) => void) => void)(listener)
    const handler = ipcRenderer.on.mock.calls.at(-1)?.[1]
    handler({}, [{ runId: 'run-1', status: 'running' }])
    expect(listener).toHaveBeenCalledWith([{ runId: 'run-1', status: 'running' }])
  })

  it('exposes terminal IPC without leaking server connection details', async () => {
    const exposed: Record<string, unknown> = {}
    const ipcRenderer = { invoke: vi.fn().mockResolvedValue(true), on: vi.fn(), removeListener: vi.fn() }
    const contextBridge = { exposeInMainWorld: (_name: string, bridge: Record<string, unknown>) => Object.assign(exposed, bridge) }
    runInNewContext(readFileSync(new URL('./preload.cjs', import.meta.url), 'utf8'), {
      require: (name: string) => {
        if (name === 'electron') return { contextBridge, ipcRenderer }
        throw new Error(`Unexpected require: ${name}`)
      },
    })
    await (exposed.createTerminal as (path: string, size: unknown, mode: string) => Promise<unknown>)('/project', { rows: 24, cols: 80 }, 'cli')
    await (exposed.attachTerminal as (id: string) => Promise<unknown>)('pty-1')
    await (exposed.sendTerminalInput as (id: string, data: string) => Promise<unknown>)('pty-1', 'pwd\r')
    await (exposed.resizeTerminal as (id: string, size: unknown) => Promise<unknown>)('pty-1', { rows: 30, cols: 100 })
    await (exposed.closeTerminal as (id: string) => Promise<unknown>)('pty-1')
    await (exposed.readClipboardText as () => Promise<unknown>)()
    await (exposed.writeClipboardText as (value: string) => Promise<unknown>)('中文剪贴板')
    expect(ipcRenderer.invoke.mock.calls).toEqual(expect.arrayContaining([
      ['terminal:create', '/project', { rows: 24, cols: 80 }, 'cli'],
      ['terminal:attach', 'pty-1'],
      ['terminal:input', 'pty-1', 'pwd\r'],
      ['terminal:resize', 'pty-1', { rows: 30, cols: 100 }],
      ['terminal:close', 'pty-1'],
      ['clipboard:read-text'],
      ['clipboard:write-text', '中文剪贴板'],
    ]))
    expect(exposed).not.toHaveProperty('getServerUrl')
  })

  it('exposes worktree operations through fixed IPC channels', async () => {
    const exposed: Record<string, unknown> = {}
    const ipcRenderer = { invoke: vi.fn().mockResolvedValue({}), on: vi.fn(), removeListener: vi.fn() }
    const contextBridge = { exposeInMainWorld: (_name: string, bridge: Record<string, unknown>) => Object.assign(exposed, bridge) }
    runInNewContext(readFileSync(new URL('./preload.cjs', import.meta.url), 'utf8'), {
      require: (name: string) => {
        if (name === 'electron') return { contextBridge, ipcRenderer }
        throw new Error(`Unexpected require: ${name}`)
      },
    })
    await (exposed.listWorktrees as (path: string) => Promise<unknown>)('/project')
    await (exposed.createWorktree as (path: string, name: string) => Promise<unknown>)('/project', 'feature')
    await (exposed.resetWorktree as (path: string, directory: string) => Promise<unknown>)('/project', '/worktree')
    await (exposed.removeWorktree as (path: string, directory: string) => Promise<unknown>)('/project', '/worktree')
    expect(ipcRenderer.invoke.mock.calls).toEqual(expect.arrayContaining([
      ['worktree:list', '/project'], ['worktree:create', '/project', 'feature'],
      ['worktree:reset', '/project', '/worktree'], ['worktree:remove', '/project', '/worktree'],
    ]))
  })

  it('exposes bounded attachment operations through fixed IPC channels', async () => {
    const exposed: Record<string, unknown> = {}
    const ipcRenderer = { invoke: vi.fn().mockResolvedValue({}), on: vi.fn(), removeListener: vi.fn() }
    const contextBridge = { exposeInMainWorld: (_name: string, bridge: Record<string, unknown>) => Object.assign(exposed, bridge) }
    runInNewContext(readFileSync(new URL('./preload.cjs', import.meta.url), 'utf8'), {
      require: (name: string) => {
        if (name === 'electron') return { contextBridge, ipcRenderer }
        throw new Error(`Unexpected require: ${name}`)
      },
    })
    await (exposed.chooseAttachments as (path: string) => Promise<unknown>)('/project')
    await (exposed.addDataAttachment as (path: string, input: unknown) => Promise<unknown>)('/project', { name: 'shot.png', dataUrl: 'data:image/png;base64,AA==' })
    await (exposed.removeAttachment as (id: string) => Promise<unknown>)('attachment-1')
    expect(ipcRenderer.invoke.mock.calls).toEqual(expect.arrayContaining([
      ['attachment:choose', '/project'],
      ['attachment:add-data', '/project', { name: 'shot.png', dataUrl: 'data:image/png;base64,AA==' }],
      ['attachment:remove', 'attachment-1'],
    ]))
  })

  it('exposes goal and reasoning controls through fixed IPC channels', async () => {
    const exposed: Record<string, unknown> = {}
    const ipcRenderer = { invoke: vi.fn().mockResolvedValue({}), on: vi.fn(), removeListener: vi.fn() }
    const contextBridge = { exposeInMainWorld: (_name: string, bridge: Record<string, unknown>) => Object.assign(exposed, bridge) }
    runInNewContext(readFileSync(new URL('./preload.cjs', import.meta.url), 'utf8'), {
      require: (name: string) => {
        if (name === 'electron') return { contextBridge, ipcRenderer }
        throw new Error(`Unexpected require: ${name}`)
      },
    })
    await (exposed.getGoal as (sessionId: string, path: string) => Promise<unknown>)('session-1', '/project')
    await (exposed.setGoalStatus as (sessionId: string, path: string, action: string) => Promise<unknown>)('session-1', '/project', 'pause')
    await (exposed.setReasoningEffort as (effort: string) => Promise<unknown>)('max')
    expect(ipcRenderer.invoke.mock.calls).toEqual(expect.arrayContaining([
      ['goal:get', 'session-1', '/project'],
      ['goal:set-status', 'session-1', '/project', 'pause'],
      ['settings:set-reasoning-effort', 'max'],
    ]))
  })

  it('exposes bounded project file operations through fixed IPC channels', async () => {
    const exposed: Record<string, unknown> = {}
    const ipcRenderer = { invoke: vi.fn().mockResolvedValue({}), on: vi.fn(), removeListener: vi.fn() }
    const contextBridge = { exposeInMainWorld: (_name: string, bridge: Record<string, unknown>) => Object.assign(exposed, bridge) }
    runInNewContext(readFileSync(new URL('./preload.cjs', import.meta.url), 'utf8'), {
      require: (name: string) => {
        if (name === 'electron') return { contextBridge, ipcRenderer }
        throw new Error(`Unexpected require: ${name}`)
      },
    })
    await (exposed.listProjectFiles as (path: string, relative: string) => Promise<unknown>)('/project', 'src')
    await (exposed.searchProjectFiles as (path: string, query: string) => Promise<unknown>)('/project', 'App')
    await (exposed.readProjectFile as (path: string, relative: string) => Promise<unknown>)('/project', 'src/App.tsx')
    await (exposed.openProjectFile as (path: string, relative: string) => Promise<unknown>)('/project', 'src/App.tsx')
    await (exposed.addProjectAttachment as (path: string, relative: string) => Promise<unknown>)('/project', 'src/App.tsx')
    expect(ipcRenderer.invoke.mock.calls).toEqual(expect.arrayContaining([
      ['file:list', '/project', 'src'], ['file:search', '/project', 'App'], ['file:read', '/project', 'src/App.tsx'],
      ['file:open', '/project', 'src/App.tsx'], ['attachment:add-project', '/project', 'src/App.tsx'],
    ]))
    expect(exposed).not.toHaveProperty('readFile')
  })

  it('exposes session workflow and extension operations through fixed IPC channels', async () => {
    const exposed: Record<string, unknown> = {}
    const ipcRenderer = { invoke: vi.fn().mockResolvedValue({}), on: vi.fn(), removeListener: vi.fn() }
    const contextBridge = { exposeInMainWorld: (_name: string, bridge: Record<string, unknown>) => Object.assign(exposed, bridge) }
    runInNewContext(readFileSync(new URL('./preload.cjs', import.meta.url), 'utf8'), {
      require: (name: string) => {
        if (name === 'electron') return { contextBridge, ipcRenderer }
        throw new Error(`Unexpected require: ${name}`)
      },
    })
    await (exposed.forkSession as (...args: string[]) => Promise<unknown>)('session-1', '/project', 'message-1')
    await (exposed.revertSession as (...args: string[]) => Promise<unknown>)('session-1', '/project', 'message-1')
    await (exposed.unrevertSession as (...args: string[]) => Promise<unknown>)('session-1', '/project')
    await (exposed.compactSession as (...args: string[]) => Promise<unknown>)('session-1', '/project', 'provider-1')
    await (exposed.runCommand as (...args: Array<string | undefined>) => Promise<unknown>)('session-1', '/project', 'provider-1', 'review', '')
    await (exposed.getExtensions as (path: string) => Promise<unknown>)('/project')
    await (exposed.getUsage as (range: string) => Promise<unknown>)('30d')
    expect(ipcRenderer.invoke.mock.calls).toEqual(expect.arrayContaining([
      ['session:fork', 'session-1', '/project', 'message-1'], ['session:revert', 'session-1', '/project', 'message-1'],
      ['session:unrevert', 'session-1', '/project'], ['session:compact', 'session-1', '/project', 'provider-1'],
      ['session:command', 'session-1', '/project', 'provider-1', 'review', ''], ['extensions:overview', '/project'], ['usage:get', '30d'],
    ]))
  })
})
