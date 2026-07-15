import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { connectionRequest, normalizeProviderProtocol, providerPackage, testProviderConnection } = require('./provider-tools.cjs')

describe('Provider protocol adapters', () => {
  it('migrates legacy providers and selects the matching AI SDK package', () => {
    expect(normalizeProviderProtocol(undefined, 'gateway')).toBe('openai-compatible')
    expect(normalizeProviderProtocol(undefined, 'anthropic')).toBe('anthropic')
    expect(normalizeProviderProtocol(undefined, 'google')).toBe('google')
    expect(providerPackage('openai-compatible')).toBe('@ai-sdk/openai-compatible')
    expect(providerPackage('anthropic')).toBe('@ai-sdk/anthropic')
    expect(providerPackage('google')).toBe('@ai-sdk/google')
  })

  it('builds an OpenAI-compatible request for Xunfei APIPassword authentication', () => {
    const request = connectionRequest({
      protocol: 'openai-compatible', providerId: 'xfyun-spark', model: '4.0Ultra', baseUrl: 'https://spark-api-open.xf-yun.com/v1/',
    }, 'api-password')
    expect(request.url).toBe('https://spark-api-open.xf-yun.com/v1/chat/completions')
    expect(request.options.headers.authorization).toBe('Bearer api-password')
    expect(JSON.parse(request.options.body).model).toBe('4.0Ultra')
  })

  it('builds native Anthropic and Gemini requests', () => {
    const anthropic = connectionRequest({ protocol: 'anthropic', model: 'claude', baseUrl: 'https://api.anthropic.com/v1' }, 'secret')
    expect(anthropic.url).toBe('https://api.anthropic.com/v1/messages')
    expect(anthropic.options.headers['x-api-key']).toBe('secret')

    const google = connectionRequest({ protocol: 'google', model: 'gemini 2.5/pro', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' }, 'secret')
    expect(google.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini%202.5%2Fpro:generateContent')
    expect(google.options.headers['x-goog-api-key']).toBe('secret')
  })

  it('accepts keyless loopback gateways and reports remote API errors', async () => {
    expect(() => connectionRequest({ protocol: 'openai-compatible', model: 'qwen', baseUrl: 'http://127.0.0.1:11434/v1' }, '')).not.toThrow()
    const fetchRequest = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: { message: 'invalid key' } }) })
    await expect(testProviderConnection({ protocol: 'openai-compatible', model: 'qwen', baseUrl: 'https://gateway.example/v1' }, 'secret', fetchRequest))
      .rejects.toThrow('HTTP 401')
  })
})
