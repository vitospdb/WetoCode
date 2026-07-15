const PROVIDER_PROTOCOLS = ['openai-compatible', 'anthropic', 'google']

function normalizeProviderProtocol(value, providerId = '') {
  if (PROVIDER_PROTOCOLS.includes(value)) return value
  if (providerId === 'anthropic') return 'anthropic'
  if (providerId === 'google') return 'google'
  return 'openai-compatible'
}

function providerPackage(protocol) {
  const normalized = normalizeProviderProtocol(protocol)
  if (normalized === 'anthropic') return '@ai-sdk/anthropic'
  if (normalized === 'google') return '@ai-sdk/google'
  return '@ai-sdk/openai-compatible'
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function assertProviderUrl(value) {
  const baseUrl = normalizeBaseUrl(value)
  try {
    const url = new URL(baseUrl)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
  } catch {
    throw new Error('API 地址必须是有效的 HTTP(S) URL。')
  }
  return baseUrl
}

function isLoopbackUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
  } catch {
    return false
  }
}

function connectionRequest(provider, apiKey) {
  const protocol = normalizeProviderProtocol(provider.protocol, provider.providerId)
  const baseUrl = assertProviderUrl(provider.baseUrl)
  const model = String(provider.model || '').trim()
  if (!model) throw new Error('请先填写模型 ID。')
  if (!apiKey && !isLoopbackUrl(baseUrl)) throw new Error('请先填写 API Key 或 API Password。')

  const headers = { 'content-type': 'application/json' }
  if (protocol === 'anthropic') {
    if (apiKey) headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
    return {
      url: `${baseUrl}/messages`,
      options: {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'Reply OK.' }] }),
      },
    }
  }

  if (protocol === 'google') {
    if (apiKey) headers['x-goog-api-key'] = apiKey
    return {
      url: `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
      options: {
        method: 'POST',
        headers,
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply OK.' }] }], generationConfig: { maxOutputTokens: 1 } }),
      },
    }
  }

  if (apiKey) headers.authorization = `Bearer ${apiKey}`
  return {
    url: `${baseUrl}/chat/completions`,
    options: {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'Reply OK.' }], stream: false }),
    },
  }
}

function remoteErrorMessage(value) {
  if (!value || typeof value !== 'object') return ''
  const error = value.error
  if (typeof error === 'string') return error
  if (error && typeof error.message === 'string') return error.message
  if (typeof value.message === 'string') return value.message
  return ''
}

async function testProviderConnection(provider, apiKey, fetchRequest = fetch) {
  const request = connectionRequest(provider, apiKey)
  const startedAt = Date.now()
  let response
  try {
    response = await fetchRequest(request.url, {
      ...request.options,
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new Error('连接超时，请检查 API 地址和网络。')
    throw new Error(`无法连接 API：${error instanceof Error ? error.message : '网络请求失败'}`)
  }

  let payload
  try { payload = await response.json() } catch { payload = undefined }
  if (!response.ok) {
    const detail = remoteErrorMessage(payload).replaceAll(String(apiKey || ''), '').slice(0, 240)
    throw new Error(`连接失败 (HTTP ${response.status})${detail ? `：${detail}` : '。请检查密钥、地址和模型 ID。'}`)
  }
  return {
    ok: true,
    status: response.status,
    latencyMs: Date.now() - startedAt,
    message: '连接成功，密钥、API 地址和模型 ID 均可用。',
  }
}

module.exports = {
  PROVIDER_PROTOCOLS,
  assertProviderUrl,
  connectionRequest,
  normalizeBaseUrl,
  normalizeProviderProtocol,
  providerPackage,
  testProviderConnection,
}
