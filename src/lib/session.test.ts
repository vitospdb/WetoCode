import { describe, expect, it } from 'vitest'
import type { ExportedSession } from '../types'
import { exportedToMessages, partToTool } from './session'

describe('OpenCode 会话映射', () => {
  it('将工具状态转换为中文界面可消费的数据', () => {
    expect(partToTool({
      id: 'part-1',
      type: 'tool',
      tool: 'read',
      state: { status: 'completed', title: 'src/main.ts', output: 'content' },
    })).toEqual({
      id: 'part-1',
      tool: 'read',
      title: 'src/main.ts',
      status: 'completed',
      input: undefined,
      output: 'content',
    })
  })

  it('保留历史文本、工具调用和 token 统计', () => {
    const session = {
      info: { id: 'session-1', title: '审查项目' },
      messages: [{
        info: {
          id: 'message-1', role: 'assistant', time: { created: 1000 },
          tokens: { total: 128, input: 100, output: 20, reasoning: 8 },
        },
        parts: [
          { id: 'tool-1', type: 'tool', tool: 'grep', state: { status: 'completed', title: '检索代码' } },
          { id: 'text-1', type: 'text', text: '审查完成。' },
        ],
      }],
    } satisfies ExportedSession

    expect(exportedToMessages(session)).toEqual([expect.objectContaining({
      id: 'message-1', role: 'assistant', text: '审查完成。', createdAt: 1000,
      tokens: { total: 128, input: 100, output: 20, reasoning: 8 },
      tools: [expect.objectContaining({ id: 'tool-1', tool: 'grep', status: 'completed' })],
    })])
  })

  it('忽略没有可见文本和工具的内部步骤', () => {
    const session = {
      info: { id: 'session-1', title: '内部步骤' },
      messages: [{
        info: { id: 'message-1', role: 'assistant', time: { created: 1000 } },
        parts: [{ id: 'step-1', type: 'step-start' }],
      }],
    } satisfies ExportedSession
    expect(exportedToMessages(session)).toEqual([])
  })

  it('恢复历史消息中的原生文件附件', () => {
    const previewUrl = 'data:image/png;base64,iVBORw0KGgo='
    const session = {
      info: { id: 'session-1', title: '附件会话' },
      messages: [{
        info: { id: 'message-1', role: 'user', time: { created: 1000 } },
        parts: [{ id: 'file-1', type: 'file', mime: 'image/png', filename: 'screen.png', url: previewUrl }],
      }],
    } satisfies ExportedSession

    expect(exportedToMessages(session)).toEqual([expect.objectContaining({
      id: 'message-1',
      text: '',
      attachments: [{
        id: 'file-1', name: 'screen.png', mime: 'image/png', size: 8, kind: 'upload',
        relativePath: undefined, previewUrl,
      }],
    })])
  })
})
