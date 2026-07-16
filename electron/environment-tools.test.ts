import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { commandCheck, environmentReport } = require('./environment-tools.cjs')

describe('environment doctor', () => {
  it('translates ENOENT into beginner-friendly Chinese guidance', async () => {
    const check = await commandCheck({ id: 'node', name: 'Node.js', command: 'node' }, vi.fn().mockRejectedValue(Object.assign(new Error('spawn node ENOENT'), { code: 'ENOENT' })))
    expect(check).toMatchObject({ status: 'missing', detail: '未找到 Node.js，WetoCode 暂时无法运行这个项目。' })
  })

  it('reports engine, path and configured provider state', async () => {
    const report = await environmentReport({ platform: 'linux', engine: { installed: true, version: '1.0.0' }, providers: [{ id: 'wetocode-free' }] }, vi.fn().mockResolvedValue({ stdout: 'v1\n', stderr: '' }))
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'engine', status: 'ready' }),
      expect.objectContaining({ id: 'provider', status: 'ready' }),
      expect.objectContaining({ id: 'path' }),
    ]))
  })
})
