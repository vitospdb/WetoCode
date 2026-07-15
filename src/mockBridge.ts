import type { WetoCodeBridge, BootstrapData, ProviderSettings } from './types'

const providers: ProviderSettings[] = [
  {
    id: 'wetocode-free',
    name: 'WetoCode 免费模型',
    providerId: 'opencode',
    model: 'mimo-v2.5-free',
    baseUrl: '',
    kind: 'builtin',
    protocol: 'openai-compatible',
    contextWindow: 262144,
    outputLimit: 16384,
    hasApiKey: false,
  },
]

const bootstrap: BootstrapData = {
  settings: {
    recentProjects: ['/home/dev/projects/demo-project'],
    providers,
    activeProviderId: 'wetocode-free',
    accessMode: 'auto',
    reasoningEffort: 'max',
    appearance: { theme: 'system', density: 'comfortable', zoom: 1, sidebarOpen: true },
    context: {
      autoCompact: true,
      pruneToolOutput: true,
      preserveRecentTokens: 24000,
      reservedTokens: 16000,
    },
    autoUpdate: true,
    security: { keyStorage: '系统密钥环加密' },
  },
  engine: { installed: true, version: '1.17.11', binary: 'opencode' },
  appVersion: '0.1.0',
  platform: 'linux',
  packaged: false,
}

export const mockBridge: WetoCodeBridge = {
  getBootstrap: async () => bootstrap,
  getEngineStatus: async () => bootstrap.engine,
  showMainWindow: async () => true,
  chooseProject: async () => ({ path: '/home/dev/projects/demo-project', name: 'demo-project', sessions: [] }),
  listSessions: async () => [],
  getSession: async () => null,
  renameSession: async () => [],
  archiveSession: async () => [],
  deleteSession: async () => [],
  forkSession: async (sessionId, projectPath) => ({ id: `${sessionId}-fork`, title: '分支任务', updated: Date.now(), created: Date.now(), directory: projectPath }),
  revertSession: async () => true,
  unrevertSession: async () => true,
  compactSession: async () => true,
  runCommand: async (sessionId) => ({ runId: crypto.randomUUID(), sessionId: sessionId || crypto.randomUUID() }),
  getExtensions: async () => ({ commands: [{ name: 'review', description: '审查当前变更', template: 'Review changes' }], agents: [], skills: [], mcp: [], lsp: [] }),
  getUsage: async (range) => ({ range, totals: { tokens: 120000, messages: 28, toolCalls: 86, sessions: 9, completed: 8, failed: 1 }, activeDays: 5, days: [], models: [{ model: 'opencode/mimo-v2.5-free', tokens: 120000, messages: 28, toolCalls: 86 }] }),
  listAutomations: async () => [],
  saveAutomation: async () => [],
  setAutomationEnabled: async () => [],
  runAutomationNow: async () => ({ automations: [] }),
  deleteAutomation: async () => [],
  getPreviewSuggestions: async () => [{ name: 'dev', command: 'npm run dev', description: 'vite' }],
  getPreview: async () => null,
  startPreview: async (projectPath, input) => ({ id: crypto.randomUUID(), projectPath, command: input.command, status: 'running', url: input.url || 'http://localhost:5173/', startedAt: Date.now(), output: 'Local: http://localhost:5173/' }),
  setPreviewUrl: async (projectPath, url) => ({ id: 'mock-preview', projectPath, command: 'npm run dev', status: 'running', url, startedAt: Date.now(), output: '' }),
  stopPreview: async () => true,
  openPreviewExternal: async () => true,
  runAgent: async ({ clientRunId }) => ({ runId: clientRunId }),
  stopAgent: async () => true,
  listAgentTasks: async () => [],
  dismissAgentTask: async () => true,
  replyPermission: async () => true,
  getGoal: async () => null,
  setGoalStatus: async () => null,
  createTerminal: async (_projectPath, _size, mode = 'cli') => ({ id: 'mock-pty', title: mode === 'cli' ? 'WetoCode CLI' : 'Shell', command: mode === 'cli' ? 'opencode' : 'zsh', args: [], cwd: '/tmp', status: 'running', pid: 1, mode }),
  attachTerminal: async () => true,
  sendTerminalInput: async () => true,
  resizeTerminal: async () => true,
  closeTerminal: async () => true,
  saveProvider: async (provider) => {
    bootstrap.settings.providers = [
      { ...providers[0], ...provider, id: provider.id || crypto.randomUUID(), hasApiKey: Boolean(provider.apiKey) },
      ...bootstrap.settings.providers,
    ]
    return bootstrap.settings
  },
  testProvider: async () => ({ ok: true, status: 200, latencyMs: 120, message: '连接成功，密钥、API 地址和模型 ID 均可用。' }),
  deleteProvider: async () => bootstrap.settings,
  setActiveProvider: async (id) => {
    bootstrap.settings.activeProviderId = id
    return bootstrap.settings
  },
  setAccessMode: async (accessMode) => {
    bootstrap.settings.accessMode = accessMode
    return bootstrap.settings
  },
  setReasoningEffort: async (reasoningEffort) => {
    bootstrap.settings.reasoningEffort = reasoningEffort
    return bootstrap.settings
  },
  setAppearance: async (appearance) => {
    bootstrap.settings.appearance = { ...bootstrap.settings.appearance, ...appearance }
    return bootstrap.settings
  },
  getGitStatus: async () => ({ isRepository: false, reason: '当前项目尚未初始化 Git 仓库。', changes: [], checkpoints: [] }),
  getGitDiff: async (_projectPath, filePath) => ({ path: filePath, diff: '', additions: 0, deletions: 0 }),
  discardGitChange: async () => ({ isRepository: true, changes: [], checkpoints: [] }),
  openProjectFolder: async () => true,
  createGitCheckpoint: async () => ({ isRepository: true, changes: [], checkpoints: [] }),
  restoreGitCheckpoint: async () => ({ isRepository: true, changes: [], checkpoints: [] }),
  deleteGitCheckpoint: async () => ({ isRepository: true, changes: [], checkpoints: [] }),
  listWorktrees: async (projectPath) => ({ isRepository: true, primaryPath: projectPath, activePath: projectPath, primary: { name: 'demo-project', directory: projectPath, branch: 'main', dirty: false, primary: true }, worktrees: [] }),
  createWorktree: async (projectPath, name) => ({ state: { isRepository: true, primaryPath: projectPath, activePath: projectPath, worktrees: [] }, created: { name, directory: `${projectPath}-${name}`, branch: `opencode/${name}`, dirty: false } }),
  removeWorktree: async (projectPath) => ({ isRepository: true, primaryPath: projectPath, activePath: projectPath, worktrees: [] }),
  resetWorktree: async (projectPath) => ({ isRepository: true, primaryPath: projectPath, activePath: projectPath, worktrees: [] }),
  chooseAttachments: async () => [],
  addProjectAttachment: async (_projectPath, relativePath) => ({ id: crypto.randomUUID(), name: relativePath.split('/').pop() || relativePath, mime: 'text/plain', size: 1, kind: 'project', relativePath }),
  addDataAttachment: async (_projectPath, input) => ({ id: crypto.randomUUID(), name: input.name, mime: 'image/png', size: 1, kind: 'upload', previewUrl: input.dataUrl }),
  removeAttachment: async () => true,
  listProjectFiles: async (_projectPath, relativePath) => relativePath ? [] : [{ name: 'src', path: 'src', type: 'directory', ignored: false }, { name: 'README.md', path: 'README.md', type: 'file', ignored: false }],
  searchProjectFiles: async () => ['README.md', 'src/App.tsx'],
  readProjectFile: async (_projectPath, relativePath) => ({ path: relativePath, type: 'text', content: '# Preview' }),
  openProjectFile: async () => true,
  checkForUpdates: async () => ({ status: 'development', message: '开发模式不检查安装包更新。' }),
  installUpdate: async () => undefined,
  openExternal: async () => true,
  onAgentEvent: () => undefined,
  onAgentTasksChanged: () => undefined,
  onTerminalEvent: () => undefined,
  onUpdateEvent: () => undefined,
  onAutomationsChanged: () => undefined,
  onPreviewChanged: () => undefined,
}
