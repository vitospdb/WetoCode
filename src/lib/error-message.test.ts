import { describe, expect, it } from 'vitest'
import { userErrorMessage } from './error-message'

describe('用户错误文案', () => {
  it('removes the Electron IPC wrapper from a Chinese main-process error', () => {
    expect(userErrorMessage(new Error("Error invoking remote method 'terminal:create': Error: 终端启动超时，请检查本地网络服务后重试。")))
      .toBe('终端启动超时，请检查本地网络服务后重试。')
  })

  it('preserves ordinary errors and supplies a fallback', () => {
    expect(userErrorMessage(new Error('无法读取项目。'))).toBe('无法读取项目。')
    expect(userErrorMessage(undefined)).toBe('操作失败，请重试。')
  })
})
