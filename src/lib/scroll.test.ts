import { describe, expect, it, vi } from 'vitest'
import { scrollToLatest } from './scroll'

describe('scrollToLatest', () => {
  it('does not expose a promise as a React effect cleanup value', () => {
    const scrollTo = vi.fn(() => Promise.resolve())
    const element = { scrollHeight: 480, scrollTo } as unknown as HTMLElement

    expect(scrollToLatest(element)).toBeUndefined()
    expect(scrollTo).toHaveBeenCalledWith({ top: 480, behavior: 'smooth' })
  })
})
