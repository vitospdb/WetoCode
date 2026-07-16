const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, nativeTheme, Notification, safeStorage, shell, Tray } = require('electron')
const { autoUpdater } = require('electron-updater')
const { execFile, spawn } = require('node:child_process')
const { createHash, randomUUID } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { promisify } = require('node:util')
const { normalizeAccessMode, permissionForAccessMode } = require('./access-mode.cjs')
const { enrichSessions, normalizeSessionMetadata, updateSessionMetadata } = require('./session-metadata.cjs')
const { DEFAULT_APPEARANCE, normalizeAppearance, updateAppearance } = require('./appearance.cjs')
const { countDiffLines, isSafeRelativePath, parseGitStatus } = require('./git-tools.cjs')
const { startOpencodeServer, stopChild } = require('./opencode-server.cjs')
const { MAX_ATTACHMENTS_BYTES, readAttachmentFile, readDataAttachment } = require('./attachment-tools.cjs')
const { createGoalState, goalBudgetReason, normalizeGoals, updateGoalState } = require('./goal-state.cjs')
const { emptyUsage, normalizeUsage, recordUsage, usageSummary } = require('./usage-stats.cjs')
const { nextRunAt, normalizeAutomations, normalizeSchedule } = require('./automation-state.cjs')
const { loopbackPreviewUrl, packagePreviewCommands, parsePreviewCommand, urlFromOutput } = require('./preview-tools.cjs')
const { assertProviderUrl, normalizeBaseUrl, normalizeProviderProtocol, providerPackage, testProviderConnection } = require('./provider-tools.cjs')
const { normalizeTerminalMode, terminalPtyInput } = require('./terminal-tools.cjs')
const { createTerminalBrandFilter } = require('./terminal-brand.cjs')

const execFileAsync = promisify(execFile)
const activeRuns = new Map()
const pendingPermissions = new Map()
const activeTerminals = new Map()
const pendingAttachments = new Map()
const taskHistory = new Map()
const agentServers = new Map()
const previewProcesses = new Map()
let sdkPromise
let residentTray
let isQuitting = false
let automationTimer
const hasSingleInstanceLock = app.requestSingleInstanceLock()
const updatesEnabled = process.env.WETOCODE_ENABLE_UPDATES === '1'

if (!hasSingleInstanceLock) app.quit()

const DEFAULT_SETTINGS = {
  recentProjects: [],
  providers: [
    {
      id: 'wetocode-free',
      name: '公共免费模型',
      providerId: 'opencode',
      model: 'mimo-v2.5-free',
      baseUrl: '',
      apiKeyEncrypted: '',
      kind: 'builtin',
      protocol: 'openai-compatible',
      contextWindow: 262144,
    },
  ],
  activeProviderId: 'wetocode-free',
  accessMode: 'auto',
  reasoningEffort: 'max',
  appearance: DEFAULT_APPEARANCE,
  context: {
    autoCompact: true,
    pruneToolOutput: true,
    preserveRecentTokens: 24000,
    reservedTokens: 16000,
  },
  autoUpdate: true,
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function sessionMetadataPath() {
  return path.join(app.getPath('userData'), 'session-metadata.json')
}

function usagePath() {
  return path.join(app.getPath('userData'), 'usage.json')
}

function readUsage() {
  try { return normalizeUsage(JSON.parse(fs.readFileSync(usagePath(), 'utf8'))) }
  catch { return emptyUsage() }
}

function writeUsage(usage) {
  const target = usagePath()
  const temporary = `${target}.tmp`
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(temporary, `${JSON.stringify(normalizeUsage(usage), null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, target)
}

function trackUsage(event) {
  writeUsage(recordUsage(readUsage(), event))
}

function automationsPath() {
  return path.join(app.getPath('userData'), 'automations.json')
}

function readAutomations() {
  try { return normalizeAutomations(JSON.parse(fs.readFileSync(automationsPath(), 'utf8'))) }
  catch { return [] }
}

function writeAutomations(automations) {
  const target = automationsPath()
  const temporary = `${target}.tmp`
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(temporary, `${JSON.stringify(normalizeAutomations(automations), null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, target)
}

function sendAutomations() {
  const automations = readAutomations()
  sendToRenderer('automation:changed', automations)
  updateResidentTray()
  return automations
}

function hasEnabledAutomations() {
  return readAutomations().some((item) => item.enabled)
}

function goalsPath() {
  return path.join(app.getPath('userData'), 'goals.json')
}

function readGoals() {
  try {
    return normalizeGoals(JSON.parse(fs.readFileSync(goalsPath(), 'utf8')))
  } catch {
    return {}
  }
}

function writeGoals(goals) {
  const target = goalsPath()
  const temporary = `${target}.tmp`
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(temporary, `${JSON.stringify(normalizeGoals(goals), null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, target)
}

function goalForSession(sessionId) {
  return sessionId ? readGoals()[sessionId] : undefined
}

function saveGoal(goal) {
  const goals = readGoals()
  goals[goal.sessionId] = goal
  writeGoals(goals)
  sendToRenderer('agent:event', { runId: runForSession(goal.sessionId)?.runId || '', type: 'goal', goal })
  sendTaskSnapshots()
  return goal
}

function checkpointsPath() {
  return path.join(app.getPath('userData'), 'git-checkpoints.json')
}

function worktreesPath() {
  return path.join(app.getPath('userData'), 'worktrees.json')
}

function readManagedWorktrees() {
  try {
    const parsed = JSON.parse(fs.readFileSync(worktreesPath(), 'utf8'))
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item.primaryPath === 'string' && typeof item.directory === 'string')
      : []
  } catch {
    return []
  }
}

function writeManagedWorktrees(worktrees) {
  const target = worktreesPath()
  const temporary = `${target}.tmp`
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(temporary, `${JSON.stringify(worktrees, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, target)
}

function readCheckpoints() {
  try {
    const parsed = JSON.parse(fs.readFileSync(checkpointsPath(), 'utf8'))
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.id === 'string' && typeof item.projectPath === 'string') : []
  } catch {
    return []
  }
}

function writeCheckpoints(checkpoints) {
  const target = checkpointsPath()
  const temporary = `${target}.tmp`
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(temporary, `${JSON.stringify(checkpoints, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, target)
}

function readSessionMetadata() {
  try {
    return normalizeSessionMetadata(JSON.parse(fs.readFileSync(sessionMetadataPath(), 'utf8')))
  } catch {
    return {}
  }
}

function writeSessionMetadata(metadata) {
  const target = sessionMetadataPath()
  const temporary = `${target}.tmp`
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(temporary, `${JSON.stringify(normalizeSessionMetadata(metadata), null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, target)
}

function readSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath(), 'utf8').replace(/^\uFEFF/, ''))
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      accessMode: normalizeAccessMode(saved.accessMode),
      reasoningEffort: ['off', 'high', 'max'].includes(saved.reasoningEffort) ? saved.reasoningEffort : 'max',
      appearance: normalizeAppearance(saved.appearance),
      context: { ...DEFAULT_SETTINGS.context, ...(saved.context || {}) },
      providers: Array.isArray(saved.providers) && saved.providers.length
        ? saved.providers.map((provider) => ({
            ...provider,
            name: provider.id === 'wetocode-free' ? '公共免费模型' : provider.name,
            protocol: normalizeProviderProtocol(provider.protocol, provider.providerId),
          }))
        : DEFAULT_SETTINGS.providers,
    }
  } catch {
    return structuredClone(DEFAULT_SETTINGS)
  }
}

function writeSettings(settings) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), { mode: 0o600 })
}

function isAuthorizedProject(settings, projectPath) {
  if (!projectPath) return false
  const resolved = path.resolve(projectPath)
  return settings.recentProjects.some((item) => path.resolve(item) === resolved)
    || readManagedWorktrees().some((item) => path.resolve(item.directory) === resolved)
}

function isPathInside(root, target) {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function primaryProjectPath(settings, projectPath) {
  const resolved = path.resolve(projectPath)
  const managed = readManagedWorktrees().find((item) => path.resolve(item.directory) === resolved)
  if (managed) return path.resolve(managed.primaryPath)
  if (settings.recentProjects.some((item) => path.resolve(item) === resolved)) return resolved
  return undefined
}

function isSecureStorageAvailable() {
  if (!safeStorage.isEncryptionAvailable()) return false
  if (process.platform !== 'linux') return true
  try {
    return safeStorage.getSelectedStorageBackend() !== 'basic_text'
  } catch {
    return false
  }
}

function encryptSecret(value) {
  if (!value) return ''
  if (!isSecureStorageAvailable()) {
    throw new Error('当前系统的安全密钥环不可用，WetoCode 未保存 API Key。请先解锁系统密钥环。')
  }
  return safeStorage.encryptString(value).toString('base64')
}

function decryptSecret(value) {
  if (!value || !isSecureStorageAvailable()) return ''
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch {
    return ''
  }
}

function sanitizeSettings(settings) {
  return {
    ...settings,
    providers: settings.providers.map(({ apiKeyEncrypted, ...provider }) => ({
      ...provider,
      hasApiKey: Boolean(apiKeyEncrypted),
    })),
    security: {
      keyStorage: isSecureStorageAvailable() ? '系统密钥环加密' : '安全密钥环不可用',
    },
  }
}

function findOpenCode() {
  const executable = process.platform === 'win32' ? 'opencode.exe' : 'opencode'
  // opencode-ai intentionally uses this cross-platform launcher name.
  const packageLauncher = 'opencode.exe'
  const candidates = [
    process.env.OPENCODE_BIN,
    path.join(process.resourcesPath || '', 'bin', packageLauncher),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'node_modules', 'opencode-ai', 'bin', packageLauncher),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'node_modules', '.bin', executable),
    path.join(app.getAppPath(), 'node_modules', 'opencode-ai', 'bin', packageLauncher),
    path.join(app.getAppPath(), 'node_modules', '.bin', executable),
    path.join(process.env.HOME || '', '.opencode', 'bin', executable),
    executable,
  ].filter(Boolean)
  return candidates.find((candidate) => candidate === executable || fs.existsSync(candidate)) || executable
}

function developmentInstructions(profile = 'standard') {
  const accessRule = profile === 'full'
    ? '用户已明确授权访问项目外目录、敏感配置文件并执行本机命令。不可逆操作前先说明影响和恢复方式；不得擅自向公网发送项目代码或业务数据。'
    : '未经明确授权，不访问项目目录外文件，不向公网发送项目代码或业务数据，不执行不可逆命令。'
  const profileRule = profile === 'full'
    ? '当前为完全控制模式：用户已授权访问项目外目录、敏感配置文件并执行命令。仍需避免无关改动，执行不可逆操作前清楚说明影响。'
    : profile === 'plan'
    ? '当前为计划模式：只分析代码、澄清风险并给出可执行计划，不修改文件。用户切换到其他模式后才能实施。'
    : profile === 'confirm'
    ? '当前为变更前确认模式：修改文件或执行命令前必须等待用户确认。'
    : profile === 'strict'
    ? '当前为严格合规模式：涉及数据库结构、资金交易、客户数据或外部网络的变更，只分析影响面、回滚方案与验证方法，不执行变更。'
    : '当前为标准研发模式：小范围可逆修改可直接完成；高风险操作必须停止执行并清楚说明原因。'

  return [
    '你是 WetoCode，更符合中国开发者使用习惯的中文桌面 Coding Agent。',
    '始终使用简体中文交流；代码、协议字段和行业通用缩写保持原文。',
    '先理解现有代码和约束，再做最小必要修改，并运行与风险相称的验证。',
    '严禁在回复、日志、补丁或测试数据中暴露 API Key、口令、身份证号、支付账号、手机号等敏感信息。',
    '处理用户或业务样例时使用明显虚构且脱敏的数据。不得绕过认证、审计、权限控制和幂等约束。',
    '涉及数据一致性或关键业务流程时，明确精度、时区、并发、幂等、审计轨迹和失败补偿。',
    'SQL 默认使用参数化查询；数据库变更必须考虑兼容发布、数据回填和回滚。',
    accessRule,
    profileRule,
  ].join('\n')
}

function ensureDevelopmentInstructions(profile) {
  const rulesDirectory = path.join(app.getPath('userData'), 'rules')
  const rulesPath = path.join(rulesDirectory, 'development-safety.md')
  fs.mkdirSync(rulesDirectory, { recursive: true })
  fs.rmSync(path.join(rulesDirectory, 'bank-coding.md'), { force: true })
  fs.writeFileSync(rulesPath, `${developmentInstructions(profile)}\n`, { mode: 0o600 })
  return rulesPath
}

function customProviderConfig(provider, settings) {
  const config = {
    model: `${provider.providerId}/${provider.model}`,
    instructions: [ensureDevelopmentInstructions(settings.accessMode === 'full' ? 'full' : settings.accessMode === 'plan' ? 'plan' : settings.accessMode === 'confirm' ? 'confirm' : settings.complianceProfile || 'standard')],
    share: 'disabled',
    autoupdate: false,
    compaction: {
      auto: settings.context.autoCompact,
      prune: settings.context.pruneToolOutput,
      preserve_recent_tokens: settings.context.preserveRecentTokens,
      reserved: settings.context.reservedTokens,
    },
    permission: permissionForAccessMode(settings.accessMode),
  }

  const secret = decryptSecret(provider.apiKeyEncrypted)
  if (provider.kind === 'custom') {
    config.provider = {
      [provider.providerId]: {
        name: provider.name,
        npm: providerPackage(provider.protocol),
        options: {
          apiKey: secret,
          baseURL: normalizeBaseUrl(provider.baseUrl),
        },
        models: {
          [provider.model]: {
            name: provider.model,
            limit: {
              context: Number(provider.contextWindow) || 128000,
              output: Math.min(Number(provider.outputLimit) || 16384, Number(provider.contextWindow) || 128000),
            },
          },
        },
      },
    }
  } else if (secret) {
    config.provider = {
      [provider.providerId]: {
        options: { apiKey: secret },
      },
    }
  }
  return config
}

function runSystemPrompt(settings, goal) {
  const effort = settings.reasoningEffort === 'off'
    ? '推理强度为快速：直接处理明确任务，避免不必要的展开。'
    : settings.reasoningEffort === 'high'
    ? '推理强度为深入：在速度与严谨性之间平衡，检查关键假设。'
    : '推理强度为最高：复杂问题先充分分析依赖、风险和验证证据，再行动。'
  const plan = settings.accessMode === 'plan' ? '当前是计划模式。不得修改文件；输出可供用户确认的具体实施与验证计划。' : ''
  const contract = goal ? [
    '当前任务由 WetoCode Goal Loop 控制。',
    `唯一目标：${goal.objective}`,
    `这是第 ${goal.iteration} 轮，最多 ${goal.limits.maxIterations} 轮。`,
    '围绕目标持续推进，必须实际检查并运行与目标相关的验证。不要仅凭主观判断宣布完成。',
  ].join('\n') : ''
  return [effort, plan, contract].filter(Boolean).join('\n\n')
}

function sendToRenderer(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => window.webContents.send(channel, payload))
}

function sendTaskSnapshots() {
  sendToRenderer('agent:tasks-changed', backgroundTasks())
  updateResidentTray()
}

function mainWindowIsVisible() {
  return BrowserWindow.getAllWindows().some((window) => window.isVisible() && !window.isMinimized())
}

function notifyBackgroundTask(title, body) {
  if (isQuitting || mainWindowIsVisible() || !Notification.isSupported()) return
  try {
    const notification = new Notification({ title, body, silent: false })
    notification.on('click', showMainWindow)
    notification.show()
  } catch (error) {
    console.warn('[WetoCode] 无法显示系统通知：', agentErrorMessage(error))
  }
}

function taskSnapshot(task) {
  const permission = [...pendingPermissions.values()].find((item) => item.runId === task.runId)
  return {
    runId: task.runId,
    sessionId: task.sessionId,
    projectPath: task.projectPath,
    title: task.title || '未命名任务',
    provider: task.provider || '',
    status: task.status || 'running',
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    code: task.code,
    signal: task.signal,
    message: task.error,
    goal: task.goal || goalForSession(task.sessionId),
    permission: permission ? {
      id: permission.id,
      runId: permission.runId,
      sessionId: permission.sessionId,
      permission: permission.permission,
      patterns: permission.patterns,
      always: permission.always,
      metadata: permission.metadata,
    } : undefined,
  }
}

function backgroundTasks() {
  return [...activeRuns.values(), ...taskHistory.values()]
    .map(taskSnapshot)
    .sort((left, right) => (right.completedAt || right.startedAt) - (left.completedAt || left.startedAt))
    .slice(0, 30)
}

function showMainWindow() {
  const window = BrowserWindow.getAllWindows()[0] || createWindow()
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
  return window
}

function trayIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#20855c"/><path d="M6 9l4 14 6-9 6 9 4-14" fill="none" stroke="white" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
}

function stopAllRuns() {
  for (const run of [...activeRuns.values()]) {
    run.service.client.session.abort({ sessionID: run.sessionId }).catch(() => {})
    finishRun(run, 0, 'aborted')
  }
}

function updateResidentTray() {
  if (!residentTray) return
  const running = activeRuns.size
  const scheduled = readAutomations().filter((item) => item.enabled).length
  residentTray.setToolTip(running || scheduled ? `WetoCode · ${running} 个任务运行中 · ${scheduled} 个计划已启用` : 'WetoCode')
  residentTray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 WetoCode', click: showMainWindow },
    ...(running ? [
      { label: `${running} 个任务正在运行`, enabled: false },
      { label: '停止所有任务', click: stopAllRuns },
    ] : []),
    ...(scheduled ? [{ label: `${scheduled} 个自动化计划已启用`, enabled: false }] : []),
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit() } },
  ]))
}

function ensureResidentTray() {
  if (residentTray) return residentTray
  try {
    residentTray = new Tray(trayIcon())
    residentTray.on('click', showMainWindow)
    updateResidentTray()
  } catch (error) {
    console.warn('[WetoCode] 无法创建系统托盘：', agentErrorMessage(error))
  }
  return residentTray
}

function sdk() {
  sdkPromise ||= import('@opencode-ai/sdk/v2/client')
  return sdkPromise
}

function resultData(result) {
  if (result?.error) throw new Error(result.error.message || result.error.data?.message || JSON.stringify(result.error))
  return result?.data ?? result
}

function agentErrorMessage(error) {
  if (!error) return '本地执行服务发生未知错误。'
  return error.message || error.data?.message || error.name || JSON.stringify(error)
}

function serverSignature(projectPath, provider, config) {
  return createHash('sha256').update(JSON.stringify({
    binary: findOpenCode(),
    projectPath: path.resolve(projectPath),
    provider: { id: provider.id, providerId: provider.providerId, model: provider.model },
    config,
  })).digest('hex')
}

function runForSession(sessionId) {
  return [...activeRuns.values()].find((run) => run.sessionId === sessionId)
}

function finishRun(run, code = 0, signal) {
  if (!run || !activeRuns.has(run.runId)) return
  activeRuns.delete(run.runId)
  for (const [permissionId, permission] of pendingPermissions) {
    if (permission.runId === run.runId) pendingPermissions.delete(permissionId)
  }
  run.completedAt = Date.now()
  run.code = code
  run.signal = signal
  run.status = signal === 'aborted' ? 'aborted' : signal === 'budget_limited' ? 'budget_limited' : code === 0 ? 'completed' : 'error'
  trackUsage({ at: run.completedAt, model: `${run.providerId}/${run.modelId}`, completed: run.status === 'completed' ? 1 : 0, failed: run.status === 'error' ? 1 : 0 })
  if (run.goal && run.status === 'error') {
    run.goal = saveGoal(updateGoalState(run.goal, { status: 'failed', nextAction: run.error || '本轮执行失败，可恢复后重试。' }))
  } else if (run.goal && run.status === 'aborted' && run.goal.status === 'active') {
    run.goal = saveGoal(updateGoalState(run.goal, { status: 'paused', nextAction: '目标已由用户暂停。' }))
  }
  taskHistory.set(run.runId, {
    runId: run.runId,
    sessionId: run.sessionId,
    projectPath: run.projectPath,
    title: run.title,
    provider: run.provider,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    code: run.code,
    signal: run.signal,
    error: run.error,
    automationId: run.automationId,
  })
  const retained = [...taskHistory.values()]
    .sort((left, right) => (right.completedAt || 0) - (left.completedAt || 0))
    .slice(30)
  retained.forEach((task) => taskHistory.delete(task.runId))
  sendToRenderer('agent:event', { runId: run.runId, type: 'finished', code, signal })
  if (run.automationId) finishAutomationRun(run)
  sendTaskSnapshots()
  const label = run.status === 'completed' ? '任务已完成' : run.status === 'budget_limited' ? '目标预算已用尽' : run.status === 'aborted' ? '任务已停止' : '任务执行失败'
  notifyBackgroundTask(`WetoCode · ${label}`, run.title)
}

function verificationResult(text) {
  const source = String(text || '').trim()
  const match = source.match(/\{[\s\S]*\}/)
  if (!match) return { result: 'continue', summary: source.slice(0, 2000) || '校验器没有返回结构化结论。' }
  try {
    const parsed = JSON.parse(match[0])
    return {
      result: parsed.result === 'complete' ? 'complete' : 'continue',
      summary: String(parsed.summary || parsed.reason || '').slice(0, 2000),
      nextAction: String(parsed.nextAction || '').slice(0, 2000),
    }
  } catch {
    return { result: 'continue', summary: source.slice(0, 2000) || '校验结论无法解析。' }
  }
}

async function goalEvidence(run) {
  try {
    const messages = resultData(await run.service.client.session.messages({ sessionID: run.sessionId }))
    const lines = (Array.isArray(messages) ? messages : []).slice(-24).flatMap((message) => {
      const role = message.info?.role === 'assistant' ? 'Agent' : 'User'
      const parts = (message.parts || []).flatMap((part) => {
        if (part.type === 'text' && part.text) return [String(part.text).slice(0, 5000)]
        if (part.type === 'tool') {
          const state = part.state || {}
          return [`[tool ${part.tool || 'unknown'} ${state.status || 'unknown'}] ${state.title || ''}\n${String(state.output || state.error || '').slice(0, 3000)}`]
        }
        return []
      })
      return parts.length ? [`${role}:\n${parts.join('\n')}`] : []
    })
    return lines.join('\n\n').slice(-48_000)
  } catch (error) {
    return `无法读取父会话证据：${agentErrorMessage(error)}`
  }
}

async function verifyGoalIteration(run) {
  let verifier
  try {
    const evidence = await goalEvidence(run)
    verifier = resultData(await run.service.client.session.create({ parentID: run.sessionId, title: `目标校验 #${run.goal.iteration}` }))
    const response = resultData(await run.service.client.session.prompt({
      sessionID: verifier.id,
      model: { providerID: run.providerId, modelID: run.modelId },
      system: [
        '你是独立的工程目标校验器，不是任务执行者。',
        '根据父会话轨迹和当前项目文件，只在有充分证据时判定 complete；任何不确定、测试缺失或目标仍有遗漏都判定 continue。',
        '只输出 JSON：{"result":"complete|continue","summary":"证据摘要","nextAction":"未完成时的具体下一步"}。',
      ].join('\n'),
      tools: { edit: false, write: false, patch: false, bash: false, task: false, webfetch: false },
      parts: [{ type: 'text', text: `校验目标是否已经完整达成：\n${run.goal.objective}\n\n父会话最近的执行证据：\n${evidence}` }],
    }))
    return verificationResult((response?.parts || []).filter((part) => part.type === 'text').map((part) => part.text).join('\n'))
  } finally {
    if (verifier?.id) run.service.client.session.delete({ sessionID: verifier.id }).catch(() => {})
  }
}

async function advanceGoal(run) {
  if (!run.goal || run.verifying || !activeRuns.has(run.runId)) return
  run.verifying = true
  run.status = 'running'
  sendTaskSnapshots()
  let verdict
  try {
    verdict = await verifyGoalIteration(run)
  } catch (error) {
    verdict = { result: 'continue', summary: `独立校验失败，按未完成处理：${agentErrorMessage(error)}`, nextAction: '重新检查当前状态并补齐验证。' }
  }
  if (!activeRuns.has(run.runId)) return
  const timeline = [...run.goal.timeline, {
    id: randomUUID(), at: Date.now(), iteration: run.goal.iteration,
    result: verdict.result, summary: verdict.summary,
  }]
  run.goal = updateGoalState(run.goal, {
    timeline,
    nextAction: verdict.nextAction || verdict.summary,
    status: verdict.result === 'complete' ? 'complete' : 'active',
  })
  if (verdict.result === 'complete') {
    run.goal = saveGoal(run.goal)
    sendToRenderer('agent:event', { runId: run.runId, type: 'goal', goal: run.goal })
    finishRun(run, 0)
    return
  }
  const budgetReason = goalBudgetReason(run.goal)
  if (budgetReason) {
    const labels = { iteration: '最大迭代轮次', tokens: 'Token 预算', time: '运行时长预算' }
    run.goal = saveGoal(updateGoalState(run.goal, { status: 'budget_limited', nextAction: `${labels[budgetReason]}已用尽。${run.goal.nextAction}` }))
    sendToRenderer('agent:event', { runId: run.runId, type: 'goal', goal: run.goal })
    finishRun(run, 0, 'budget_limited')
    return
  }
  run.goal = saveGoal(updateGoalState(run.goal, { iteration: run.goal.iteration + 1 }))
  run.verifying = false
  run.assistantMessageIds.clear()
  run.textPartIds.clear()
  sendToRenderer('agent:event', { runId: run.runId, type: 'goal', goal: run.goal })
  try {
    resultData(await run.service.client.session.promptAsync({
      sessionID: run.sessionId,
      model: { providerID: run.providerId, modelID: run.modelId },
      system: runSystemPrompt(run.settings, run.goal),
      parts: [{ type: 'text', text: `目标校验尚未通过。继续第 ${run.goal.iteration} 轮，优先处理：${run.goal.nextAction}` }],
    }))
  } catch (error) {
    run.error = agentErrorMessage(error)
    sendToRenderer('agent:event', { runId: run.runId, type: 'error', message: run.error })
    finishRun(run, 1)
  }
}

function relayServerEvent(service, event) {
  const properties = event?.properties || event?.data || {}
  if (process.env.WETOCODE_DEBUG_EVENTS === '1' && String(event?.type || '').startsWith('message.')) {
    console.log('[WetoCode event]', JSON.stringify({
      type: event.type,
      sessionID: properties.sessionID,
      info: properties.info && { id: properties.info.id, role: properties.info.role },
      part: properties.part && { id: properties.part.id, messageID: properties.part.messageID, type: properties.part.type, text: properties.part.text },
      partID: properties.partID,
      field: properties.field,
      delta: properties.delta,
    }))
  }
  if (event.type === 'pty.exited') {
    const terminal = activeTerminals.get(properties.id)
    if (terminal) {
      terminal.pty = { ...terminal.pty, status: 'exited', exitCode: properties.exitCode }
      sendToRenderer('terminal:event', { ptyId: properties.id, type: 'exit', exitCode: properties.exitCode })
    }
    return
  }
  const part = properties.part
  const sessionId = properties.sessionID || part?.sessionID
  const run = sessionId ? runForSession(sessionId) : undefined
  if (!run) return

  if (event.type === 'message.updated' && properties.info?.role === 'assistant') {
    run.assistantMessageIds.add(properties.info.id)
    return
  }

  if (event.type === 'message.part.delta' && properties.field === 'text' && properties.delta && run.textPartIds.has(properties.partID)) {
    sendToRenderer('agent:event', {
      runId: run.runId,
      type: 'opencode',
      event: { type: 'text', textMode: 'delta', sessionID: sessionId, part: { id: properties.partID, type: 'text', text: properties.delta } },
    })
  } else if (event.type === 'message.part.updated' && part?.type === 'text' && run.assistantMessageIds.has(part.messageID)) {
    run.textPartIds.add(part.id)
    sendToRenderer('agent:event', {
      runId: run.runId,
      type: 'opencode',
      event: { type: 'text', textMode: 'snapshot', sessionID: sessionId, part },
    })
  } else if (event.type === 'message.part.updated' && part?.type === 'tool') {
    if (part.state?.status === 'completed' && !run.completedToolPartIds.has(part.id)) {
      run.completedToolPartIds.add(part.id)
      if (run.goal) run.goal.toolCalls += 1
      trackUsage({ model: `${run.providerId}/${run.modelId}`, toolCalls: 1 })
    }
    sendToRenderer('agent:event', { runId: run.runId, type: 'opencode', event: { type: 'tool_use', sessionID: sessionId, part } })
  } else if (event.type === 'message.part.updated' && part?.type === 'step-finish') {
    if (!run.completedStepPartIds.has(part.id)) {
      run.completedStepPartIds.add(part.id)
      const tokens = Number(part.tokens?.total) || 0
      if (run.goal) run.goal.tokenUsage += tokens
      trackUsage({ model: `${run.providerId}/${run.modelId}`, tokens, messages: 1 })
    }
    sendToRenderer('agent:event', { runId: run.runId, type: 'opencode', event: { type: 'step_finish', sessionID: sessionId, part } })
  } else if (event.type === 'permission.asked') {
    const request = {
      id: properties.id,
      runId: run.runId,
      sessionId,
      permission: properties.permission || 'unknown',
      patterns: Array.isArray(properties.patterns) ? properties.patterns : [],
      always: Array.isArray(properties.always) ? properties.always : [],
      metadata: properties.metadata || {},
    }
    pendingPermissions.set(request.id, { ...request, service })
    run.status = 'waiting_permission'
    sendToRenderer('agent:event', { runId: run.runId, type: 'permission', permission: request })
    sendTaskSnapshots()
    notifyBackgroundTask('WetoCode · 等待授权', `“${run.title}”需要你的确认`)
  } else if (event.type === 'session.error') {
    run.error = agentErrorMessage(properties.error)
    sendToRenderer('agent:event', { runId: run.runId, type: 'error', message: run.error })
    finishRun(run, 1)
  } else if (event.type === 'session.idle') {
    if (run.goal?.status === 'active') void advanceGoal(run)
    else finishRun(run, 0)
  }
}

async function websocketText(data) {
  if (typeof data === 'string') return data
  if (Buffer.isBuffer(data)) return data.toString()
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString()
  if (typeof data?.arrayBuffer === 'function') return Buffer.from(await data.arrayBuffer()).toString()
  return String(data ?? '')
}

function closeTerminal(ptyId, remove = true) {
  const terminal = activeTerminals.get(ptyId)
  if (!terminal) return false
  activeTerminals.delete(ptyId)
  try { terminal.socket.close() } catch {}
  if (remove) terminal.service.client.pty.remove({ ptyID: ptyId }).catch(() => {})
  return true
}

function stopAgentServer(service) {
  if (!service) {
    for (const runningService of [...agentServers.values()]) stopAgentServer(runningService)
    return
  }
  for (const [ptyId, terminal] of activeTerminals) {
    if (terminal.service !== service) continue
    activeTerminals.delete(ptyId)
    try { terminal.socket.close() } catch {}
    sendToRenderer('terminal:event', { ptyId, type: 'exit', exitCode: -1 })
  }
  service.controller.abort()
  stopChild(service.child)
  if (agentServers.get(service.signature) === service) agentServers.delete(service.signature)
}

function trimAgentServers(limit = 5) {
  const idle = [...agentServers.values()]
    .filter((service) => ![...activeRuns.values()].some((run) => run.service === service) && ![...activeTerminals.values()].some((terminal) => terminal.service === service))
    .sort((left, right) => (left.lastUsed || 0) - (right.lastUsed || 0))
  while (agentServers.size >= limit && idle.length) stopAgentServer(idle.shift())
}

async function startAgentProcess(options) {
  let lastError
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await startOpencodeServer(options)
    } catch (error) {
      lastError = error
      if (!String(error?.message || error).toLowerCase().includes('database is locked') || attempt === 2) throw error
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)))
    }
  }
  throw lastError
}

async function ensureAgentServer(projectPath, provider, config) {
  const signature = serverSignature(projectPath, provider, config)
  const existing = agentServers.get(signature)
  if (existing?.child.exitCode === null) {
    existing.lastUsed = Date.now()
    return existing
  }
  if (existing) stopAgentServer(existing)
  trimAgentServers()

  const started = await startAgentProcess({
    binary: findOpenCode(),
    cwd: projectPath,
    env: {
      ...process.env,
      OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
      NO_COLOR: '1',
    },
  })
  const { createOpencodeClient } = await sdk()
  const client = createOpencodeClient({ baseUrl: started.url, directory: projectPath })
  const controller = new AbortController()
  const service = { ...started, client, controller, signature, projectPath, lastUsed: Date.now() }
  agentServers.set(signature, service)
  started.child.once('exit', (code, signal) => {
    if (agentServers.get(signature) === service) agentServers.delete(signature)
    for (const run of [...activeRuns.values()].filter((item) => item.service === service)) {
      run.error = `本地执行服务已退出（代码 ${code ?? signal ?? 'unknown'}）。`
      sendToRenderer('agent:event', { runId: run.runId, type: 'error', message: run.error })
      finishRun(run, typeof code === 'number' ? code : 1, signal)
    }
  })
  const subscription = await client.event.subscribe({}, { signal: controller.signal })
  service.events = (async () => {
    try {
      for await (const event of subscription.stream) relayServerEvent(service, event)
    } catch (error) {
      if (!controller.signal.aborted) {
        for (const run of [...activeRuns.values()].filter((item) => item.service === service)) {
          run.error = agentErrorMessage(error)
          sendToRenderer('agent:event', { runId: run.runId, type: 'error', message: run.error })
          finishRun(run, 1)
        }
      }
    }
  })()
  return service
}

async function opencodeVersion() {
  try {
    const { stdout } = await execFileAsync(findOpenCode(), ['--version'], { timeout: 5000 })
    return { installed: true, version: stdout.trim(), binary: findOpenCode() }
  } catch {
    return { installed: false, version: '', binary: findOpenCode() }
  }
}

function initialEngineState() {
  const binary = findOpenCode()
  const isBareCommand = binary === 'opencode' || binary === 'opencode.exe'
  return { installed: isBareCommand || fs.existsSync(binary), version: '', binary }
}

async function listSessions(projectPath) {
  if (!projectPath) return []
  try {
    const { stdout } = await execFileAsync(
      findOpenCode(),
      ['session', 'list', '--format', 'json', '--max-count', '200'],
      { cwd: projectPath, timeout: 10000 },
    )
    const sessions = JSON.parse(stdout)
    const resolvedProject = path.resolve(projectPath)
    return Array.isArray(sessions)
      ? enrichSessions(sessions.filter((session) => path.resolve(session.directory || '') === resolvedProject), readSessionMetadata())
      : []
  } catch {
    return []
  }
}

async function getSession(sessionId, projectPath) {
  if (!sessionId || !projectPath) return null
  if (isAuthorizedProject(readSettings(), projectPath)) {
    try {
      const settings = readSettings()
      const provider = settings.providers.find((item) => item.id === settings.activeProviderId) || settings.providers[0]
      if (provider) {
        const service = await ensureAgentServer(projectPath, provider, customProviderConfig(provider, settings))
        const sessionInfo = resultData(await service.client.session.get({ sessionID: sessionId }))
        const messagesResult = resultData(await service.client.session.messages({ sessionID: sessionId }))
        const sessionMessages = Array.isArray(messagesResult) ? messagesResult : messagesResult?.data
        if (path.resolve(sessionInfo?.directory || '') === path.resolve(projectPath) && Array.isArray(sessionMessages)) {
          return { info: sessionInfo, messages: sessionMessages }
        }
        console.warn(`[WetoCode] 本地服务返回的会话结构不完整：`, {
          sessionId,
          expectedDirectory: path.resolve(projectPath),
          actualDirectory: sessionInfo?.directory,
          messagesType: Array.isArray(messagesResult) ? 'array' : typeof messagesResult,
          nestedMessages: Array.isArray(messagesResult?.data),
        })
      }
    } catch (error) {
      console.warn(`[WetoCode] 无法通过本地服务读取会话 ${sessionId}，将尝试兼容导出：`, agentErrorMessage(error))
    }
  }
  try {
    const { stdout } = await execFileAsync(
      findOpenCode(),
      ['export', sessionId],
      { cwd: projectPath, timeout: 15000, maxBuffer: 20 * 1024 * 1024 },
    )
    const session = JSON.parse(stdout)
    return path.resolve(session?.info?.directory || '') === path.resolve(projectPath) ? session : null
  } catch {
    return null
  }
}

async function assertSessionAccess(sessionId, projectPath) {
  if (!isAuthorizedProject(readSettings(), projectPath)) throw new Error('该项目尚未授权。')
  const session = await getSession(sessionId, projectPath)
  if (!session) throw new Error('该会话不存在或不属于当前项目。')
  return session
}

function skillFrontmatter(filePath) {
  try {
    const source = fs.readFileSync(filePath, 'utf8').slice(0, 64 * 1024)
    const block = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)
    const field = (name) => block?.[1].match(new RegExp(`^${name}:\\s*["']?(.+?)["']?\\s*$`, 'm'))?.[1]?.trim() || ''
    return { name: field('name') || path.basename(path.dirname(filePath)), description: field('description') }
  } catch {
    return { name: path.basename(path.dirname(filePath)), description: '' }
  }
}

function findSkillFiles(projectPath) {
  const roots = [
    ['project', path.join(projectPath, '.opencode', 'skills')],
    ['project', path.join(projectPath, '.claude', 'skills')],
    ['project', path.join(projectPath, '.agents', 'skills')],
    ['user', path.join(app.getPath('home'), '.config', 'opencode', 'skills')],
    ['user', path.join(app.getPath('home'), '.claude', 'skills')],
    ['user', path.join(app.getPath('home'), '.agents', 'skills')],
  ]
  return roots.flatMap(([scope, root]) => {
    if (!fs.existsSync(root)) return []
    return fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => {
      const filePath = path.join(root, entry.name, 'SKILL.md')
      if (!fs.existsSync(filePath)) return []
      const metadata = skillFrontmatter(filePath)
      return [{ ...metadata, path: filePath, scope }]
    })
  })
}

async function extensionOverview(projectPath) {
  assertProjectRelativePath(projectPath, '')
  const service = await projectFileService(projectPath)
  const [commands, agents, mcp, lsp] = await Promise.all([
    service.client.command.list().then(resultData),
    service.client.app.agents().then(resultData),
    service.client.mcp.status().then(resultData),
    service.client.lsp.status().then(resultData),
  ])
  return {
    commands: (Array.isArray(commands) ? commands : []).map(({ name, description, template, agent, model }) => ({ name, description, template, agent, model })),
    agents: (Array.isArray(agents) ? agents : []).map((agent) => ({ name: agent.name, description: agent.description, mode: agent.mode, builtIn: agent.builtIn, model: agent.model ? `${agent.model.providerID}/${agent.model.modelID}` : undefined })),
    skills: findSkillFiles(projectPath),
    mcp: Object.entries(mcp || {}).map(([name, status]) => ({ name, status: status.status, error: status.error })),
    lsp: Array.isArray(lsp) ? lsp : [],
  }
}

async function runGit(projectPath, args, options = {}) {
  try {
    return await execFileAsync('git', args, {
      cwd: projectPath,
      timeout: options.timeout || 15000,
      maxBuffer: options.maxBuffer || 20 * 1024 * 1024,
      windowsHide: true,
      encoding: 'utf8',
    })
  } catch (error) {
    if (options.allowExitCodes?.includes(error.code)) return { stdout: error.stdout || '', stderr: error.stderr || '' }
    throw error
  }
}

async function gitStatus(projectPath) {
  const settings = readSettings()
  if (!isAuthorizedProject(settings, projectPath) || !fs.existsSync(projectPath)) throw new Error('该项目尚未授权。')
  try {
    const { stdout: root } = await runGit(projectPath, ['rev-parse', '--show-toplevel'])
    const repositoryRoot = path.resolve(root.trim())
    if (repositoryRoot !== path.resolve(projectPath)) {
      return { isRepository: false, reason: '当前目录不是独立 Git 仓库。', changes: [], checkpoints: [] }
    }
    const [{ stdout }, branchResult, headResult] = await Promise.all([
      runGit(projectPath, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
      runGit(projectPath, ['branch', '--show-current']).catch(() => ({ stdout: '' })),
      runGit(projectPath, ['rev-parse', '--short', 'HEAD']).catch(() => ({ stdout: '' })),
    ])
    const changes = parseGitStatus(stdout)
    return {
      isRepository: true,
      branch: branchResult.stdout.trim(),
      head: headResult.stdout.trim(),
      changes,
      checkpoints: readCheckpoints().filter((item) => path.resolve(item.projectPath) === path.resolve(projectPath)).sort((a, b) => b.createdAt - a.createdAt),
    }
  } catch {
    return { isRepository: false, reason: '当前项目尚未初始化 Git 仓库。', changes: [], checkpoints: [] }
  }
}

async function assertGitChange(projectPath, filePath) {
  if (!isSafeRelativePath(filePath)) throw new Error('文件路径无效。')
  const status = await gitStatus(projectPath)
  if (!status.isRepository) throw new Error(status.reason)
  const change = status.changes.find((item) => item.path === filePath)
  if (!change) throw new Error('该文件已不在变更列表中，请刷新后重试。')
  const resolved = path.resolve(projectPath, filePath)
  const relative = path.relative(path.resolve(projectPath), resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('文件路径超出项目范围。')
  return { change, resolved }
}

async function worktreeState(projectPath) {
  const settings = readSettings()
  const primaryPath = primaryProjectPath(settings, projectPath)
  if (!primaryPath) throw new Error('该项目尚未授权。')
  const status = await gitStatus(primaryPath)
  if (!status.isRepository) return { isRepository: false, primaryPath, activePath: path.resolve(projectPath), worktrees: [] }
  const managed = readManagedWorktrees().filter((item) => path.resolve(item.primaryPath) === primaryPath)
  const existing = []
  for (const item of managed) {
    if (!fs.existsSync(item.directory)) continue
    const branch = await runGit(item.directory, ['branch', '--show-current']).then((result) => result.stdout.trim()).catch(() => item.branch || '')
    const dirty = await runGit(item.directory, ['status', '--porcelain=v1']).then((result) => Boolean(result.stdout.trim())).catch(() => false)
    existing.push({ ...item, directory: path.resolve(item.directory), branch, dirty })
  }
  if (existing.length !== managed.length) {
    const retained = readManagedWorktrees().filter((item) => path.resolve(item.primaryPath) !== primaryPath)
    writeManagedWorktrees([...retained, ...existing.map(({ dirty: _dirty, ...item }) => item)])
  }
  return {
    isRepository: true,
    primaryPath,
    activePath: path.resolve(projectPath),
    primary: { name: path.basename(primaryPath), directory: primaryPath, branch: status.branch || '', dirty: status.changes.length > 0, primary: true },
    worktrees: existing,
  }
}

async function worktreeClient(primaryPath) {
  const settings = readSettings()
  const provider = settings.providers.find((item) => item.id === settings.activeProviderId) || settings.providers[0]
  if (!provider) throw new Error('请先配置可用模型。')
  return ensureAgentServer(primaryPath, provider, customProviderConfig(provider, settings))
}

function attachmentRecords(projectPath, attachmentIds) {
  const records = (Array.isArray(attachmentIds) ? attachmentIds : []).map((id) => {
    const record = pendingAttachments.get(id)
    if (!record || path.resolve(record.projectPath) !== path.resolve(projectPath)) throw new Error('附件已失效，请重新添加。')
    return record
  })
  if (records.reduce((sum, item) => sum + item.descriptor.size, 0) > MAX_ATTACHMENTS_BYTES) {
    throw new Error('单次附件总大小不能超过 30 MB。')
  }
  return records
}

function assertProjectRelativePath(projectPath, relativePath) {
  if (!isAuthorizedProject(readSettings(), projectPath)) throw new Error('该项目尚未授权。')
  const root = path.resolve(projectPath)
  const clean = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
  const target = path.resolve(root, clean || '.')
  if (!isPathInside(root, target)) throw new Error('文件路径超出当前项目。')
  const realRoot = fs.realpathSync.native(root)
  let existing = target
  while (!fs.existsSync(existing) && existing !== root) existing = path.dirname(existing)
  const realExisting = fs.realpathSync.native(existing)
  if (!isPathInside(realRoot, realExisting)) throw new Error('符号链接指向当前项目之外。')
  return { root, clean, target }
}

async function projectFileService(projectPath) {
  const settings = readSettings()
  const provider = settings.providers.find((item) => item.id === settings.activeProviderId) || settings.providers[0]
  if (!provider) throw new Error('请先配置可用模型。')
  return ensureAgentServer(projectPath, provider, customProviderConfig(provider, settings))
}

async function startAgentRun(request) {
  const settings = readSettings()
  const provider = settings.providers.find((item) => item.id === request.providerId)
    || settings.providers.find((item) => item.id === settings.activeProviderId)
    || settings.providers[0]
  if (!provider) throw new Error('请先配置可用模型。')
  if (!request.projectPath || !fs.existsSync(request.projectPath)) throw new Error('请先打开有效的项目目录。')
  if (!isAuthorizedProject(settings, request.projectPath)) throw new Error('该目录尚未通过项目选择器授权，请重新打开项目。')
  if (request.sessionId && !(await getSession(request.sessionId, request.projectPath))) throw new Error('该历史会话不属于当前项目，无法继续。')

  const attachments = attachmentRecords(request.projectPath, request.attachmentIds)
  if (!String(request.prompt || '').trim() && !attachments.length) throw new Error('请输入任务或添加附件。')
  const service = await ensureAgentServer(request.projectPath, provider, customProviderConfig(provider, settings))
  const runId = request.clientRunId || randomUUID()
  if (activeRuns.has(runId)) throw new Error('任务标识重复，请重新发送。')
  const session = request.sessionId
    ? { id: request.sessionId }
    : resultData(await service.client.session.create({ title: request.title || String(request.prompt).slice(0, 42) }))
  if (runForSession(session.id)) throw new Error('当前会话已有任务正在运行。')
  let goal = goalForSession(session.id)
  if (String(request.goalObjective || '').trim()) {
    goal = createGoalState({
      id: randomUUID(), sessionId: session.id, projectPath: request.projectPath,
      objective: request.goalObjective, limits: request.goalLimits,
    })
    saveGoal(goal)
  } else if (goal?.status === 'active') {
    goal = updateGoalState(goal, { nextAction: String(request.prompt || '').trim() || goal.nextAction })
    saveGoal(goal)
  } else {
    goal = undefined
  }
  const run = {
    runId,
    sessionId: session.id,
    service,
    projectPath: request.projectPath,
    title: String(request.title || request.prompt || '未命名任务').trim().slice(0, 120) || '未命名任务',
    provider: provider.name,
    providerId: provider.providerId,
    modelId: provider.model,
    settings,
    goal,
    automationId: request.automationId,
    startedAt: Date.now(),
    status: 'running',
    assistantMessageIds: new Set(),
    textPartIds: new Set(),
    completedToolPartIds: new Set(),
    completedStepPartIds: new Set(),
    verifying: false,
  }
  activeRuns.set(runId, run)
  trackUsage({ model: `${provider.providerId}/${provider.model}`, sessions: request.sessionId ? 0 : 1, messages: 1 })
  taskHistory.delete(runId)
  sendTaskSnapshots()
  sendToRenderer('agent:event', { runId, type: 'started', provider: provider.name })
  sendToRenderer('agent:event', { runId, type: 'session', sessionId: session.id })
  try {
    resultData(await service.client.session.promptAsync({
      sessionID: session.id,
      model: { providerID: provider.providerId, modelID: provider.model },
      system: runSystemPrompt(settings, goal),
      parts: [
        ...(String(request.prompt || '').trim() ? [{ type: 'text', text: String(request.prompt) }] : []),
        ...attachments.map((item) => item.part),
      ],
    }))
    attachments.forEach((item) => pendingAttachments.delete(item.id))
    return { runId, sessionId: session.id }
  } catch (error) {
    run.error = agentErrorMessage(error)
    sendToRenderer('agent:event', { runId, type: 'error', message: run.error })
    finishRun(run, 1)
    throw error
  }
}

function finishAutomationRun(run) {
  const automations = readAutomations()
  const index = automations.findIndex((item) => item.id === run.automationId)
  if (index < 0) return
  const automation = automations[index]
  const history = automation.history.map((item) => item.runId === run.runId ? {
    ...item,
    completedAt: run.completedAt,
    status: run.status,
    sessionId: run.sessionId,
    message: run.error,
  } : item)
  automations[index] = {
    ...automation,
    runningRunId: undefined,
    lastStatus: run.status,
    lastMessage: run.error,
    updatedAt: Date.now(),
    history,
  }
  writeAutomations(automations)
  sendAutomations()
}

async function runAutomation(automationId, scheduledAt = Date.now(), manual = false) {
  const automations = readAutomations()
  const index = automations.findIndex((item) => item.id === automationId)
  if (index < 0) throw new Error('自动化计划不存在。')
  const automation = automations[index]
  if (!manual && !automation.enabled) return undefined
  if (automation.runningRunId) return undefined
  if (!fs.existsSync(automation.projectPath) || !isAuthorizedProject(readSettings(), automation.projectPath)) {
    automations[index] = { ...automation, enabled: false, lastStatus: 'error', lastMessage: '项目目录不存在或授权已失效。', updatedAt: Date.now() }
    writeAutomations(automations)
    sendAutomations()
    return undefined
  }

  const runId = randomUUID()
  const startedAt = Date.now()
  const oneTime = automation.schedule.kind === 'once'
  const historyEntry = { id: randomUUID(), scheduledAt, startedAt, status: 'running', runId }
  automations[index] = {
    ...automation,
    enabled: oneTime && !manual ? false : automation.enabled,
    nextRunAt: manual ? automation.nextRunAt : oneTime ? undefined : nextRunAt(automation.schedule, startedAt),
    lastRunAt: startedAt,
    lastStatus: 'running',
    lastMessage: undefined,
    runningRunId: runId,
    updatedAt: startedAt,
    history: [historyEntry, ...automation.history].slice(0, 30),
  }
  writeAutomations(automations)
  sendAutomations()
  try {
    return await startAgentRun({
      clientRunId: runId,
      prompt: automation.prompt,
      projectPath: automation.projectPath,
      providerId: automation.providerId,
      title: `[自动化] ${automation.name}`,
      automationId: automation.id,
    })
  } catch (error) {
    const current = readAutomations()
    const currentIndex = current.findIndex((item) => item.id === automationId)
    if (currentIndex >= 0) {
      const item = current[currentIndex]
      current[currentIndex] = {
        ...item,
        runningRunId: undefined,
        lastStatus: 'error',
        lastMessage: agentErrorMessage(error),
        history: item.history.map((entry) => entry.runId === runId ? { ...entry, completedAt: Date.now(), status: 'error', message: agentErrorMessage(error) } : entry),
      }
      writeAutomations(current)
      sendAutomations()
    }
    notifyBackgroundTask('WetoCode · 自动化启动失败', automation.name)
    return undefined
  }
}

async function checkAutomations() {
  const now = Date.now()
  for (const automation of readAutomations()) {
    if (!automation.enabled || automation.runningRunId || !automation.nextRunAt || automation.nextRunAt > now) continue
    await runAutomation(automation.id, automation.nextRunAt)
  }
}

function startAutomationScheduler() {
  clearInterval(automationTimer)
  const recovered = readAutomations().map((item) => item.runningRunId && !activeRuns.has(item.runningRunId) ? {
    ...item,
    runningRunId: undefined,
    lastStatus: 'error',
    lastMessage: '上次运行随应用退出而中断。',
    nextRunAt: item.enabled && item.schedule.kind !== 'once' ? nextRunAt(item.schedule, Date.now()) : item.nextRunAt,
    history: item.history.map((entry) => entry.runId === item.runningRunId && entry.status === 'running'
      ? { ...entry, status: 'error', completedAt: Date.now(), message: '上次运行随应用退出而中断。' }
      : entry),
  } : item)
  writeAutomations(recovered)
  automationTimer = setInterval(() => void checkAutomations(), 15_000)
  automationTimer.unref?.()
  void checkAutomations()
  if (hasEnabledAutomations()) ensureResidentTray()
}

function previewKey(projectPath) {
  return path.resolve(projectPath)
}

function previewSnapshot(preview) {
  if (!preview) return undefined
  return {
    id: preview.id,
    projectPath: preview.projectPath,
    command: preview.command,
    status: preview.status,
    url: preview.url,
    startedAt: preview.startedAt,
    pid: preview.child?.pid,
    exitCode: preview.exitCode,
    message: preview.message,
    output: preview.output.slice(-120_000),
  }
}

function sendPreview(preview) {
  const snapshot = previewSnapshot(preview)
  sendToRenderer('preview:changed', snapshot)
  return snapshot
}

function previewSuggestions(projectPath) {
  const { root } = assertProjectRelativePath(projectPath, '')
  const packagePath = path.join(root, 'package.json')
  let commands = []
  try { commands = packagePreviewCommands(JSON.parse(fs.readFileSync(packagePath, 'utf8').replace(/^\uFEFF/, ''))) }
  catch {}
  if (fs.existsSync(path.join(root, 'manage.py'))) commands.push({ name: 'django', command: 'python manage.py runserver', description: 'Django 开发服务器' })
  if (fs.existsSync(path.join(root, 'Cargo.toml'))) commands.push({ name: 'cargo', command: 'cargo run', description: 'Rust 开发服务器' })
  if (fs.existsSync(path.join(root, 'go.mod'))) commands.push({ name: 'go', command: 'go run .', description: 'Go 应用' })
  return commands.slice(0, 10)
}

async function stopPreview(projectPath) {
  const key = previewKey(projectPath)
  const preview = previewProcesses.get(key)
  if (!preview) return false
  previewProcesses.delete(key)
  preview.stopping = true
  try {
    if (process.platform === 'win32' && preview.child?.pid) {
      await execFileAsync('taskkill.exe', ['/pid', String(preview.child.pid), '/t', '/f'], { windowsHide: true, timeout: 5000 }).catch(() => {})
    } else if (preview.child?.pid) {
      try { process.kill(-preview.child.pid, 'SIGTERM') } catch { preview.child.kill('SIGTERM') }
    }
  } catch {}
  sendToRenderer('preview:changed', { ...previewSnapshot(preview), status: 'stopped' })
  return true
}

function stopAllPreviews() {
  for (const preview of [...previewProcesses.values()]) void stopPreview(preview.projectPath)
}

async function startPreview(projectPath, input = {}) {
  const { root } = assertProjectRelativePath(projectPath, '')
  await stopPreview(root)
  const parsed = parsePreviewCommand(input.command)
  const preview = {
    id: randomUUID(),
    projectPath: root,
    command: String(input.command).trim(),
    status: 'starting',
    url: input.url ? loopbackPreviewUrl(input.url) : undefined,
    startedAt: Date.now(),
    output: '',
  }
  const child = spawn(parsed.command, parsed.args, {
    cwd: root,
    env: { ...process.env, BROWSER: 'none', NO_COLOR: '1', FORCE_COLOR: '0' },
    shell: false,
    windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  preview.child = child
  previewProcesses.set(previewKey(root), preview)
  const relay = (chunk) => {
    if (previewProcesses.get(previewKey(root)) !== preview) return
    const text = Buffer.from(chunk).toString('utf8')
    preview.output = `${preview.output}${text}`.slice(-200_000)
    const detected = urlFromOutput(text)
    if (detected) {
      preview.url = detected
      preview.status = 'running'
    }
    sendPreview(preview)
  }
  child.stdout.on('data', relay)
  child.stderr.on('data', relay)
  child.once('spawn', () => {
    if (preview.url) preview.status = 'running'
    sendPreview(preview)
  })
  child.once('error', (error) => {
    if (previewProcesses.get(previewKey(root)) !== preview) return
    preview.status = 'error'
    preview.message = agentErrorMessage(error)
    sendPreview(preview)
  })
  child.once('exit', (code, signal) => {
    if (previewProcesses.get(previewKey(root)) !== preview) return
    preview.status = preview.stopping ? 'stopped' : code === 0 ? 'exited' : 'error'
    preview.exitCode = code ?? undefined
    preview.message = preview.stopping ? undefined : `开发服务器已退出（${code ?? signal ?? 'unknown'}）。`
    sendPreview(preview)
  })
  return previewSnapshot(preview)
}

function createWindow() {
  const appearance = readSettings().appearance
  nativeTheme.themeSource = appearance.theme
  const window = new BrowserWindow({
    width: Number(process.env.WETOCODE_WINDOW_WIDTH) || 1480,
    height: Number(process.env.WETOCODE_WINDOW_HEIGHT) || 940,
    minWidth: 1050,
    minHeight: 680,
    backgroundColor: '#f3f5f7',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      zoomFactor: appearance.zoom,
    },
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.on('close', (event) => {
    if (isQuitting || activeRuns.size === 0) return
    event.preventDefault()
    if (ensureResidentTray()) window.hide()
    else window.minimize()
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  if (process.env.WETOCODE_SCREENSHOT_PATH) {
    window.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        await window.webContents.executeJavaScript(`new Promise((resolve) => {
          let attempts = 0
          const timer = setInterval(() => {
            attempts += 1
            if (document.querySelector('.app-shell') || attempts >= 150) {
              clearInterval(timer)
              resolve(true)
            }
          }, 100)
        })`)
        if (process.env.WETOCODE_SCREENSHOT_VIEW === 'settings') {
          await window.webContents.executeJavaScript(`document.querySelector('button[title="设置"]')?.click()`)
          await new Promise((resolve) => setTimeout(resolve, 350))
        } else if (process.env.WETOCODE_SCREENSHOT_VIEW === 'tasks') {
          await window.webContents.executeJavaScript(`document.querySelector('button[title="后台任务"]')?.click()`)
          await new Promise((resolve) => setTimeout(resolve, 350))
        } else if (process.env.WETOCODE_SCREENSHOT_VIEW === 'files') {
          await window.webContents.executeJavaScript(`document.querySelector('button[title="项目文件"]')?.click()`)
          await window.webContents.executeJavaScript(`new Promise((resolve) => {
            let attempts = 0
            const timer = setInterval(() => {
              attempts += 1
              if (document.querySelector('.file-tree-row') || document.querySelector('.toast') || attempts >= 150) { clearInterval(timer); resolve(true) }
            }, 100)
          })`)
        } else if (process.env.WETOCODE_SCREENSHOT_VIEW === 'extensions') {
          await window.webContents.executeJavaScript(`document.querySelector('button[title="扩展中心"]')?.click()`)
          await window.webContents.executeJavaScript(`new Promise((resolve) => {
            let attempts = 0
            const timer = setInterval(() => {
              attempts += 1
              if (document.querySelector('.extension-row') || document.querySelector('.toast') || attempts >= 150) { clearInterval(timer); resolve(true) }
            }, 100)
          })`)
        } else if (process.env.WETOCODE_SCREENSHOT_VIEW === 'usage') {
          await window.webContents.executeJavaScript(`document.querySelector('button[title="使用统计"]')?.click()`)
          await new Promise((resolve) => setTimeout(resolve, 500))
        } else if (process.env.WETOCODE_SCREENSHOT_VIEW === 'goal') {
          await window.webContents.executeJavaScript(`document.querySelector('.goal-control .access-mode-button')?.click()`)
          await new Promise((resolve) => setTimeout(resolve, 120))
          await window.webContents.executeJavaScript(`document.querySelector('.goal-budget-button')?.click()`)
          await new Promise((resolve) => setTimeout(resolve, 350))
        } else if (process.env.WETOCODE_SCREENSHOT_VIEW === 'automations') {
          await window.webContents.executeJavaScript(`document.querySelector('button[title="自动化任务"]')?.click()`)
          await new Promise((resolve) => setTimeout(resolve, 450))
          await window.webContents.executeJavaScript(`[...document.querySelectorAll('.automation-toolbar button, .tasks-empty button')].find((button) => button.textContent.includes('新建'))?.click()`)
          await new Promise((resolve) => setTimeout(resolve, 250))
        } else if (process.env.WETOCODE_SCREENSHOT_VIEW === 'preview') {
          await window.webContents.executeJavaScript(`document.querySelector('button[title="开发预览"]')?.click()`)
          await new Promise((resolve) => setTimeout(resolve, 450))
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
        const image = await window.webContents.capturePage()
        fs.writeFileSync(process.env.WETOCODE_SCREENSHOT_PATH, image.toPNG())
        app.quit()
      }, 100)
    })
  }
  return window
}

function registerIpc() {
  ipcMain.handle('app:show-window', () => {
    showMainWindow()
    return true
  })
  ipcMain.handle('app:bootstrap', async () => {
    const settings = readSettings()
    return {
      settings: sanitizeSettings(settings),
      engine: initialEngineState(),
      appVersion: app.getVersion(),
      platform: process.platform,
      packaged: app.isPackaged,
    }
  })
  ipcMain.handle('app:engine-status', () => opencodeVersion())

  ipcMain.handle('project:choose', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择代码项目',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: '打开项目',
    })
    if (result.canceled || !result.filePaths[0]) return null
    const projectPath = result.filePaths[0]
    const settings = readSettings()
    settings.recentProjects = [projectPath, ...settings.recentProjects.filter((item) => item !== projectPath)].slice(0, 12)
    writeSettings(settings)
    return { path: projectPath, name: path.basename(projectPath), sessions: await listSessions(projectPath) }
  })

  ipcMain.handle('session:list', (_event, projectPath) => {
    if (!isAuthorizedProject(readSettings(), projectPath)) return []
    return listSessions(projectPath)
  })
  ipcMain.handle('session:get', (_event, sessionId, projectPath) => {
    if (!isAuthorizedProject(readSettings(), projectPath)) return null
    return getSession(sessionId, projectPath)
  })
  ipcMain.handle('session:rename', async (_event, sessionId, projectPath, title) => {
    await assertSessionAccess(sessionId, projectPath)
    const cleanTitle = String(title || '').trim().slice(0, 120)
    if (!cleanTitle) throw new Error('会话标题不能为空。')
    writeSessionMetadata(updateSessionMetadata(readSessionMetadata(), sessionId, { title: cleanTitle }))
    return listSessions(projectPath)
  })
  ipcMain.handle('session:archive', async (_event, sessionId, projectPath, archived) => {
    await assertSessionAccess(sessionId, projectPath)
    writeSessionMetadata(updateSessionMetadata(readSessionMetadata(), sessionId, { archivedAt: archived ? Date.now() : undefined }))
    return listSessions(projectPath)
  })
  ipcMain.handle('session:delete', async (_event, sessionId, projectPath) => {
    await assertSessionAccess(sessionId, projectPath)
    await execFileAsync(findOpenCode(), ['session', 'delete', sessionId], { cwd: projectPath, timeout: 15000 })
    const metadata = readSessionMetadata()
    delete metadata[sessionId]
    writeSessionMetadata(metadata)
    const goals = readGoals()
    delete goals[sessionId]
    writeGoals(goals)
    return listSessions(projectPath)
  })
  ipcMain.handle('session:fork', async (_event, sessionId, projectPath, messageId) => {
    await assertSessionAccess(sessionId, projectPath)
    if (runForSession(sessionId)) throw new Error('任务运行时无法创建会话分支。')
    const service = await projectFileService(projectPath)
    return resultData(await service.client.session.fork({ sessionID: sessionId, messageID: messageId || undefined }))
  })
  ipcMain.handle('session:revert', async (_event, sessionId, projectPath, messageId) => {
    await assertSessionAccess(sessionId, projectPath)
    if (runForSession(sessionId)) throw new Error('任务运行时无法回退消息。')
    const service = await projectFileService(projectPath)
    resultData(await service.client.session.revert({ sessionID: sessionId, messageID: messageId }))
    return true
  })
  ipcMain.handle('session:unrevert', async (_event, sessionId, projectPath) => {
    await assertSessionAccess(sessionId, projectPath)
    if (runForSession(sessionId)) throw new Error('任务运行时无法恢复消息。')
    const service = await projectFileService(projectPath)
    resultData(await service.client.session.unrevert({ sessionID: sessionId }))
    return true
  })
  ipcMain.handle('session:compact', async (_event, sessionId, projectPath, providerId) => {
    await assertSessionAccess(sessionId, projectPath)
    if (runForSession(sessionId)) throw new Error('任务运行时无法压缩上下文。')
    const settings = readSettings()
    const provider = settings.providers.find((item) => item.id === providerId) || settings.providers.find((item) => item.id === settings.activeProviderId) || settings.providers[0]
    if (!provider) throw new Error('请先配置可用模型。')
    const service = await ensureAgentServer(projectPath, provider, customProviderConfig(provider, settings))
    resultData(await service.client.session.summarize({ sessionID: sessionId, providerID: provider.providerId, modelID: provider.model }))
    return true
  })
  ipcMain.handle('session:command', async (_event, sessionId, projectPath, providerId, command, args) => {
    const settings = readSettings()
    if (!isAuthorizedProject(settings, projectPath)) throw new Error('该项目尚未授权。')
    if (sessionId) await assertSessionAccess(sessionId, projectPath)
    const provider = settings.providers.find((item) => item.id === providerId) || settings.providers[0]
    if (!provider) throw new Error('请先配置可用模型。')
    const service = await ensureAgentServer(projectPath, provider, customProviderConfig(provider, settings))
    const session = sessionId ? { id: sessionId } : resultData(await service.client.session.create({ title: `/${String(command).slice(0, 50)}` }))
    if (runForSession(session.id)) throw new Error('当前会话已有任务正在运行。')
    const runId = randomUUID()
    const run = {
      runId, sessionId: session.id, service, projectPath, title: `/${command} ${args}`.trim().slice(0, 120),
      provider: provider.name, providerId: provider.providerId, modelId: provider.model, settings,
      startedAt: Date.now(), status: 'running', assistantMessageIds: new Set(), textPartIds: new Set(), completedToolPartIds: new Set(), completedStepPartIds: new Set(), verifying: false,
    }
    activeRuns.set(runId, run)
    trackUsage({ model: `${provider.providerId}/${provider.model}`, sessions: sessionId ? 0 : 1, messages: 1 })
    sendTaskSnapshots()
    sendToRenderer('agent:event', { runId, type: 'started', provider: provider.name })
    sendToRenderer('agent:event', { runId, type: 'session', sessionId: session.id })
    try {
      void service.client.session.command({ sessionID: session.id, command: String(command), arguments: String(args || ''), model: `${provider.providerId}/${provider.model}` }).then(resultData).catch((error) => {
        if (!activeRuns.has(runId)) return
        run.error = agentErrorMessage(error)
        sendToRenderer('agent:event', { runId, type: 'error', message: run.error })
        finishRun(run, 1)
      })
      return { runId, sessionId: session.id }
    } catch (error) {
      run.error = agentErrorMessage(error)
      finishRun(run, 1)
      throw error
    }
  })
  ipcMain.handle('extensions:overview', (_event, projectPath) => extensionOverview(projectPath))
  ipcMain.handle('usage:get', (_event, range) => usageSummary(readUsage(), ['7d', '30d', 'all'].includes(range) ? range : '30d'))
  ipcMain.handle('automation:list', () => readAutomations())
  ipcMain.handle('automation:save', (_event, input) => {
    const settings = readSettings()
    if (!input?.projectPath || !isAuthorizedProject(settings, input.projectPath)) throw new Error('自动化项目尚未授权。')
    const prompt = String(input.prompt || '').trim().slice(0, 20_000)
    const name = String(input.name || '').trim().slice(0, 120)
    if (!name || !prompt) throw new Error('请填写自动化名称和任务内容。')
    const schedule = normalizeSchedule(input.schedule)
    if (schedule.kind === 'once' && schedule.onceAt <= Date.now()) throw new Error('单次执行时间必须晚于当前时间。')
    const automations = readAutomations()
    const existing = automations.find((item) => item.id === input.id)
    if (existing?.runningRunId) throw new Error('自动化正在运行，结束后才能修改。')
    const id = existing?.id || randomUUID()
    const now = Date.now()
    const enabled = input.enabled !== false
    const saved = {
      ...existing,
      id,
      name,
      prompt,
      projectPath: path.resolve(input.projectPath),
      providerId: settings.providers.some((item) => item.id === input.providerId) ? input.providerId : settings.activeProviderId,
      enabled,
      schedule,
      nextRunAt: enabled ? nextRunAt(schedule, now) : undefined,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      history: existing?.history || [],
    }
    writeAutomations([saved, ...automations.filter((item) => item.id !== id)])
    if (enabled) ensureResidentTray()
    return sendAutomations()
  })
  ipcMain.handle('automation:set-enabled', (_event, id, enabled) => {
    const automations = readAutomations()
    const index = automations.findIndex((item) => item.id === id)
    if (index < 0) throw new Error('自动化计划不存在。')
    const item = automations[index]
    automations[index] = {
      ...item,
      enabled: Boolean(enabled),
      nextRunAt: enabled ? nextRunAt(item.schedule, Date.now()) : undefined,
      updatedAt: Date.now(),
    }
    writeAutomations(automations)
    if (enabled) ensureResidentTray()
    return sendAutomations()
  })
  ipcMain.handle('automation:run-now', async (_event, id) => {
    const automation = readAutomations().find((item) => item.id === id)
    if (!automation) throw new Error('自动化计划不存在。')
    const result = await runAutomation(id, Date.now(), true)
    return { automations: readAutomations(), result }
  })
  ipcMain.handle('automation:delete', async (_event, id) => {
    const automations = readAutomations()
    const item = automations.find((automation) => automation.id === id)
    if (!item) return automations
    const run = item.runningRunId ? activeRuns.get(item.runningRunId) : undefined
    if (run) {
      resultData(await run.service.client.session.abort({ sessionID: run.sessionId }))
      finishRun(run, 0, 'aborted')
    }
    writeAutomations(readAutomations().filter((automation) => automation.id !== id))
    return sendAutomations()
  })
  ipcMain.handle('preview:suggestions', (_event, projectPath) => previewSuggestions(projectPath))
  ipcMain.handle('preview:get', (_event, projectPath) => {
    assertProjectRelativePath(projectPath, '')
    return previewSnapshot(previewProcesses.get(previewKey(projectPath))) || null
  })
  ipcMain.handle('preview:start', (_event, projectPath, input) => startPreview(projectPath, input))
  ipcMain.handle('preview:set-url', (_event, projectPath, url) => {
    assertProjectRelativePath(projectPath, '')
    const preview = previewProcesses.get(previewKey(projectPath))
    if (!preview) throw new Error('开发服务器尚未启动。')
    preview.url = loopbackPreviewUrl(url)
    if (preview.status === 'starting') preview.status = 'running'
    return sendPreview(preview)
  })
  ipcMain.handle('preview:stop', async (_event, projectPath) => {
    assertProjectRelativePath(projectPath, '')
    return await stopPreview(projectPath)
  })
  ipcMain.handle('preview:open-external', (_event, projectPath, url) => {
    assertProjectRelativePath(projectPath, '')
    return shell.openExternal(loopbackPreviewUrl(url))
  })

  ipcMain.handle('provider:save', (_event, input) => {
    const settings = readSettings()
    const current = settings.providers.find((item) => item.id === input.id)
    const id = input.id || randomUUID()
    const provider = {
      id,
      name: String(input.name || '').trim(),
      providerId: String(input.providerId || '').trim(),
      model: String(input.model || '').trim(),
      baseUrl: String(input.baseUrl || '').trim(),
      kind: input.kind === 'custom' ? 'custom' : 'builtin',
      protocol: normalizeProviderProtocol(input.protocol, input.providerId),
      contextWindow: Math.min(10_000_000, Math.max(8_192, Number(input.contextWindow) || 128000)),
      outputLimit: Math.min(1_000_000, Math.max(1_024, Number(input.outputLimit) || 16384)),
      apiKeyEncrypted: input.apiKey
        ? encryptSecret(String(input.apiKey).trim())
        : current?.apiKeyEncrypted || '',
    }
    if (!provider.name || !provider.providerId || !provider.model) {
      throw new Error('请完整填写供应商名称、供应商 ID 和模型 ID。')
    }
    if (provider.kind === 'custom') {
      provider.baseUrl = assertProviderUrl(provider.baseUrl)
    }
    settings.providers = [provider, ...settings.providers.filter((item) => item.id !== id)]
    settings.activeProviderId = id
    writeSettings(settings)
    if (!activeRuns.size) stopAgentServer()
    return sanitizeSettings(settings)
  })

  ipcMain.handle('provider:test', async (_event, input) => {
    const settings = readSettings()
    const current = settings.providers.find((item) => item.id === input.id)
    const provider = {
      providerId: String(input.providerId || '').trim(),
      model: String(input.model || '').trim(),
      baseUrl: String(input.baseUrl || '').trim(),
      protocol: normalizeProviderProtocol(input.protocol, input.providerId),
    }
    const apiKey = input.apiKey ? String(input.apiKey).trim() : decryptSecret(current?.apiKeyEncrypted || '')
    return testProviderConnection(provider, apiKey)
  })

  ipcMain.handle('provider:delete', (_event, id) => {
    const settings = readSettings()
    if (id === 'wetocode-free') throw new Error('内置免费模型不能删除。')
    settings.providers = settings.providers.filter((item) => item.id !== id)
    if (settings.activeProviderId === id) settings.activeProviderId = 'wetocode-free'
    writeSettings(settings)
    if (!activeRuns.size) stopAgentServer()
    return sanitizeSettings(settings)
  })

  ipcMain.handle('provider:set-active', (_event, id) => {
    const settings = readSettings()
    if (!settings.providers.some((provider) => provider.id === id)) throw new Error('选择的模型配置不存在。')
    settings.activeProviderId = id
    writeSettings(settings)
    if (!activeRuns.size) stopAgentServer()
    return sanitizeSettings(settings)
  })

  ipcMain.handle('settings:set-access-mode', (_event, accessMode) => {
    const settings = readSettings()
    settings.accessMode = normalizeAccessMode(accessMode)
    writeSettings(settings)
    if (!activeRuns.size) stopAgentServer()
    return sanitizeSettings(settings)
  })
  ipcMain.handle('settings:set-reasoning-effort', (_event, effort) => {
    const settings = readSettings()
    settings.reasoningEffort = ['off', 'high', 'max'].includes(effort) ? effort : 'max'
    writeSettings(settings)
    return sanitizeSettings(settings)
  })
  ipcMain.handle('settings:set-appearance', (event, patch) => {
    const settings = readSettings()
    settings.appearance = updateAppearance(settings.appearance, patch)
    writeSettings(settings)
    nativeTheme.themeSource = settings.appearance.theme
    BrowserWindow.fromWebContents(event.sender)?.webContents.setZoomFactor(settings.appearance.zoom)
    return sanitizeSettings(settings)
  })

  ipcMain.handle('git:status', (_event, projectPath) => gitStatus(projectPath))
  ipcMain.handle('git:diff', async (_event, projectPath, filePath) => {
    const { change } = await assertGitChange(projectPath, filePath)
    let diff = ''
    if (change.indexStatus === '?' && change.worktreeStatus === '?') {
      const result = await runGit(projectPath, ['diff', '--no-index', '--binary', '--', '/dev/null', filePath], { allowExitCodes: [1] })
      diff = result.stdout
    } else {
      const [working, staged] = await Promise.all([
        runGit(projectPath, ['diff', '--no-ext-diff', '--binary', '--', filePath]),
        runGit(projectPath, ['diff', '--cached', '--no-ext-diff', '--binary', '--', filePath]),
      ])
      diff = [staged.stdout, working.stdout].filter(Boolean).join('\n')
    }
    return { path: filePath, diff, ...countDiffLines(diff) }
  })
  ipcMain.handle('git:discard', async (_event, projectPath, filePath) => {
    const { change, resolved } = await assertGitChange(projectPath, filePath)
    if (change.indexStatus === '?' && change.worktreeStatus === '?') {
      fs.rmSync(resolved, { recursive: false, force: true })
    } else {
      try {
        await runGit(projectPath, ['restore', '--staged', '--worktree', '--', filePath])
      } catch {
        if (change.kind === 'added') {
          await runGit(projectPath, ['rm', '--cached', '--force', '--', filePath]).catch(() => {})
          fs.rmSync(resolved, { recursive: false, force: true })
        } else {
          throw new Error('无法撤销该文件，仓库可能还没有首次提交。')
        }
      }
    }
    return gitStatus(projectPath)
  })
  ipcMain.handle('git:open-project', async (_event, projectPath) => {
    if (!isAuthorizedProject(readSettings(), projectPath)) throw new Error('该项目尚未授权。')
    const error = await shell.openPath(projectPath)
    if (error) throw new Error(error)
    return true
  })
  ipcMain.handle('git:checkpoint-create', async (_event, projectPath, label) => {
    const status = await gitStatus(projectPath)
    if (!status.isRepository) throw new Error(status.reason)
    const { stdout: headOutput } = await runGit(projectPath, ['rev-parse', 'HEAD']).catch(() => ({ stdout: '' }))
    const head = headOutput.trim()
    if (!head) throw new Error('仓库完成首次提交后才能创建检查点。')
    const id = randomUUID()
    let stashCommit = ''
    if (status.changes.length) {
      await runGit(projectPath, ['stash', 'push', '--include-untracked', '--message', `WetoCode checkpoint ${id}`], { timeout: 60000 })
      const { stdout } = await runGit(projectPath, ['rev-parse', 'refs/stash'])
      stashCommit = stdout.trim()
      try {
        await runGit(projectPath, ['stash', 'apply', '--index', stashCommit], { timeout: 60000 })
      } catch {
        await runGit(projectPath, ['stash', 'apply', stashCommit], { timeout: 60000 })
      }
    }
    const checkpoint = { id, projectPath: path.resolve(projectPath), head, stashCommit, label: String(label || '手动检查点').trim().slice(0, 80), createdAt: Date.now() }
    writeCheckpoints([checkpoint, ...readCheckpoints()].slice(0, 50))
    return gitStatus(projectPath)
  })
  ipcMain.handle('git:checkpoint-restore', async (_event, projectPath, checkpointId) => {
    const checkpoint = readCheckpoints().find((item) => item.id === checkpointId && path.resolve(item.projectPath) === path.resolve(projectPath))
    if (!checkpoint) throw new Error('检查点不存在。')
    if (!isAuthorizedProject(readSettings(), projectPath)) throw new Error('该项目尚未授权。')
    const { stdout } = await runGit(projectPath, ['rev-parse', 'HEAD'])
    if (stdout.trim() !== checkpoint.head) throw new Error('仓库提交已变化，为避免覆盖新提交，无法恢复此检查点。')
    await runGit(projectPath, ['reset', '--hard', checkpoint.head], { timeout: 60000 })
    await runGit(projectPath, ['clean', '-fd'], { timeout: 60000 })
    if (checkpoint.stashCommit) await runGit(projectPath, ['stash', 'apply', '--index', checkpoint.stashCommit], { timeout: 60000 })
    return gitStatus(projectPath)
  })
  ipcMain.handle('git:checkpoint-delete', async (_event, projectPath, checkpointId) => {
    if (!isAuthorizedProject(readSettings(), projectPath)) throw new Error('该项目尚未授权。')
    writeCheckpoints(readCheckpoints().filter((item) => item.id !== checkpointId || path.resolve(item.projectPath) !== path.resolve(projectPath)))
    return gitStatus(projectPath)
  })

  ipcMain.handle('worktree:list', (_event, projectPath) => worktreeState(projectPath))
  ipcMain.handle('worktree:create', async (_event, projectPath, inputName) => {
    const settings = readSettings()
    const primaryPath = primaryProjectPath(settings, projectPath)
    if (!primaryPath) throw new Error('该项目尚未授权。')
    const status = await gitStatus(primaryPath)
    if (!status.isRepository) throw new Error(status.reason)
    const name = String(inputName || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^[.-]+|[.-]+$/g, '')
      .slice(0, 48)
    if (!name) throw new Error('请输入由字母、数字、短横线或下划线组成的工作区名称。')
    if (readManagedWorktrees().some((item) => path.resolve(item.primaryPath) === primaryPath && item.name === name)) {
      throw new Error('同名隔离工作区已存在。')
    }
    const service = await worktreeClient(primaryPath)
    const created = resultData(await service.client.worktree.create({ worktreeCreateInput: { name } }))
    if (!created?.directory || !fs.existsSync(created.directory)) throw new Error('隔离工作区创建后未找到目录。')
    const record = {
      id: randomUUID(),
      primaryPath,
      name: created.name || name,
      directory: path.resolve(created.directory),
      branch: created.branch || '',
      createdAt: Date.now(),
    }
    writeManagedWorktrees([record, ...readManagedWorktrees()])
    return { state: await worktreeState(record.directory), created: record }
  })
  ipcMain.handle('worktree:remove', async (_event, projectPath, directory) => {
    const state = await worktreeState(projectPath)
    const target = state.worktrees.find((item) => path.resolve(item.directory) === path.resolve(directory || ''))
    if (!target) throw new Error('该隔离工作区不存在或不属于当前项目。')
    if (target.dirty) throw new Error('该隔离工作区有未提交变更，请先提交、保存检查点或重置后再删除。')
    const service = await worktreeClient(state.primaryPath)
    resultData(await service.client.worktree.remove({ worktreeRemoveInput: { directory: target.directory } }))
    writeManagedWorktrees(readManagedWorktrees().filter((item) => path.resolve(item.directory) !== path.resolve(target.directory)))
    return worktreeState(state.primaryPath)
  })
  ipcMain.handle('worktree:reset', async (_event, projectPath, directory) => {
    const state = await worktreeState(projectPath)
    const target = state.worktrees.find((item) => path.resolve(item.directory) === path.resolve(directory || ''))
    if (!target) throw new Error('该隔离工作区不存在或不属于当前项目。')
    const service = await worktreeClient(state.primaryPath)
    resultData(await service.client.worktree.reset({ worktreeResetInput: { directory: target.directory } }))
    return worktreeState(target.directory)
  })

  ipcMain.handle('attachment:choose', async (_event, projectPath) => {
    if (!isAuthorizedProject(readSettings(), projectPath)) throw new Error('该项目尚未授权。')
    const selection = await dialog.showOpenDialog({
      title: '添加上下文文件',
      defaultPath: projectPath,
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '支持的文件', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'txt', 'md', 'json', 'js', 'jsx', 'ts', 'tsx', 'css', 'html', 'xml', 'yaml', 'yml', 'toml', 'sql', 'java', 'kt', 'go', 'rs', 'py', 'c', 'cpp', 'h', 'hpp', 'cs', 'sh', 'ps1'] }],
    })
    if (selection.canceled) return []
    return selection.filePaths.map((filePath) => {
      const attachment = readAttachmentFile(projectPath, filePath)
      const id = randomUUID()
      pendingAttachments.set(id, { id, projectPath: path.resolve(projectPath), ...attachment, createdAt: Date.now() })
      return { id, ...attachment.descriptor }
    })
  })
  ipcMain.handle('attachment:add-data', (_event, projectPath, input) => {
    if (!isAuthorizedProject(readSettings(), projectPath)) throw new Error('该项目尚未授权。')
    const attachment = readDataAttachment(input)
    const id = randomUUID()
    pendingAttachments.set(id, { id, projectPath: path.resolve(projectPath), ...attachment, createdAt: Date.now() })
    return { id, ...attachment.descriptor }
  })
  ipcMain.handle('attachment:add-project', (_event, projectPath, relativePath) => {
    const { target } = assertProjectRelativePath(projectPath, relativePath)
    const attachment = readAttachmentFile(projectPath, target)
    const id = randomUUID()
    pendingAttachments.set(id, { id, projectPath: path.resolve(projectPath), ...attachment, createdAt: Date.now() })
    return { id, ...attachment.descriptor }
  })
  ipcMain.handle('attachment:remove', (_event, attachmentId) => pendingAttachments.delete(attachmentId))

  ipcMain.handle('file:list', async (_event, projectPath, relativePath) => {
    const { clean } = assertProjectRelativePath(projectPath, relativePath)
    const service = await projectFileService(projectPath)
    const nodes = resultData(await service.client.file.list({ path: clean }))
    return (Array.isArray(nodes) ? nodes : []).filter((node) => !node.ignored).map((node) => ({
      name: node.name,
      path: String(node.path || '').replace(/\\/g, '/'),
      type: node.type,
      ignored: Boolean(node.ignored),
    }))
  })
  ipcMain.handle('file:search', async (_event, projectPath, query) => {
    assertProjectRelativePath(projectPath, '')
    const cleanQuery = String(query || '').trim().slice(0, 200)
    if (!cleanQuery) return []
    const service = await projectFileService(projectPath)
    const matches = resultData(await service.client.find.files({ query: cleanQuery, dirs: 'false' }))
    return (Array.isArray(matches) ? matches : []).slice(0, 100).map((item) => String(item).replace(/\\/g, '/'))
  })
  ipcMain.handle('file:read', async (_event, projectPath, relativePath) => {
    const { clean } = assertProjectRelativePath(projectPath, relativePath)
    if (!clean) throw new Error('请选择文件。')
    const service = await projectFileService(projectPath)
    const content = resultData(await service.client.file.read({ path: clean }))
    const source = String(content?.content || '')
    const maxLength = 512 * 1024
    return {
      path: clean,
      type: content?.type === 'binary' ? 'binary' : 'text',
      content: source.slice(0, maxLength),
      mimeType: content?.mimeType,
      truncated: source.length > maxLength,
    }
  })
  ipcMain.handle('file:open', async (_event, projectPath, relativePath) => {
    const { target } = assertProjectRelativePath(projectPath, relativePath)
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error('文件不存在。')
    const error = await shell.openPath(target)
    if (error) throw new Error(error)
    return true
  })

  ipcMain.handle('goal:get', async (_event, sessionId, projectPath) => {
    await assertSessionAccess(sessionId, projectPath)
    return goalForSession(sessionId) || null
  })
  ipcMain.handle('goal:set-status', async (_event, sessionId, projectPath, action) => {
    await assertSessionAccess(sessionId, projectPath)
    if (!['pause', 'resume', 'clear'].includes(action)) throw new Error('目标操作无效。')
    const goals = readGoals()
    const goal = goals[sessionId]
    if (!goal) return null
    if (action === 'clear') {
      const run = runForSession(sessionId)
      if (run) {
        resultData(await run.service.client.session.abort({ sessionID: sessionId }))
        run.goal = undefined
        finishRun(run, 0, 'aborted')
      }
      delete goals[sessionId]
      writeGoals(goals)
      sendToRenderer('agent:event', { runId: run?.runId || '', type: 'goal', goal: null })
      sendTaskSnapshots()
      return null
    }
    const resumedFromBudget = action === 'resume' && goal.status === 'budget_limited'
    const next = updateGoalState(goal, {
      status: action === 'pause' ? 'paused' : 'active',
      nextAction: action === 'pause' ? '目标已暂停。' : goal.nextAction || '继续完成目标。',
      startedAt: resumedFromBudget ? Date.now() : goal.startedAt,
      limits: resumedFromBudget ? {
        maxIterations: Math.min(50, Math.max(goal.iteration + 8, goal.limits.maxIterations + 8)),
        maxMinutes: Math.min(1440, goal.limits.maxMinutes + 120),
        maxTokens: Math.min(20_000_000, Math.max(goal.tokenUsage + 1_000_000, goal.limits.maxTokens + 1_000_000)),
      } : goal.limits,
    })
    goals[sessionId] = next
    writeGoals(goals)
    const run = runForSession(sessionId)
    if (run) run.goal = next
    if (action === 'pause' && run) {
      resultData(await run.service.client.session.abort({ sessionID: sessionId }))
      finishRun(run, 0, 'aborted')
    } else if (action === 'resume' && !run) {
      try {
        const settings = readSettings()
        await startAgentRun({
          clientRunId: randomUUID(),
          prompt: `继续完成持久目标。优先处理：${next.nextAction || next.objective}`,
          projectPath,
          providerId: settings.activeProviderId,
          sessionId,
          title: next.objective,
        })
      } catch (error) {
        const failed = saveGoal(updateGoalState(next, { status: 'failed', nextAction: `恢复目标失败：${agentErrorMessage(error)}` }))
        throw Object.assign(new Error(failed.nextAction), { goal: failed })
      }
    } else {
      sendToRenderer('agent:event', { runId: run?.runId || '', type: 'goal', goal: next })
      sendTaskSnapshots()
    }
    return next
  })

  ipcMain.handle('agent:run', (_event, request) => startAgentRun(request))

  ipcMain.handle('agent:stop', async (_event, runId) => {
    const run = activeRuns.get(runId)
    if (!run) return false
    resultData(await run.service.client.session.abort({ sessionID: run.sessionId }))
    finishRun(run, 0, 'aborted')
    return true
  })

  ipcMain.handle('agent:tasks', () => backgroundTasks())
  ipcMain.handle('agent:task-dismiss', (_event, runId) => {
    if (activeRuns.has(runId)) return false
    const removed = taskHistory.delete(runId)
    if (removed) sendTaskSnapshots()
    return removed
  })

  ipcMain.handle('agent:permission-reply', async (_event, permissionId, response) => {
    const pending = pendingPermissions.get(permissionId)
    if (!pending || !activeRuns.has(pending.runId)) throw new Error('该权限请求已失效。')
    if (!['once', 'always', 'reject'].includes(response)) throw new Error('权限回复无效。')
    resultData(await pending.service.client.permission.reply({ requestID: permissionId, reply: response }))
    pendingPermissions.delete(permissionId)
    const run = activeRuns.get(pending.runId)
    if (run) run.status = 'running'
    sendTaskSnapshots()
    return true
  })

  ipcMain.handle('terminal:create', async (_event, projectPath, size, requestedMode) => {
    const settings = readSettings()
    if (!projectPath || !fs.existsSync(projectPath) || !isAuthorizedProject(settings, projectPath)) throw new Error('该项目尚未授权。')
    const provider = settings.providers.find((item) => item.id === settings.activeProviderId) || settings.providers[0]
    if (!provider) throw new Error('请先配置可用模型。')
    const service = await ensureAgentServer(projectPath, provider, customProviderConfig(provider, settings))
    const mode = normalizeTerminalMode(requestedMode)
    const pty = resultData(await service.client.pty.create(terminalPtyInput({
      mode,
      binary: findOpenCode(),
      serviceUrl: service.url,
      projectPath,
    })))
    if (size?.rows && size?.cols) {
      await service.client.pty.update({ ptyID: pty.id, size: { rows: Math.max(2, size.rows), cols: Math.max(20, size.cols) } })
    }
    const token = resultData(await service.client.pty.connectToken(
      { ptyID: pty.id },
      { headers: { 'x-opencode-ticket': '1' } },
    ))
    const socketUrl = new URL(`/pty/${encodeURIComponent(pty.id)}/connect`, service.url)
    socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    socketUrl.searchParams.set('directory', projectPath)
    socketUrl.searchParams.set('ticket', token.ticket)
    const socket = new WebSocket(socketUrl, { headers: { Origin: service.url } })
    const terminal = { pty, socket, service, projectPath, attached: false, buffer: [], brandFilter: mode === 'cli' ? createTerminalBrandFilter() : undefined }
    activeTerminals.set(pty.id, terminal)
    socket.addEventListener('message', async (message) => {
      if (!activeTerminals.has(pty.id)) return
      const data = await websocketText(message.data)
      const output = terminal.brandFilter ? terminal.brandFilter.write(data) : data
      if (!output) return
      if (terminal.attached) sendToRenderer('terminal:event', { ptyId: pty.id, type: 'data', data: output })
      else terminal.buffer.push(output)
    })
    socket.addEventListener('close', () => {
      if (!activeTerminals.delete(pty.id)) return
      const output = terminal.brandFilter?.flush()
      if (output) sendToRenderer('terminal:event', { ptyId: pty.id, type: 'data', data: output })
      sendToRenderer('terminal:event', { ptyId: pty.id, type: 'exit', exitCode: terminal.pty.exitCode ?? 0 })
    })
    socket.addEventListener('error', () => {
      sendToRenderer('terminal:event', { ptyId: pty.id, type: 'error', message: '终端连接已中断。' })
    })
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('终端连接超时。')), 10000)
        socket.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
        socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('终端连接失败。')) }, { once: true })
      })
    } catch (error) {
      closeTerminal(pty.id)
      throw error
    }
    return { ...pty, mode }
  })

  ipcMain.handle('terminal:attach', (_event, ptyId) => {
    const terminal = activeTerminals.get(ptyId)
    if (!terminal) return false
    terminal.attached = true
    for (const data of terminal.buffer.splice(0)) sendToRenderer('terminal:event', { ptyId, type: 'data', data })
    return true
  })

  ipcMain.handle('terminal:input', (_event, ptyId, data) => {
    const terminal = activeTerminals.get(ptyId)
    if (!terminal || terminal.socket.readyState !== WebSocket.OPEN) return false
    terminal.socket.send(String(data))
    return true
  })

  ipcMain.handle('terminal:resize', async (_event, ptyId, size) => {
    const terminal = activeTerminals.get(ptyId)
    if (!terminal || !size) return false
    resultData(await terminal.service.client.pty.update({
      ptyID: ptyId,
      size: { rows: Math.max(2, Number(size.rows) || 24), cols: Math.max(20, Number(size.cols) || 80) },
    }))
    return true
  })

  ipcMain.handle('terminal:close', (_event, ptyId) => closeTerminal(ptyId))
  ipcMain.handle('clipboard:read-text', () => clipboard.readText().slice(0, 1_000_000))
  ipcMain.handle('clipboard:write-text', (_event, value) => {
    clipboard.writeText(String(value || '').slice(0, 1_000_000))
    return true
  })

  ipcMain.handle('shell:open-external', (_event, url) => {
    if (typeof url === 'string' && url.startsWith('https://')) return shell.openExternal(url)
    return false
  })

  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) return { status: 'development', message: '开发模式不检查安装包更新。' }
    if (!updatesEnabled) return { status: 'disabled', message: '尚未配置正式更新源。' }
    const result = await autoUpdater.checkForUpdates()
    return { status: 'checking', version: result?.updateInfo?.version }
  })
  ipcMain.handle('update:install', () => autoUpdater.quitAndInstall())
}

function configureUpdater() {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  const relay = (status, extra = {}) => sendToRenderer('update:event', { status, ...extra })
  autoUpdater.on('checking-for-update', () => relay('checking'))
  autoUpdater.on('update-available', (info) => relay('available', { version: info.version }))
  autoUpdater.on('update-not-available', (info) => relay('current', { version: info.version }))
  autoUpdater.on('download-progress', (progress) => relay('downloading', { percent: progress.percent }))
  autoUpdater.on('update-downloaded', (info) => relay('ready', { version: info.version }))
  autoUpdater.on('error', (error) => relay('error', { message: error.message }))
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return
  registerIpc()
  configureUpdater()
  createWindow()
  startAutomationScheduler()
  const settings = readSettings()
  if (app.isPackaged && settings.autoUpdate && updatesEnabled) {
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000)
  }
  app.on('activate', () => {
    showMainWindow()
  })
})

if (hasSingleInstanceLock) {
  app.on('second-instance', () => showMainWindow())
}

app.on('window-all-closed', () => {
  if (activeRuns.size || hasEnabledAutomations()) {
    ensureResidentTray()
    return
  }
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
  clearInterval(automationTimer)
  stopAllRuns()
  stopAllPreviews()
  stopAgentServer()
  residentTray?.destroy()
  residentTray = undefined
})
