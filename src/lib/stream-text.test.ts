import { describe, expect, it } from 'vitest'
import { mergeStreamText } from './stream-text'

describe('流式文本合并', () => {
  it('追加增量且忽略重复增量', () => {
    expect(mergeStreamText('你好', '，世界', 'delta')).toBe('你好，世界')
    expect(mergeStreamText('你好，世界', '，世界', 'delta')).toBe('你好，世界')
  })

  it('用完整快照补齐或修正最终文本', () => {
    expect(mergeStreamText('ATTACH', 'ATTACHMENT_RECEIVED', 'snapshot')).toBe('ATTACHMENT_RECEIVED')
    expect(mergeStreamText('', '已完成', 'snapshot')).toBe('已完成')
  })
})
