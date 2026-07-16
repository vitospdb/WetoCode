export type ProviderKind = 'builtin' | 'custom'
export type ProviderProtocol = 'openai-compatible' | 'anthropic' | 'google'
export type AccessMode = 'confirm' | 'auto' | 'plan' | 'full'
export type ReasoningEffort = 'off' | 'high' | 'max'
export type ThemePreference = 'system' | 'light' | 'dark'
export type DensityPreference = 'comfortable' | 'compact'

export interface AppearanceSettings {
  theme: ThemePreference
  density: DensityPreference
  zoom: number
  sidebarOpen: boolean
}

export interface ProviderSettings {
  id: string
  name: string
  providerId: string
  model: string
  baseUrl: string
  kind: ProviderKind
  protocol: ProviderProtocol
  contextWindow: number
  outputLimit?: number
  hasApiKey: boolean
}

export interface AppSettings {
  recentProjects: string[]
  providers: ProviderSettings[]
  activeProviderId: string
  accessMode: AccessMode
  reasoningEffort: ReasoningEffort
  appearance: AppearanceSettings
  context: {
    autoCompact: boolean
    pruneToolOutput: boolean
    preserveRecentTokens: number
    reservedTokens: number
  }
  autoUpdate: boolean
  security: { keyStorage: string }
}

export interface BootstrapData {
  settings: AppSettings
  engine: { installed: boolean; version: string; binary: string }
  appVersion: string
  platform: string
  packaged: boolean
}

export interface ProjectInfo {
  path: string
  name: string
}

export interface ProjectFileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  ignored: boolean
}

export interface ProjectFileContent {
  path: string
  type: 'text' | 'binary'
  content: string
  mimeType?: string
  truncated?: boolean
}

export interface AgentCommandInfo {
  name: string
  description?: string
  template: string
  agent?: string
  model?: string
}

export interface ExtensionOverview {
  commands: AgentCommandInfo[]
  agents: Array<{ name: string; description?: string; mode: 'subagent' | 'primary' | 'all'; builtIn: boolean; model?: string }>
  skills: Array<{ name: string; description: string; path: string; scope: 'project' | 'user' }>
  mcp: Array<{ name: string; status: string; error?: string }>
  lsp: Array<{ id: string; name: string; root: string; status: 'connected' | 'error' }>
}

export interface UsageSummary {
  range: '7d' | '30d' | 'all'
  totals: { tokens: number; messages: number; toolCalls: number; sessions: number; completed: number; failed: number }
  activeDays: number
  days: Array<{ date: string; tokens: number; messages: number; toolCalls: number; sessions: number; completed: number; failed: number }>
  models: Array<{ model: string; tokens: number; messages: number; toolCalls: number }>
}

export type AutomationSchedule =
  | { kind: 'once'; onceAt: number }
  | { kind: 'interval'; intervalMinutes: number }
  | { kind: 'daily'; hour: number; minute: number }
  | { kind: 'weekly'; hour: number; minute: number; days: number[] }

export interface AutomationRun {
  id: string
  scheduledAt: number
  startedAt: number
  completedAt?: number
  status: 'running' | 'completed' | 'error' | 'aborted' | 'budget_limited'
  runId?: string
  sessionId?: string
  message?: string
}

export interface AutomationTask {
  id: string
  name: string
  prompt: string
  projectPath: string
  providerId: string
  enabled: boolean
  schedule: AutomationSchedule
  nextRunAt?: number
  lastRunAt?: number
  lastStatus?: AutomationRun['status']
  lastMessage?: string
  runningRunId?: string
  createdAt: number
  updatedAt: number
  history: AutomationRun[]
}

export interface PreviewSuggestion {
  name: string
  command: string
  description: string
}

export interface PreviewState {
  id: string
  projectPath: string
  command: string
  status: 'starting' | 'running' | 'stopped' | 'exited' | 'error'
  url?: string
  startedAt: number
  pid?: number
  exitCode?: number
  message?: string
  output: string
}

export interface SessionInfo {
  id: string
  title: string
  updated: number
  created: number
  directory: string
  archived?: boolean
  archivedAt?: number
}

export interface GitFileChange {
  path: string
  originalPath?: string
  indexStatus: string
  worktreeStatus: string
  kind: 'added' | 'deleted' | 'renamed' | 'copied' | 'conflict' | 'modified'
  staged: boolean
}

export interface GitCheckpoint {
  id: string
  projectPath: string
  head: string
  stashCommit: string
  label: string
  createdAt: number
}

export interface GitStatusInfo {
  isRepository: boolean
  reason?: string
  branch?: string
  head?: string
  changes: GitFileChange[]
  checkpoints: GitCheckpoint[]
}

export interface GitDiffInfo {
  path: string
  diff: string
  additions: number
  deletions: number
}

export interface WorktreeInfo {
  id?: string
  primaryPath?: string
  name: string
  directory: string
  branch: string
  dirty: boolean
  primary?: boolean
  createdAt?: number
}

export interface WorktreeState {
  isRepository: boolean
  primaryPath: string
  activePath: string
  primary?: WorktreeInfo
  worktrees: WorktreeInfo[]
}

export interface ComposerAttachment {
  id: string
  name: string
  mime: string
  size: number
  kind: 'project' | 'upload'
  relativePath?: string
  previewUrl?: string
}

export interface ToolActivity {
  id: string
  tool: string
  title: string
  status: 'running' | 'completed' | 'error'
  input?: Record<string, unknown>
  output?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'notice'
  text: string
  createdAt: number
  runId?: string
  tools?: ToolActivity[]
  tokens?: { total: number; input: number; output: number; reasoning: number }
  running?: boolean
  attachments?: ComposerAttachment[]
}

export interface OpenCodePart {
  id?: string
  type?: string
  text?: string
  mime?: string
  filename?: string
  url?: string
  source?: {
    type?: string
    text?: { value?: string }
    path?: string
  }
  tool?: string
  state?: {
    status?: string
    title?: string
    input?: Record<string, unknown>
    output?: string
    error?: string
  }
  tokens?: {
    total?: number
    input?: number
    output?: number
    reasoning?: number
  }
}

export interface OpenCodeEvent {
  type: string
  sessionID?: string
  part?: OpenCodePart
  textMode?: 'delta' | 'snapshot'
}

export interface AgentPermissionRequest {
  id: string
  runId: string
  sessionId: string
  permission: string
  patterns: string[]
  always: string[]
  metadata: Record<string, unknown>
}

export type BackgroundTaskStatus = 'running' | 'waiting_permission' | 'completed' | 'error' | 'aborted' | 'budget_limited'

export interface BackgroundTask {
  runId: string
  sessionId: string
  projectPath: string
  title: string
  provider: string
  status: BackgroundTaskStatus
  startedAt: number
  completedAt?: number
  code?: number
  signal?: string
  message?: string
  permission?: AgentPermissionRequest
  goal?: GoalState
}

export type GoalStatus = 'active' | 'paused' | 'budget_limited' | 'complete' | 'failed'

export interface GoalTimelineEntry {
  id: string
  at: number
  iteration: number
  result: 'continue' | 'complete' | 'error'
  summary: string
}

export interface GoalState {
  id: string
  sessionId: string
  projectPath: string
  objective: string
  status: GoalStatus
  iteration: number
  createdAt: number
  updatedAt: number
  startedAt: number
  completedAt?: number
  tokenUsage: number
  toolCalls: number
  nextAction: string
  limits: { maxIterations: number; maxMinutes: number; maxTokens: number }
  timeline: GoalTimelineEntry[]
}

export interface AgentEvent {
  runId: string
  type: 'started' | 'session' | 'permission' | 'opencode' | 'output' | 'diagnostic' | 'error' | 'finished' | 'goal'
  event?: OpenCodeEvent
  permission?: AgentPermissionRequest
  sessionId?: string
  text?: string
  message?: string
  provider?: string
  code?: number
  signal?: string
  goal?: GoalState | null
}

export interface ExportedSession {
  info: {
    id: string
    title: string
    tokens?: { input: number; output: number; reasoning: number }
  }
  messages: Array<{
    info: {
      id: string
      role: 'user' | 'assistant'
      time: { created: number }
      tokens?: { total: number; input: number; output: number; reasoning: number }
    }
    parts: OpenCodePart[]
  }>
}

export interface UpdateEvent {
  status: 'checking' | 'available' | 'current' | 'downloading' | 'ready' | 'error'
  version?: string
  percent?: number
  message?: string
}

export interface TerminalInfo {
  id: string
  title: string
  command: string
  args: string[]
  cwd: string
  status: 'running' | 'exited'
  pid: number
  exitCode?: number
  mode: 'cli' | 'shell'
}

export interface TerminalEvent {
  ptyId: string
  type: 'data' | 'exit' | 'error'
  data?: string
  exitCode?: number
  message?: string
}

export interface WetoCodeBridge {
  getBootstrap: () => Promise<BootstrapData>
  getEngineStatus: () => Promise<BootstrapData['engine']>
  showMainWindow: () => Promise<boolean>
  chooseProject: () => Promise<(ProjectInfo & { sessions: SessionInfo[] }) | null>
  listSessions: (projectPath: string) => Promise<SessionInfo[]>
  getSession: (sessionId: string, projectPath: string) => Promise<ExportedSession | null>
  renameSession: (sessionId: string, projectPath: string, title: string) => Promise<SessionInfo[]>
  archiveSession: (sessionId: string, projectPath: string, archived: boolean) => Promise<SessionInfo[]>
  deleteSession: (sessionId: string, projectPath: string) => Promise<SessionInfo[]>
  forkSession: (sessionId: string, projectPath: string, messageId?: string) => Promise<SessionInfo>
  revertSession: (sessionId: string, projectPath: string, messageId: string) => Promise<boolean>
  unrevertSession: (sessionId: string, projectPath: string) => Promise<boolean>
  compactSession: (sessionId: string, projectPath: string, providerId: string) => Promise<boolean>
  runCommand: (sessionId: string | undefined, projectPath: string, providerId: string, command: string, args: string) => Promise<{ runId: string; sessionId: string }>
  getExtensions: (projectPath: string) => Promise<ExtensionOverview>
  getUsage: (range: UsageSummary['range']) => Promise<UsageSummary>
  listAutomations: () => Promise<AutomationTask[]>
  saveAutomation: (input: Partial<AutomationTask> & Pick<AutomationTask, 'name' | 'prompt' | 'projectPath' | 'providerId' | 'schedule'>) => Promise<AutomationTask[]>
  setAutomationEnabled: (id: string, enabled: boolean) => Promise<AutomationTask[]>
  runAutomationNow: (id: string) => Promise<{ automations: AutomationTask[]; result?: { runId: string; sessionId?: string } }>
  deleteAutomation: (id: string) => Promise<AutomationTask[]>
  getPreviewSuggestions: (projectPath: string) => Promise<PreviewSuggestion[]>
  getPreview: (projectPath: string) => Promise<PreviewState | null>
  startPreview: (projectPath: string, input: { command: string; url?: string }) => Promise<PreviewState>
  setPreviewUrl: (projectPath: string, url: string) => Promise<PreviewState>
  stopPreview: (projectPath: string) => Promise<boolean>
  openPreviewExternal: (projectPath: string, url: string) => Promise<boolean>
  runAgent: (request: {
    clientRunId: string
    prompt: string
    projectPath: string
    providerId: string
    sessionId?: string
    title?: string
    attachmentIds?: string[]
    goalObjective?: string
    goalLimits?: Partial<GoalState['limits']>
  }) => Promise<{ runId: string; sessionId?: string }>
  stopAgent: (runId: string) => Promise<boolean>
  listAgentTasks: () => Promise<BackgroundTask[]>
  dismissAgentTask: (runId: string) => Promise<boolean>
  replyPermission: (permissionId: string, response: 'once' | 'always' | 'reject') => Promise<boolean>
  getGoal: (sessionId: string, projectPath: string) => Promise<GoalState | null>
  setGoalStatus: (sessionId: string, projectPath: string, action: 'pause' | 'resume' | 'clear') => Promise<GoalState | null>
  createTerminal: (projectPath: string, size: { rows: number; cols: number }, mode?: TerminalInfo['mode']) => Promise<TerminalInfo>
  attachTerminal: (ptyId: string) => Promise<boolean>
  sendTerminalInput: (ptyId: string, data: string) => Promise<boolean>
  resizeTerminal: (ptyId: string, size: { rows: number; cols: number }) => Promise<boolean>
  closeTerminal: (ptyId: string) => Promise<boolean>
  readClipboardText: () => Promise<string>
  writeClipboardText: (value: string) => Promise<boolean>
  saveProvider: (provider: Partial<ProviderSettings> & { apiKey?: string }) => Promise<AppSettings>
  testProvider: (provider: Partial<ProviderSettings> & { apiKey?: string }) => Promise<{ ok: true; status: number; latencyMs: number; message: string }>
  deleteProvider: (id: string) => Promise<AppSettings>
  setActiveProvider: (id: string) => Promise<AppSettings>
  setAccessMode: (accessMode: AccessMode) => Promise<AppSettings>
  setReasoningEffort: (effort: ReasoningEffort) => Promise<AppSettings>
  setAppearance: (appearance: Partial<AppearanceSettings>) => Promise<AppSettings>
  getGitStatus: (projectPath: string) => Promise<GitStatusInfo>
  getGitDiff: (projectPath: string, filePath: string) => Promise<GitDiffInfo>
  discardGitChange: (projectPath: string, filePath: string) => Promise<GitStatusInfo>
  openProjectFolder: (projectPath: string) => Promise<boolean>
  createGitCheckpoint: (projectPath: string, label: string) => Promise<GitStatusInfo>
  restoreGitCheckpoint: (projectPath: string, checkpointId: string) => Promise<GitStatusInfo>
  deleteGitCheckpoint: (projectPath: string, checkpointId: string) => Promise<GitStatusInfo>
  listWorktrees: (projectPath: string) => Promise<WorktreeState>
  createWorktree: (projectPath: string, name: string) => Promise<{ state: WorktreeState; created: WorktreeInfo }>
  removeWorktree: (projectPath: string, directory: string) => Promise<WorktreeState>
  resetWorktree: (projectPath: string, directory: string) => Promise<WorktreeState>
  chooseAttachments: (projectPath: string) => Promise<ComposerAttachment[]>
  addProjectAttachment: (projectPath: string, relativePath: string) => Promise<ComposerAttachment>
  addDataAttachment: (projectPath: string, input: { name: string; dataUrl: string }) => Promise<ComposerAttachment>
  removeAttachment: (attachmentId: string) => Promise<boolean>
  listProjectFiles: (projectPath: string, relativePath: string) => Promise<ProjectFileNode[]>
  searchProjectFiles: (projectPath: string, query: string) => Promise<string[]>
  readProjectFile: (projectPath: string, relativePath: string) => Promise<ProjectFileContent>
  openProjectFile: (projectPath: string, relativePath: string) => Promise<boolean>
  checkForUpdates: () => Promise<{ status: string; message?: string; version?: string }>
  installUpdate: () => Promise<void>
  openExternal: (url: string) => Promise<boolean>
  onAgentEvent: (listener: (event: AgentEvent) => void) => void
  onAgentTasksChanged: (listener: (tasks: BackgroundTask[]) => void) => void
  onTerminalEvent: (listener: (event: TerminalEvent) => void) => void
  onUpdateEvent: (listener: (event: UpdateEvent) => void) => void
  onAutomationsChanged: (listener: (automations: AutomationTask[]) => void) => void
  onPreviewChanged: (listener: (preview: PreviewState) => void) => void
}

declare global {
  interface Window {
    wetocode?: WetoCodeBridge
  }
}
