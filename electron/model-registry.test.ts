import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { configuredModel, discoverOpenAICompatibleModels, modelFromOpenAI, modelFromOpenCode, priceState, publicFreeModels, uniqueModels } = require('./model-registry.cjs')

const provider = {
  id: 'gateway', name: '团队网关', providerId: 'gateway', model: 'model-a', baseUrl: 'https://gateway.example/v1',
  kind: 'custom', protocol: 'openai-compatible', contextWindow: 128000, hasApiKey: true,
}

describe('model registry adapters', () => {
  it('keeps unknown price out of the free state and honors reliable free sources', () => {
    expect(priceState({ modelId: 'unknown' }).priceState).toBe('unknown')
    expect(priceState({ modelId: 'vendor/free', source: 'provider-api' })).toMatchObject({ isFree: true, priceState: 'free' })
    expect(priceState({ modelId: 'paid', inputPrice: 0.1, outputPrice: 0.2 }).priceState).toBe('paid')
    expect(priceState({ modelId: 'internal', manualPriceMode: 'free' })).toMatchObject({ isFree: true, priceState: 'free' })
  })

  it('normalizes OpenCode capabilities and zero pricing', () => {
    const model = modelFromOpenCode(provider, {
      id: 'model-a', providerID: 'gateway', name: 'Model A', family: 'Coder', enabled: true, status: 'active',
      capabilities: { tools: true, input: ['text', 'image'] }, cost: [{ input: 0, output: 0, cache: { read: 0, write: 0 } }], limit: { context: 200000 },
    })
    expect(model).toMatchObject({ modelId: 'model-a', supportsTools: true, supportsVision: true, isFree: true, contextWindow: 200000, availability: 'connected' })
  })

  it('discovers real OpenAI-compatible models without embedding a model list', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 'live-model' }] }) })
    const list = await discoverOpenAICompatibleModels(provider, 'secret', request)
    expect(list).toEqual([{ id: 'live-model' }])
    expect(request.mock.calls[0][0]).toBe('https://gateway.example/v1/models')
    expect(request.mock.calls[0][1].headers).toEqual({ authorization: 'Bearer secret' })
    expect(modelFromOpenAI(provider, list[0]).priceState).toBe('unknown')
  })

  it('preserves configured model fallback and favors live metadata', () => {
    const configured = configuredModel(provider)
    const live = modelFromOpenAI(provider, { id: 'model-a', name: 'Live Model A' })
    expect(uniqueModels([configured, live])).toEqual([expect.objectContaining({ displayName: 'Live Model A', source: 'provider-api' })])
  })

  it('exposes the current OpenCode public free catalog', () => {
    const models = publicFreeModels({ ...provider, id: 'wetocode-free', providerId: 'opencode', name: '公共免费模型' })
    expect(models.map((model) => model.modelId)).toEqual([
      'big-pickle', 'deepseek-v4-flash-free', 'hy3-free', 'mimo-v2.5-free', 'nemotron-3-ultra-free', 'north-mini-code-free',
    ])
    expect(models.every((model) => model.isFree && model.priceState === 'free' && model.authRequired === false)).toBe(true)
  })

  it('uses live OpenCode prices instead of the public fallback price mode', () => {
    const model = modelFromOpenCode({ ...provider, providerId: 'opencode', priceMode: 'free' }, {
      id: 'paid-model', providerID: 'opencode', name: 'Paid model', cost: [{ input: 1, output: 2 }], limit: { context: 128000 },
    })
    expect(model).toMatchObject({ isFree: false, priceState: 'paid' })
  })

  it('replaces the startup fallback with live OpenCode metadata', () => {
    const fallback = publicFreeModels({ ...provider, id: 'wetocode-free', providerId: 'opencode' }).find((model) => model.modelId === 'hy3-free')
    const live = modelFromOpenCode({ ...provider, id: 'wetocode-free', providerId: 'opencode' }, {
      id: 'hy3-free', providerID: 'opencode', name: 'Hy3 Free', family: 'hy3-free', enabled: true,
      capabilities: { tools: true, input: ['text'] }, cost: [{ input: 0, output: 0 }], limit: { context: 190000 },
    })
    expect(uniqueModels([fallback, live])).toEqual([expect.objectContaining({ displayName: 'Hy3 Free', contextWindow: 190000 })])
  })
})
