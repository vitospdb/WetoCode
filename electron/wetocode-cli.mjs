#!/usr/bin/env node

import process from 'node:process'
import readline from 'node:readline/promises'

function argument(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const serviceUrl = argument('service-url')
const projectPath = argument('project', process.cwd())
const providerId = argument('provider')
const modelId = argument('model')
const providerName = argument('provider-name', modelId)
const version = argument('version', '0.0.0')
const publicFree = argument('public-free') === 'true'
const terminalTitle = 'WetoCode'
process.title = terminalTitle

if (!serviceUrl || !providerId || !modelId) {
  process.stderr.write('WetoCode CLI 启动参数不完整。\n')
  process.exit(2)
}

const colors = {
  green: '\x1b[38;5;78m',
  muted: '\x1b[90m',
  amber: '\x1b[38;5;214m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
}

function write(text = '') {
  process.stdout.write(text)
}

function line(text = '') {
  write(`${text}\r\n`)
}

function setTerminalTitle() {
  write(`\x1b]0;${terminalTitle}\x07`)
}

function cleanError(error) {
  return String(error?.message || error || '未知错误')
    .replace(/open\s?code/gi, '本地执行服务')
    .replace(/\s+/g, ' ')
    .trim()
}

function apiUrl(pathname) {
  const url = new URL(pathname, serviceUrl)
  url.searchParams.set('directory', projectPath)
  return url
}

async function api(pathname, options = {}) {
  const response = await fetch(apiUrl(pathname), {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-opencode-directory': encodeURIComponent(projectPath),
      ...(options.headers || {}),
    },
  })
  if (!response.ok) {
    const payload = await response.text().catch(() => '')
    throw new Error(payload || `本地执行服务返回 ${response.status}`)
  }
  if (response.status === 204) return undefined
  const text = await response.text()
  return text ? JSON.parse(text) : undefined
}

function parseEvents(buffer, onEvent) {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const blocks = normalized.split('\n\n')
  const remainder = blocks.pop() || ''
  for (const block of blocks) {
    const data = block.split('\n')
      .filter((entry) => entry.startsWith('data:'))
      .map((entry) => entry.replace(/^data:\s*/, ''))
      .join('\n')
    if (!data) continue
    try { onEvent(JSON.parse(data)) } catch {}
  }
  return remainder
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
const eventController = new AbortController()
let sessionId
let currentTurn
let stopping = false
let permissionQueue = Promise.resolve()
let eventReadyResolve
let eventReadyReject
const eventReady = new Promise((resolve, reject) => {
  eventReadyResolve = resolve
  eventReadyReject = reject
})

async function replyPermission(properties) {
  const patterns = Array.isArray(properties.patterns) ? properties.patterns.join('、') : ''
  line()
  line(`${colors.amber}需要确认：${properties.permission || '敏感操作'}${colors.reset}`)
  if (patterns) line(`${colors.muted}${patterns}${colors.reset}`)
  const answer = (await rl.question('允许？[1] 仅本次  [2] 本次会话  [3] 拒绝 > ')).trim()
  const reply = answer === '2' ? 'always' : answer === '1' ? 'once' : 'reject'
  await api(`/permission/${encodeURIComponent(properties.id)}/reply`, {
    method: 'POST',
    body: JSON.stringify({ reply }),
  })
  line(reply === 'reject' ? `${colors.red}已拒绝。${colors.reset}` : `${colors.green}已允许。${colors.reset}`)
}

function handleEvent(event) {
  const properties = event?.properties || {}
  if (event?.type === 'permission.asked' && properties.sessionID === sessionId) {
    permissionQueue = permissionQueue
      .then(() => replyPermission(properties))
      .catch((error) => line(`${colors.red}权限处理失败：${cleanError(error)}${colors.reset}`))
    return
  }
  if (!currentTurn || properties.sessionID !== currentTurn.sessionId) return
  if (event?.type === 'session.idle') {
    currentTurn.resolve()
    currentTurn = undefined
  } else if (event?.type === 'session.error') {
    currentTurn.reject(new Error(properties.error?.data?.message || properties.error?.message || '任务执行失败。'))
    currentTurn = undefined
  }
}

async function subscribe() {
  const response = await fetch(apiUrl('/event'), {
    headers: { 'x-opencode-directory': encodeURIComponent(projectPath) },
    signal: eventController.signal,
  })
  if (!response.ok || !response.body) throw new Error('无法连接本地事件流。')
  eventReadyResolve()
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (!stopping) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    buffer = parseEvents(buffer, handleEvent)
  }
}

async function createSession() {
  const session = await api('/session', {
    method: 'POST',
    body: JSON.stringify({
      title: `WetoCode CLI ${new Date().toLocaleString('zh-CN')}`,
      model: { id: modelId, providerID: providerId },
    }),
  })
  sessionId = session.id
  return sessionId
}

async function assistantResult() {
  const messages = await api(`/session/${encodeURIComponent(sessionId)}/message`)
  const assistant = [...(Array.isArray(messages) ? messages : [])].reverse()
    .find((message) => message.info?.role === 'assistant')
  if (!assistant) return { text: '', tools: [] }
  const text = assistant.parts
    .filter((part) => part.type === 'text' && !part.ignored)
    .map((part) => part.text)
    .join('\n')
    .trim()
  const tools = assistant.parts
    .filter((part) => part.type === 'tool' && part.state?.status === 'completed')
    .map((part) => part.state.title || part.tool)
  return { text, tools }
}

async function runPrompt(prompt) {
  await eventReady
  if (!sessionId) await createSession()
  const completed = new Promise((resolve, reject) => {
    currentTurn = { sessionId, resolve, reject }
  })
  await api(`/session/${encodeURIComponent(sessionId)}/prompt_async`, {
    method: 'POST',
    body: JSON.stringify({
      model: { providerID: providerId, modelID: modelId },
      system: '你正在 WetoCode CLI 中工作。始终使用简体中文，先理解项目再修改，并完成必要验证。',
      parts: [{ type: 'text', text: prompt }],
    }),
  })
  line(`${colors.muted}正在处理...${colors.reset}`)
  await Promise.race([
    completed,
    new Promise((_, reject) => setTimeout(() => reject(new Error('任务等待超时。')), 30 * 60 * 1000)),
  ])
  await permissionQueue
  const result = await assistantResult()
  for (const tool of result.tools) line(`${colors.muted}完成：${tool}${colors.reset}`)
  line(result.text || `${colors.muted}任务已完成，没有文本输出。${colors.reset}`)
}

function showHelp() {
  line('可直接输入开发任务，也可以使用以下命令：')
  line('  /help   查看帮助')
  line('  /new    新建会话')
  line('  /clear  清空终端显示')
  line('  /exit   退出 WetoCode CLI')
}

function showWelcome() {
  setTerminalTitle()
  line(`${colors.green}WetoCode CLI ${version}${colors.reset}`)
  line(`${colors.muted}项目：${projectPath}${colors.reset}`)
  line(`${colors.muted}模型：${providerName || modelId} · ${modelId}${colors.reset}`)
  if (publicFree) {
    line(`${colors.amber}公共试用额度由第三方服务提供，按公网 IP 统计；同一网络可能共享限额。${colors.reset}`)
    line(`${colors.muted}不使用 WetoCode 发布者的个人 API Key，服务可能限流或调整。${colors.reset}`)
  }
  line('输入 /help 查看命令。')
  line()
}

const eventLoop = subscribe().catch((error) => {
  eventReadyReject(error)
  if (!stopping) line(`${colors.red}事件连接失败：${cleanError(error)}${colors.reset}`)
})

process.on('SIGINT', async () => {
  if (sessionId && currentTurn) {
    await api(`/session/${encodeURIComponent(sessionId)}/abort`, { method: 'POST', body: '{}' }).catch(() => {})
    currentTurn.reject(new Error('任务已中止。'))
    currentTurn = undefined
    return
  }
  stopping = true
  eventController.abort()
  rl.close()
})

await eventReady.catch(() => {})
showWelcome()
while (!stopping) {
  let input
  try {
    input = (await rl.question(`${colors.green}WetoCode > ${colors.reset}`)).trim()
  } catch {
    break
  }
  if (!input) continue
  if (input === '/exit' || input === '/quit') break
  if (input === '/help') {
    showHelp()
    continue
  }
  if (input === '/clear') {
    write('\x1bc')
    showWelcome()
    continue
  }
  if (input === '/new') {
    sessionId = undefined
    line(`${colors.green}已新建会话。${colors.reset}`)
    continue
  }
  try {
    await runPrompt(input)
  } catch (error) {
    currentTurn = undefined
    line(`${colors.red}${cleanError(error)}${colors.reset}`)
  }
  line()
}

stopping = true
eventController.abort()
rl.close()
void eventLoop
