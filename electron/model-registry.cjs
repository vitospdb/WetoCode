const CACHE_TTL_MS = 5 * 60 * 1000

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function numberOrUndefined(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function priceState({ modelId, inputPrice, outputPrice, manualPriceMode, source }) {
  if (manualPriceMode === 'free') return { isFree: true, freeReason: '此模型由你的内部服务标记为免费。', priceState: 'free' }
  if (manualPriceMode === 'paid') return { isFree: false, freeReason: '', priceState: 'paid' }
  if (inputPrice === 0 && outputPrice === 0) return { isFree: true, freeReason: '服务目录返回的输入和输出价格均为 0。', priceState: 'free' }
  if (source === 'provider-api' && /(^|[/:_-])free($|[/:_-])/i.test(modelId)) {
    return { isFree: true, freeReason: '服务的官方模型标识包含 free。', priceState: 'free' }
  }
  if (inputPrice === undefined || outputPrice === undefined) return { isFree: false, freeReason: '', priceState: 'unknown' }
  return { isFree: false, freeReason: '', priceState: 'paid' }
}

function configuredModel(provider, now = Date.now(), availability = 'configured') {
  const inputPrice = numberOrUndefined(provider.inputPrice)
  const outputPrice = numberOrUndefined(provider.outputPrice)
  const pricing = priceState({
    modelId: cleanText(provider.model),
    inputPrice,
    outputPrice,
    manualPriceMode: provider.priceMode,
    source: 'configured',
  })
  return {
    id: `${provider.id}:${provider.model}`,
    configurationId: provider.id,
    modelId: cleanText(provider.model),
    providerId: cleanText(provider.providerId),
    providerName: cleanText(provider.name) || cleanText(provider.providerId),
    displayName: cleanText(provider.model),
    description: '已配置模型',
    inputPrice,
    outputPrice,
    ...pricing,
    contextWindow: Math.max(0, Number(provider.contextWindow) || 0),
    supportsTools: undefined,
    supportsVision: undefined,
    supportsReasoning: undefined,
    supportsStreaming: true,
    authRequired: provider.kind !== 'builtin' && !provider.hasApiKey && !isLoopbackUrl(provider.baseUrl),
    availability,
    latency: undefined,
    lastCheckedAt: now,
    source: 'configured',
    tags: ['已配置'],
  }
}

function modelFromOpenCode(provider, model, now = Date.now()) {
  const costs = Array.isArray(model.cost) ? model.cost : []
  const baseCost = costs.find((item) => !item.tier) || costs[0] || {}
  const inputPrice = numberOrUndefined(baseCost.input)
  const outputPrice = numberOrUndefined(baseCost.output)
  const input = Array.isArray(model.capabilities?.input) ? model.capabilities.input : []
  const pricing = priceState({ modelId: model.id, inputPrice, outputPrice, manualPriceMode: provider.priceMode, source: 'opencode' })
  return {
    id: `${provider.id}:${model.id}`,
    configurationId: provider.id,
    modelId: cleanText(model.id),
    providerId: cleanText(model.providerID || provider.providerId),
    providerName: cleanText(provider.name) || cleanText(provider.providerId),
    displayName: cleanText(model.name) || cleanText(model.id),
    description: model.family ? `${model.family} 系列` : '来自 OpenCode 模型目录',
    inputPrice,
    outputPrice,
    ...pricing,
    contextWindow: Math.max(0, Number(model.limit?.context) || 0),
    supportsTools: Boolean(model.capabilities?.tools),
    supportsVision: input.includes('image'),
    supportsReasoning: undefined,
    supportsStreaming: true,
    authRequired: provider.kind !== 'builtin' && !provider.hasApiKey && !isLoopbackUrl(provider.baseUrl),
    availability: model.enabled === false ? 'unavailable' : 'connected',
    latency: undefined,
    lastCheckedAt: now,
    source: 'opencode',
    tags: [model.status === 'deprecated' ? '已弃用' : 'OpenCode'],
  }
}

function modelFromOpenAI(provider, model, now = Date.now()) {
  const modelId = cleanText(model?.id || model)
  const pricing = priceState({ modelId, manualPriceMode: provider.priceMode, source: 'provider-api' })
  return {
    id: `${provider.id}:${modelId}`,
    configurationId: provider.id,
    modelId,
    providerId: cleanText(provider.providerId),
    providerName: cleanText(provider.name) || cleanText(provider.providerId),
    displayName: cleanText(model?.name) || modelId,
    description: '来自已连接服务的模型列表',
    inputPrice: undefined,
    outputPrice: undefined,
    ...pricing,
    contextWindow: Math.max(0, Number(model?.context_window || model?.contextWindow) || 0),
    supportsTools: undefined,
    supportsVision: undefined,
    supportsReasoning: undefined,
    supportsStreaming: true,
    authRequired: provider.kind !== 'builtin' && !provider.hasApiKey && !isLoopbackUrl(provider.baseUrl),
    availability: 'connected',
    latency: undefined,
    lastCheckedAt: now,
    source: 'provider-api',
    tags: ['已连接服务'],
  }
}

function isLoopbackUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
  } catch {
    return false
  }
}

function uniqueModels(models) {
  const byId = new Map()
  for (const model of models) {
    if (!model?.id || !model.modelId) continue
    const previous = byId.get(model.id)
    if (!previous || (previous.source === 'configured' && model.source !== 'configured')) byId.set(model.id, model)
  }
  return [...byId.values()].sort((left, right) => left.providerName.localeCompare(right.providerName, 'zh-CN') || left.displayName.localeCompare(right.displayName, 'zh-CN'))
}

async function discoverOpenAICompatibleModels(provider, apiKey, fetchRequest = fetch) {
  if (provider.protocol !== 'openai-compatible' || !cleanText(provider.baseUrl)) return []
  const url = `${cleanText(provider.baseUrl).replace(/\/+$/, '')}/models`
  const headers = apiKey ? { authorization: `Bearer ${apiKey}` } : {}
  const response = await fetchRequest(url, { headers, signal: AbortSignal.timeout(12_000) })
  if (!response.ok) throw new Error(`模型列表请求失败 (HTTP ${response.status})。`)
  const body = await response.json()
  if (!Array.isArray(body?.data)) throw new Error('模型服务返回的列表格式无效。')
  return body.data.filter((item) => cleanText(item?.id || item))
}

module.exports = {
  CACHE_TTL_MS,
  configuredModel,
  discoverOpenAICompatibleModels,
  isLoopbackUrl,
  modelFromOpenAI,
  modelFromOpenCode,
  priceState,
  uniqueModels,
}
