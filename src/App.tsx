import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FitAddon as XtermFitAddon } from '@xterm/addon-fit'
import type { Terminal as XtermTerminal } from '@xterm/xterm'
import {
  AlertTriangle,
  Activity,
  Archive,
  ArchiveRestore,
  ArrowDownToLine,
  BellRing,
  CalendarClock,
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  CircleStop,
  Code2,
  Command,
  FileCode2,
  FileMinus2,
  FilePenLine,
  FilePlus2,
  FileSearch,
  Files,
  Folder,
  FolderGit2,
  FolderOpen,
  FolderTree,
  Gauge,
  Goal,
  GitBranch,
  GitCompare,
  History,
  Heart,
  Image,
  Leaf,
  KeyRound,
  LoaderCircle,
  ListTodo,
  Menu,
  Maximize2,
  MessageSquareText,
  Monitor,
  Moon,
  MoreHorizontal,
  Minimize2,
  Paperclip,
  PanelRightClose,
  PencilLine,
  Plus,
  Play,
  RefreshCw,
  RotateCcw,
  Rocket,
  Search,
  Send,
  SquareArrowOutUpRight,
  Settings,
  Plug,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  TerminalSquare,
  Trash2,
  Workflow,
  X,
  Zap,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { exportedToMessages, partToTool } from './lib/session'
import { mergeStreamText } from './lib/stream-text'
import { scrollToLatest } from './lib/scroll'
import { userErrorMessage } from './lib/error-message'
import { mockBridge } from './mockBridge'
import type {
  AccessMode,
  AgentEvent,
  AgentPermissionRequest,
  AppearanceSettings,
  AppSettings,
  AutomationSchedule,
  AutomationTask,
  BackgroundTask,
  BootstrapData,
  AgentCommandInfo,
  ChatMessage,
  ComposerAttachment,
  EnvironmentReport,
  GitDiffInfo,
  GitFileChange,
  GitStatusInfo,
  GoalState,
  ExtensionOverview,
  ProjectFileContent,
  ProjectFileNode,
  ProjectInfo,
  PreviewState,
  PreviewSuggestion,
  ProviderSettings,
  SessionInfo,
  ToolActivity,
  TerminalEvent,
  TerminalInfo,
  ModelRegistryResult,
  RegistryModel,
  UpdateEvent,
  UsageSummary,
  WorktreeInfo,
  WorktreeState,
} from './types'

const bridge = window.wetocode ?? mockBridge

const starterTasks = [
  { icon: Rocket, label: '从一句话创建应用', prompt: '我想从一句话开始创建一个应用。请先用容易理解的问题确认目标、使用场景和必须功能，再检查当前目录并开始搭建。' },
  { icon: FilePlus2, label: '搭建一个网页', prompt: '请帮我搭建一个可以直接运行的网页。先检查当前项目技术栈，再完成页面、交互和运行验证。' },
  { icon: FilePenLine, label: '修改现有代码', prompt: '请先理解当前项目，然后询问我想修改的功能；确认后直接实现并运行相关验证。' },
  { icon: AlertTriangle, label: '分析报错', prompt: '请帮我分析当前项目的报错。先读取相关日志和代码，用中文解释原因，再修复并验证。' },
  { icon: Workflow, label: '安装运行环境', prompt: '请检查这个项目需要的运行环境和依赖，用中文说明缺少什么；任何系统级安装或 PATH 修改前必须先征得我的确认。' },
  { icon: FileSearch, label: '了解这个项目', prompt: '请用小白能理解的中文介绍这个项目：它能做什么、如何运行、主要目录是什么，以及下一步可以从哪里开始。' },
]

const providerPresets = [
  { presetKey: 'openai', name: 'OpenAI', providerId: 'openai', protocol: 'openai-compatible' as const, model: 'gpt-5.4', baseUrl: '', contextWindow: 400000, outputLimit: 128000, kind: 'builtin' as const },
  { presetKey: 'anthropic', name: 'Anthropic', providerId: 'anthropic', protocol: 'anthropic' as const, model: 'claude-sonnet-4-5', baseUrl: '', contextWindow: 200000, outputLimit: 64000, kind: 'builtin' as const },
  { presetKey: 'google', name: 'Google Gemini', providerId: 'google', protocol: 'google' as const, model: 'gemini-2.5-pro', baseUrl: '', contextWindow: 1048576, outputLimit: 65536, kind: 'builtin' as const },
  { presetKey: 'xfyun', name: '讯飞星火', providerId: 'xfyun-spark', protocol: 'openai-compatible' as const, model: '4.0Ultra', baseUrl: 'https://spark-api-open.xf-yun.com/v1', contextWindow: 32768, outputLimit: 32768, kind: 'custom' as const, credentialLabel: 'API Password', credentialPlaceholder: '控制台中的 APIPassword', help: '复制讯飞开放平台控制台中的 APIPassword，不要填写 APPID 或 APISecret。' },
  { presetKey: 'alibaba', name: '阿里云百炼', providerId: 'alibaba-bailian', protocol: 'openai-compatible' as const, model: 'qwen3-coder-plus', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', contextWindow: 1000000, outputLimit: 65536, kind: 'custom' as const },
  { presetKey: 'zhipu', name: '智谱开放平台', providerId: 'zhipu-open', protocol: 'openai-compatible' as const, model: 'glm-4.5', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', contextWindow: 128000, outputLimit: 65536, kind: 'custom' as const },
  { presetKey: 'deepseek', name: 'DeepSeek', providerId: 'deepseek-open', protocol: 'openai-compatible' as const, model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com', contextWindow: 128000, outputLimit: 8192, kind: 'custom' as const },
  { presetKey: 'siliconflow', name: '硅基流动', providerId: 'siliconflow-open', protocol: 'openai-compatible' as const, model: 'Qwen/Qwen3-Coder-480B-A35B-Instruct', baseUrl: 'https://api.siliconflow.cn/v1', contextWindow: 262144, outputLimit: 65536, kind: 'custom' as const },
  { presetKey: 'modelscope', name: 'ModelScope', providerId: 'modelscope-open', protocol: 'openai-compatible' as const, model: 'Qwen/Qwen3-Coder-30B-A3B-Instruct', baseUrl: 'https://api-inference.modelscope.cn/v1', contextWindow: 262144, outputLimit: 65536, kind: 'custom' as const },
  { presetKey: 'volcengine', name: '火山方舟', providerId: 'volcengine-ark', protocol: 'openai-compatible' as const, model: 'doubao-seed-1-6-250615', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', contextWindow: 256000, outputLimit: 32768, kind: 'custom' as const },
  { presetKey: 'moonshot', name: 'Moonshot / Kimi', providerId: 'moonshot-open', protocol: 'openai-compatible' as const, model: 'kimi-k2.5', baseUrl: 'https://api.moonshot.cn/v1', contextWindow: 262144, outputLimit: 32768, kind: 'custom' as const },
  { presetKey: 'minimax', name: 'MiniMax', providerId: 'minimax-open', protocol: 'anthropic' as const, model: 'MiniMax-M2.5', baseUrl: 'https://api.minimaxi.com/anthropic/v1', contextWindow: 204800, outputLimit: 65536, kind: 'custom' as const },
  { presetKey: 'openrouter', name: 'OpenRouter', providerId: 'openrouter-open', protocol: 'openai-compatible' as const, model: 'anthropic/claude-sonnet-4.5', baseUrl: 'https://openrouter.ai/api/v1', contextWindow: 200000, outputLimit: 64000, kind: 'custom' as const },
  { presetKey: 'ollama', name: 'Ollama 本地模型', providerId: 'ollama', protocol: 'openai-compatible' as const, model: 'qwen3-coder', baseUrl: 'http://127.0.0.1:11434/v1', contextWindow: 128000, outputLimit: 16384, kind: 'custom' as const, credentialLabel: 'API Key（可选）', credentialPlaceholder: '本地 Ollama 通常无需填写' },
  { presetKey: 'generic-openai', name: '通用 OpenAI 中转', providerId: 'openai-gateway', protocol: 'openai-compatible' as const, model: 'your-model-id', baseUrl: 'https://gateway.example.com/v1', contextWindow: 128000, outputLimit: 16384, kind: 'custom' as const },
  { presetKey: 'generic-anthropic', name: '通用 Anthropic 中转', providerId: 'anthropic-gateway', protocol: 'anthropic' as const, model: 'your-model-id', baseUrl: 'https://gateway.example.com/v1', contextWindow: 200000, outputLimit: 16384, kind: 'custom' as const },
  { presetKey: 'generic-google', name: '通用 Gemini 中转', providerId: 'google-gateway', protocol: 'google' as const, model: 'your-model-id', baseUrl: 'https://gateway.example.com/v1beta', contextWindow: 1048576, outputLimit: 65536, kind: 'custom' as const },
]

const providerProtocolOptions = [
  { id: 'openai-compatible', label: 'OpenAI Compatible' },
  { id: 'anthropic', label: 'Anthropic Messages' },
  { id: 'google', label: 'Google Gemini' },
] as const

const accessModes: Array<{ id: AccessMode; label: string; description: string }> = [
  { id: 'confirm', label: '变更前确认', description: '修改文件和执行命令前逐项确认' },
  { id: 'auto', label: '自动编辑', description: '自动修改文件，高风险命令仍需确认' },
  { id: 'plan', label: '计划模式', description: '只分析并给出计划，不修改文件' },
  { id: 'full', label: '完全访问', description: '允许项目外访问和所有本机命令' },
]

function accessModeLabel(mode: AccessMode) {
  return accessModes.find((item) => item.id === mode)?.label || '自动编辑'
}

function goalStatusLabel(goal: GoalState) {
  return goal.status === 'active' ? '持续执行中' : goal.status === 'paused' ? '已暂停' : goal.status === 'complete' ? '已完成' : goal.status === 'budget_limited' ? '预算已用尽' : '需要处理'
}

function compactNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`
  return String(value)
}

function timeAgo(timestamp: number) {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(timestamp)
}

function toolLabel(tool = '') {
  const labels: Record<string, string> = {
    read: '读取文件', glob: '查找文件', grep: '检索代码', edit: '修改文件', write: '写入文件',
    patch: '应用补丁', bash: '执行命令', shell: '执行命令', task: '委派任务', webfetch: '读取网页',
    todowrite: '更新任务计划', skill: '加载专业能力', question: '等待确认',
  }
  return labels[tool.toLowerCase()] || tool || '使用工具'
}

function toolIcon(tool: string) {
  if (['bash', 'shell'].includes(tool)) return TerminalSquare
  if (['edit', 'write', 'patch'].includes(tool)) return PencilLine
  if (['grep', 'glob'].includes(tool)) return Search
  return FileSearch
}

function permissionLabel(permission: string) {
  const labels: Record<string, string> = {
    external_directory: '访问项目外目录',
    doom_loop: '继续重复执行操作',
    read: '读取受保护文件',
    bash: '执行高风险命令',
    edit: '修改文件',
    webfetch: '访问外部网络',
  }
  return labels[permission] || `执行 ${permission} 操作`
}

function permissionDetails(metadata: Record<string, unknown>) {
  const preferred = ['command', 'path', 'file', 'url']
    .map((key) => metadata[key])
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
  return preferred.length ? preferred : ['此操作没有提供更多目标信息']
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('无法读取附件。')))
    reader.addEventListener('error', () => reject(new Error('无法读取附件。')))
    reader.readAsDataURL(file)
  })
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function isActiveTask(task: BackgroundTask) {
  return task.status === 'running' || task.status === 'waiting_permission'
}

function recoveredMessages(task: BackgroundTask, exported: Awaited<ReturnType<typeof bridge.getSession>>) {
  if (!exported) return []
  const restored = exportedToMessages(exported)
  if (!isActiveTask(task)) return restored
  let assistantIndex = -1
  for (let index = restored.length - 1; index >= 0; index -= 1) {
    if (restored[index].role === 'assistant') {
      assistantIndex = index
      break
    }
  }
  if (assistantIndex >= 0) {
    return restored.map((message, index) => index === assistantIndex
      ? { ...message, runId: task.runId, running: true }
      : message)
  }
  return [...restored, {
    id: `recovered-${task.runId}`,
    role: 'assistant' as const,
    text: '',
    createdAt: task.startedAt,
    runId: task.runId,
    running: true,
    tools: [],
  }]
}

function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null)
  const [project, setProject] = useState<ProjectInfo | null>(null)
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string>()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [prompt, setPrompt] = useState('')
  const [activeRunId, setActiveRunId] = useState<string>()
  const [runSessionId, setRunSessionId] = useState<string>()
  const [panel, setPanel] = useState<'none' | 'settings' | 'models' | 'context' | 'changes' | 'tasks' | 'files' | 'extensions' | 'usage' | 'automations'>('none')
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTask[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [toast, setToast] = useState<string>()
  const [update, setUpdate] = useState<UpdateEvent>()
  const [accessMenuOpen, setAccessMenuOpen] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [switchingProvider, setSwitchingProvider] = useState(false)
  const [confirmFullControl, setConfirmFullControl] = useState(false)
  const [savingAccessMode, setSavingAccessMode] = useState(false)
  const [sessionSearch, setSessionSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [sessionMenuId, setSessionMenuId] = useState<string>()
  const [sessionDialog, setSessionDialog] = useState<{ type: 'rename' | 'delete'; session: SessionInfo }>()
  const [sessionTitle, setSessionTitle] = useState('')
  const [sessionBusy, setSessionBusy] = useState(false)
  const [gitStatus, setGitStatus] = useState<GitStatusInfo>()
  const [permissionRequest, setPermissionRequest] = useState<AgentPermissionRequest>()
  const [permissionBusy, setPermissionBusy] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalHeight, setTerminalHeight] = useState<number>()
  const [worktreeState, setWorktreeState] = useState<WorktreeState>()
  const [worktreeMenuOpen, setWorktreeMenuOpen] = useState(false)
  const [worktreeDialog, setWorktreeDialog] = useState<{ type: 'create' } | { type: 'remove' | 'reset'; worktree: WorktreeInfo }>()
  const [worktreeName, setWorktreeName] = useState('')
  const [worktreeBusy, setWorktreeBusy] = useState(false)
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([])
  const [goalMode, setGoalMode] = useState(false)
  const [goal, setGoal] = useState<GoalState | null>(null)
  const [goalDialogOpen, setGoalDialogOpen] = useState(false)
  const [goalLimits, setGoalLimits] = useState({ maxIterations: 8, maxMinutes: 120, maxTokens: 1_000_000 })
  const [fileSuggestions, setFileSuggestions] = useState<string[]>([])
  const [commandSuggestions, setCommandSuggestions] = useState<AgentCommandInfo[]>([])
  const [automations, setAutomations] = useState<AutomationTask[]>([])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState(0)
  const [environmentReport, setEnvironmentReport] = useState<EnvironmentReport>()
  const [doctorBusy, setDoctorBusy] = useState(false)
  const messagesRef = useRef<HTMLDivElement>(null)
  const persistedTerminalHeight = bootstrap?.settings.appearance.terminal.height

  useEffect(() => {
    bridge.getBootstrap().then(async (data) => {
      setBootstrap(data)
      setSidebarOpen(data.settings.appearance.sidebarOpen)
      if (!data.settings.onboardingCompleted && !data.settings.recentProjects.length) setOnboardingOpen(true)
      void bridge.getEngineStatus().then((engine) => {
        setBootstrap((current) => current ? { ...current, engine } : current)
        if (!engine.installed) setToast('本地执行引擎未就绪，请重新安装 WetoCode。')
      }).catch(() => setToast('本地执行引擎状态检查失败，任务启动时将重试。'))
      const tasks = await bridge.listAgentTasks().catch(() => [])
      setBackgroundTasks(tasks)
      setAutomations(await bridge.listAutomations().catch(() => []))
      const activeTask = tasks.find(isActiveTask)
      const initialPath = activeTask?.projectPath || data.settings.recentProjects[0]
      if (initialPath) setProject({ path: initialPath, name: initialPath.split(/[\\/]/).filter(Boolean).pop() || initialPath })
      if (activeTask) {
        setActiveSessionId(activeTask.sessionId)
        setRunSessionId(activeTask.sessionId)
        const exported = await bridge.getSession(activeTask.sessionId, activeTask.projectPath).catch(() => null)
        const refreshedTasks = await bridge.listAgentTasks().catch(() => tasks)
        const refreshedTask = refreshedTasks.find((task) => task.runId === activeTask.runId) || activeTask
        setBackgroundTasks(refreshedTasks)
        setActiveRunId(isActiveTask(refreshedTask) ? refreshedTask.runId : undefined)
        setPermissionRequest(isActiveTask(refreshedTask) ? refreshedTask.permission : undefined)
        setGoal(refreshedTask.goal || null)
        setGoalMode(Boolean(refreshedTask.goal))
        setMessages(recoveredMessages(refreshedTask, exported))
      }
    }).catch((error: Error) => setToast(error.message))
  }, [])

  useEffect(() => {
    if (persistedTerminalHeight) setTerminalHeight(persistedTerminalHeight)
  }, [persistedTerminalHeight])

  useEffect(() => {
    if (!project) return
    bridge.listSessions(project.path).then(setSessions)
    bridge.getGitStatus(project.path).then(setGitStatus).catch(() => {
      setGitStatus({ isRepository: false, reason: '无法读取 Git 状态。', changes: [], checkpoints: [] })
    })
    bridge.listWorktrees(project.path).then(setWorktreeState).catch(() => setWorktreeState(undefined))
    bridge.getPreview(project.path).then(setPreview).catch(() => setPreview(null))
  }, [project])

  useEffect(() => {
    scrollToLatest(messagesRef.current)
  }, [messages])

  const handleAgentEvent = useCallback((payload: AgentEvent) => {
    if (payload.type === 'session' && payload.sessionId && payload.runId === activeRunId) setRunSessionId(payload.sessionId)
    if (payload.type === 'permission' && payload.permission) setPermissionRequest(payload.permission)
    if (payload.type === 'goal' && payload.runId === activeRunId) setGoal(payload.goal || null)
    if (payload.type === 'opencode' && payload.event) {
      const event = payload.event
      if (event.sessionID) setRunSessionId(event.sessionID)
      const part = event.part
      if (!part) return
      setMessages((current) => current.map((message) => {
        if (message.runId !== payload.runId) return message
        if (event.type === 'text' && part.text) return { ...message, text: mergeStreamText(message.text, part.text, event.textMode || 'delta') }
        if (event.type === 'tool_use') {
          const nextTool = partToTool(part)
          const tools = [...(message.tools || [])]
          const index = tools.findIndex((tool) => tool.id === nextTool.id)
          if (index === -1) tools.push(nextTool)
          else tools[index] = nextTool
          return { ...message, tools }
        }
        if (event.type === 'step_finish' && part.tokens) {
          return {
            ...message,
            tokens: {
              total: part.tokens.total || 0,
              input: part.tokens.input || 0,
              output: part.tokens.output || 0,
              reasoning: part.tokens.reasoning || 0,
            },
          }
        }
        return message
      }))
    }
    if (payload.type === 'output' && payload.text) {
      setMessages((current) => current.map((message) => message.runId === payload.runId
        ? { ...message, text: `${message.text}${payload.text}\n` }
        : message))
    }
    if (payload.type === 'error') {
      setMessages((current) => current.map((message) => message.runId === payload.runId
        ? { ...message, text: message.text || `运行失败：${payload.message}`, running: false }
        : message))
      setActiveRunId((current) => current === payload.runId ? undefined : current)
      setPermissionRequest((current) => current?.runId === payload.runId ? undefined : current)
    }
    if (payload.type === 'finished') {
      setMessages((current) => current.map((message) => message.runId === payload.runId
        ? { ...message, text: message.text || (payload.code === 0 ? '任务已完成。' : `任务异常结束（代码 ${payload.code}）。`), running: false }
        : message))
      setActiveRunId((current) => current === payload.runId ? undefined : current)
      setPermissionRequest((current) => current?.runId === payload.runId ? undefined : current)
      if (project) bridge.listSessions(project.path).then(setSessions)
      if (project) bridge.getGitStatus(project.path).then(setGitStatus).catch(() => {})
    }
  }, [activeRunId, project])

  useEffect(() => {
    bridge.onAgentEvent(handleAgentEvent)
  }, [handleAgentEvent])
  useEffect(() => {
    bridge.onAgentTasksChanged(setBackgroundTasks)
  }, [])
  useEffect(() => {
    bridge.onUpdateEvent(setUpdate)
  }, [])
  useEffect(() => {
    bridge.onAutomationsChanged(setAutomations)
    bridge.onPreviewChanged((next) => setPreview((current) => !project || next.projectPath === project.path ? next : current))
  }, [project])

  const activeProvider = useMemo(() => {
    if (!bootstrap) return undefined
    return bootstrap.settings.providers.find((item) => item.id === bootstrap.settings.activeProviderId)
      || bootstrap.settings.providers[0]
  }, [bootstrap])

  const tokenTotal = useMemo(() => messages.reduce((sum, message) => sum + (message.tokens?.total || 0), 0), [messages])
  const contextPercent = activeProvider ? Math.min(100, Math.round((tokenTotal / activeProvider.contextWindow) * 100)) : 0
  const visibleSessions = useMemo(() => {
    const query = sessionSearch.trim().toLocaleLowerCase('zh-CN')
    return sessions.filter((session) => Boolean(session.archived) === showArchived
      && (!query || session.title.toLocaleLowerCase('zh-CN').includes(query)))
  }, [sessionSearch, sessions, showArchived])
  const archivedSessionCount = useMemo(() => sessions.filter((session) => session.archived).length, [sessions])
  const activeTaskCount = useMemo(() => backgroundTasks.filter(isActiveTask).length, [backgroundTasks])
  const enabledAutomationCount = useMemo(() => automations.filter((item) => item.enabled).length, [automations])

  async function chooseProject() {
    const selection = await bridge.chooseProject()
    if (!selection) return false
    detachCurrentTask()
    setProject({ path: selection.path, name: selection.name })
    setPreviewOpen(false)
    setSessions(selection.sessions)
    setMessages([])
    setActiveSessionId(undefined)
    setRunSessionId(undefined)
    setGoal(null)
    setGoalMode(false)
    clearAttachments()
    setBootstrap((current) => current ? {
      ...current,
      settings: {
        ...current.settings,
        recentProjects: [selection.path, ...current.settings.recentProjects.filter((item) => item !== selection.path)],
      },
    } : current)
    return true
  }

  function openRecent(projectPath: string) {
    openWorkspace(projectPath)
  }

  function openWorkspace(projectPath: string) {
    detachCurrentTask()
    setProject({ path: projectPath, name: projectPath.split(/[\\/]/).filter(Boolean).pop() || projectPath })
    setMessages([])
    setActiveSessionId(undefined)
    setRunSessionId(undefined)
    setTerminalOpen(false)
    setPreviewOpen(false)
    setWorktreeMenuOpen(false)
    clearAttachments()
  }

  async function openSession(session: SessionInfo) {
    if (!project) return
    detachCurrentTask()
    setActiveSessionId(session.id)
    setRunSessionId(session.id)
    const exported = await bridge.getSession(session.id, project.path)
    if (exported) setMessages(exportedToMessages(exported))
    else setToast('暂时无法读取该会话。')
    const restoredGoal = await bridge.getGoal(session.id, project.path).catch(() => null)
    setGoal(restoredGoal)
    setGoalMode(Boolean(restoredGoal))
  }

  async function openBackgroundTask(task: BackgroundTask) {
    setProject({ path: task.projectPath, name: task.projectPath.split(/[\\/]/).filter(Boolean).pop() || task.projectPath })
    setActiveSessionId(task.sessionId)
    setRunSessionId(task.sessionId)
    setActiveRunId(isActiveTask(task) ? task.runId : undefined)
    setPermissionRequest(task.permission)
    setGoal(task.goal || null)
    setGoalMode(Boolean(task.goal))
    try {
      const exported = await bridge.getSession(task.sessionId, task.projectPath)
      if (exported) setMessages(recoveredMessages(task, exported))
      else setToast('暂时无法读取该任务。')
      setPanel('none')
    } catch (error) {
      setToast((error as Error).message)
    }
  }

  async function dismissBackgroundTask(task: BackgroundTask) {
    if (isActiveTask(task)) return
    if (await bridge.dismissAgentTask(task.runId)) {
      setBackgroundTasks((current) => current.filter((item) => item.runId !== task.runId))
    }
  }

  async function sendPrompt(value = prompt) {
    const clean = value.trim()
    if ((!clean && !attachments.length) || !project || !activeProvider || activeRunId) return
    const localRunId = crypto.randomUUID()
    const sentAttachments = attachments
    setActiveRunId(localRunId)
    setPrompt('')
    setAttachments([])
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', text: clean, createdAt: Date.now(), attachments: sentAttachments },
      { id: crypto.randomUUID(), role: 'assistant', text: '', createdAt: Date.now(), runId: localRunId, running: true, tools: [] },
    ])
    try {
      const result = await bridge.runAgent({
        clientRunId: localRunId,
        prompt: clean,
        projectPath: project.path,
        providerId: activeProvider.id,
        sessionId: runSessionId,
        attachmentIds: sentAttachments.map((item) => item.id),
        goalObjective: goalMode && !goal ? clean : undefined,
        goalLimits: goalMode && !goal ? goalLimits : undefined,
      })
      setActiveRunId(result.runId)
      if (result.sessionId) setRunSessionId(result.sessionId)
      if (result.sessionId && goalMode && !goal) setGoal(await bridge.getGoal(result.sessionId, project.path).catch(() => null))
      setMessages((current) => current.map((message) => message.runId === localRunId ? { ...message, runId: result.runId } : message))
    } catch (error) {
      setActiveRunId(undefined)
      setAttachments(sentAttachments)
      setMessages((current) => current.map((message) => message.runId === localRunId
        ? { ...message, text: `无法启动任务：${(error as Error).message}`, running: false }
        : message))
    }
  }

  async function executeCommand(command: AgentCommandInfo) {
    if (!project || !activeProvider || activeRunId) return
    const match = prompt.match(/^\/\S+\s*(.*)$/s)
    const args = match?.[1] || ''
    const localRunId = crypto.randomUUID()
    setPrompt(''); setCommandSuggestions([]); setActiveRunId(localRunId)
    setMessages((current) => [...current,
      { id: crypto.randomUUID(), role: 'user', text: `/${command.name}${args ? ` ${args}` : ''}`, createdAt: Date.now() },
      { id: crypto.randomUUID(), role: 'assistant', text: '', createdAt: Date.now(), runId: localRunId, running: true, tools: [] },
    ])
    try {
      const result = await bridge.runCommand(runSessionId, project.path, activeProvider.id, command.name, args)
      setRunSessionId(result.sessionId); setActiveRunId(result.runId)
      setMessages((current) => current.map((message) => message.runId === localRunId ? { ...message, runId: result.runId } : message))
    } catch (error) {
      setActiveRunId(undefined)
      setMessages((current) => current.map((message) => message.runId === localRunId ? { ...message, text: `无法执行命令：${(error as Error).message}`, running: false } : message))
    }
  }

  function newSession() {
    detachCurrentTask()
    setMessages([])
    setActiveSessionId(undefined)
    setRunSessionId(undefined)
    setGoal(null)
    setGoalMode(false)
    clearAttachments()
  }

  function detachCurrentTask() {
    setActiveRunId(undefined)
    setPermissionRequest(undefined)
  }

  function clearAttachments() {
    attachments.forEach((item) => { void bridge.removeAttachment(item.id) })
    setAttachments([])
  }

  async function chooseAttachments() {
    if (!project || activeRunId) return
    try {
      const selected = await bridge.chooseAttachments(project.path)
      const available = Math.max(0, 12 - attachments.length)
      selected.slice(available).forEach((item) => { void bridge.removeAttachment(item.id) })
      setAttachments((current) => [...current, ...selected.slice(0, available)])
    } catch (error) {
      setToast((error as Error).message)
    }
  }

  async function addProjectReference(relativePath: string) {
    if (!project || activeRunId || attachments.length >= 12) return
    try {
      const attachment = await bridge.addProjectAttachment(project.path, relativePath)
      setAttachments((current) => current.some((item) => item.relativePath === relativePath) ? current : [...current, attachment].slice(0, 12))
      setFileSuggestions([])
    } catch (error) { setToast((error as Error).message) }
  }

  function chooseFileSuggestion(relativePath: string) {
    const next = prompt.replace(/@[^\s@]*$/, `@${relativePath} `)
    setPrompt(next)
    void addProjectReference(relativePath)
  }

  async function addPastedAttachments(files: FileList) {
    if (!project || activeRunId) return
    for (const file of Array.from(files).slice(0, 12 - attachments.length)) {
      if (!file.type.startsWith('image/')) continue
      try {
        const dataUrl = await fileToDataUrl(file)
        const attachment = await bridge.addDataAttachment(project.path, { name: file.name || `截图-${Date.now()}.png`, dataUrl })
        setAttachments((current) => [...current, attachment].slice(0, 12))
      } catch (error) {
        setToast((error as Error).message)
      }
    }
  }

  function removeAttachment(attachment: ComposerAttachment) {
    setAttachments((current) => current.filter((item) => item.id !== attachment.id))
    void bridge.removeAttachment(attachment.id)
  }

  function leaveSession(sessionId: string) {
    if (activeSessionId !== sessionId) return
    setMessages([])
    setActiveSessionId(undefined)
    setRunSessionId(undefined)
  }

  async function archiveSession(session: SessionInfo, archived: boolean) {
    if (!project || activeRunId || sessionBusy) return
    setSessionBusy(true)
    try {
      setSessions(await bridge.archiveSession(session.id, project.path, archived))
      if (archived) leaveSession(session.id)
      setSessionMenuId(undefined)
    } catch (error) {
      setToast((error as Error).message)
    } finally {
      setSessionBusy(false)
    }
  }

  async function submitSessionDialog() {
    if (!project || !sessionDialog || sessionBusy) return
    setSessionBusy(true)
    try {
      if (sessionDialog.type === 'rename') {
        setSessions(await bridge.renameSession(sessionDialog.session.id, project.path, sessionTitle))
      } else {
        setSessions(await bridge.deleteSession(sessionDialog.session.id, project.path))
        leaveSession(sessionDialog.session.id)
      }
      setSessionDialog(undefined)
      setSessionMenuId(undefined)
    } catch (error) {
      setToast((error as Error).message)
    } finally {
      setSessionBusy(false)
    }
  }

  function updateSettings(settings: AppSettings) {
    setBootstrap((current) => current ? { ...current, settings } : current)
  }

  async function refreshGitStatus() {
    if (!project) return
    try { setGitStatus(await bridge.getGitStatus(project.path)) }
    catch (error) { setToast((error as Error).message) }
  }

  async function changeAccessMode(accessMode: AccessMode) {
    if (savingAccessMode) return
    setSavingAccessMode(true)
    try {
      updateSettings(await bridge.setAccessMode(accessMode))
      setAccessMenuOpen(false)
      setConfirmFullControl(false)
    } catch (error) {
      setToast((error as Error).message)
    } finally {
      setSavingAccessMode(false)
    }
  }

  async function changeReasoningEffort(effort: AppSettings['reasoningEffort']) {
    try { updateSettings(await bridge.setReasoningEffort(effort)) }
    catch (error) { setToast((error as Error).message) }
  }

  async function changeGoalStatus(action: 'pause' | 'resume' | 'clear') {
    if (!project || !runSessionId) return
    try {
      const next = await bridge.setGoalStatus(runSessionId, project.path, action)
      setGoal(next)
      setGoalMode(Boolean(next))
      if (action === 'resume' && next) {
        const task = (await bridge.listAgentTasks()).find((item) => item.sessionId === runSessionId && isActiveTask(item))
        if (!task) throw new Error('目标状态已恢复，但没有找到继续执行的后台任务。')
        setActiveRunId(task.runId)
        setMessages((current) => [...current, {
          id: crypto.randomUUID(), role: 'assistant', text: '', createdAt: Date.now(), runId: task.runId, running: true, tools: [],
        }])
      }
    } catch (error) {
      setToast((error as Error).message)
    }
  }

  async function forkFromMessage(messageId?: string) {
    if (!project || !runSessionId || activeRunId) return
    try {
      const fork = await bridge.forkSession(runSessionId, project.path, messageId)
      setSessions(await bridge.listSessions(project.path))
      setActiveSessionId(fork.id); setRunSessionId(fork.id); setGoal(null); setGoalMode(false)
      const exported = await bridge.getSession(fork.id, project.path)
      setMessages(exported ? exportedToMessages(exported) : [])
    } catch (error) { setToast((error as Error).message) }
  }

  async function revertToMessage(messageId: string) {
    if (!project || !runSessionId || activeRunId) return
    try {
      await bridge.revertSession(runSessionId, project.path, messageId)
      const exported = await bridge.getSession(runSessionId, project.path)
      setMessages(exported ? exportedToMessages(exported) : [])
    } catch (error) { setToast((error as Error).message) }
  }

  async function restoreRevertedSession() {
    if (!project || !runSessionId || activeRunId) return
    try {
      await bridge.unrevertSession(runSessionId, project.path)
      const exported = await bridge.getSession(runSessionId, project.path)
      setMessages(exported ? exportedToMessages(exported) : [])
    } catch (error) { setToast((error as Error).message) }
  }

  async function compactCurrentSession() {
    if (!project || !runSessionId || !activeProvider || activeRunId) return
    try {
      await bridge.compactSession(runSessionId, project.path, activeProvider.id)
      setToast('上下文已压缩，关键目标和近期内容将继续保留。')
    } catch (error) { setToast((error as Error).message) }
  }

  async function changeAppearance(appearance: Partial<AppearanceSettings>) {
    try {
      const settings = await bridge.setAppearance(appearance)
      updateSettings(settings)
      if (typeof appearance.sidebarOpen === 'boolean') setSidebarOpen(appearance.sidebarOpen)
    } catch (error) {
      setToast((error as Error).message)
    }
  }

  async function changeTerminalAppearance(terminal: Partial<AppearanceSettings['terminal']>) {
    if (!bootstrap) return
    await changeAppearance({ terminal: { ...bootstrap.settings.appearance.terminal, ...terminal } })
  }

  async function runEnvironmentDoctor() {
    setDoctorBusy(true)
    try {
      setEnvironmentReport(await bridge.getEnvironmentDoctor(project?.path))
    } catch (error) {
      setToast((error as Error).message)
    } finally {
      setDoctorBusy(false)
    }
  }

  async function finishOnboarding(firstPrompt?: string) {
    try {
      updateSettings(await bridge.setOnboardingCompleted(true))
      if (firstPrompt?.trim()) setPrompt(firstPrompt.trim())
      setOnboardingOpen(false)
    } catch (error) {
      setToast((error as Error).message)
    }
  }

  async function changeActiveProvider(providerId: string) {
    if (activeRunId || switchingProvider) return
    if (providerId === activeProvider?.id) {
      setModelMenuOpen(false)
      return
    }
    setSwitchingProvider(true)
    try {
      updateSettings(await bridge.setActiveProvider(providerId))
      setModelMenuOpen(false)
    } catch (error) {
      setToast((error as Error).message)
    } finally {
      setSwitchingProvider(false)
    }
  }

  async function replyPermission(response: 'once' | 'always' | 'reject') {
    if (!permissionRequest || permissionBusy) return
    setPermissionBusy(true)
    try {
      await bridge.replyPermission(permissionRequest.id, response)
      setPermissionRequest(undefined)
    } catch (error) {
      setToast((error as Error).message)
      setPermissionRequest(undefined)
    } finally {
      setPermissionBusy(false)
    }
  }

  async function submitWorktreeDialog() {
    if (!project || !worktreeDialog || worktreeBusy) return
    setWorktreeBusy(true)
    try {
      if (worktreeDialog.type === 'create') {
        const result = await bridge.createWorktree(project.path, worktreeName)
        setWorktreeState(result.state)
        openWorkspace(result.created.directory)
      } else if (worktreeDialog.type === 'remove') {
        const state = await bridge.removeWorktree(project.path, worktreeDialog.worktree.directory)
        setWorktreeState(state)
        if (project.path === worktreeDialog.worktree.directory) openWorkspace(state.primaryPath)
      } else {
        setWorktreeState(await bridge.resetWorktree(project.path, worktreeDialog.worktree.directory))
        if (project.path === worktreeDialog.worktree.directory) {
          setMessages([])
          setActiveSessionId(undefined)
          setRunSessionId(undefined)
          setTerminalOpen(false)
        }
      }
      setWorktreeDialog(undefined)
      setWorktreeName('')
      setWorktreeMenuOpen(false)
    } catch (error) {
      setToast((error as Error).message)
    } finally {
      setWorktreeBusy(false)
    }
  }

  async function toggleWorktreeMenu() {
    if (!project || worktreeMenuOpen) {
      setWorktreeMenuOpen(false)
      return
    }
    try {
      setWorktreeState(await bridge.listWorktrees(project.path))
      setWorktreeMenuOpen(true)
    } catch (error) {
      setToast((error as Error).message)
    }
  }

  async function setSidebarVisibility(open: boolean) {
    await changeAppearance({ sidebarOpen: open })
  }

  if (!bootstrap) {
    return <div className="app-loading"><div className="brand-mark large">W</div><LoaderCircle className="spin" size={22} /><span>正在启动 WetoCode...</span></div>
  }

  const terminalSettings = bootstrap.settings.appearance.terminal
  const customAppearance = bootstrap.settings.appearance.custom
  const activeTerminalHeight = terminalHeight ?? terminalSettings.height
  const appStyle = {
    '--terminal-height': `${activeTerminalHeight}px`,
    '--green': customAppearance.accent || undefined,
    '--green-dark': customAppearance.accent || undefined,
    '--bg': customAppearance.background || undefined,
    '--surface': customAppearance.surface ? `color-mix(in srgb, ${customAppearance.surface} ${customAppearance.transparency}%, transparent)` : undefined,
    '--custom-radius': `${customAppearance.radius}px`,
    '--shadow-strength': `${customAppearance.shadow}`,
    '--background-image': customAppearance.backgroundImage ? `url("${customAppearance.backgroundImage.replaceAll('"', '%22')}")` : undefined,
  } as React.CSSProperties

  return (
    <div className={`app-shell ${sidebarOpen ? '' : 'sidebar-collapsed'} ${panel !== 'none' ? 'panel-open' : ''} ${panel === 'changes' || panel === 'files' ? 'changes-open' : ''} ${customAppearance.animations ? '' : 'reduce-motion'}`} data-theme={bootstrap.settings.appearance.theme} data-density={bootstrap.settings.appearance.density} style={appStyle}>
      <header className="titlebar">
        <div className="brand"><div className="brand-mark">W</div><div><strong>WetoCode</strong><span>中文桌面 Coding Agent</span></div></div>
        <div className="project-switcher">
          <FolderOpen size={15} />
          <button onClick={chooseProject}>{project?.name || '选择项目'}</button>
          {project && <div className="worktree-control">
            <button className="worktree-button" disabled={Boolean(activeRunId) || !worktreeState?.isRepository} aria-expanded={worktreeMenuOpen} onClick={() => void toggleWorktreeMenu()}><GitBranch size={13} /><span>{!worktreeState ? '工作区' : worktreeState.activePath === worktreeState.primaryPath ? '主工作区' : worktreeState.worktrees.find((item) => item.directory === worktreeState.activePath)?.name || '隔离工作区'}</span><ChevronDown size={12} /></button>
            {worktreeMenuOpen && worktreeState?.isRepository && <div className="worktree-menu">
              {[worktreeState.primary, ...worktreeState.worktrees].filter((item): item is WorktreeInfo => Boolean(item)).map((item) => <div className={`worktree-menu-row ${item.directory === worktreeState.activePath ? 'active' : ''}`} key={item.directory}>
                <button onClick={() => openWorkspace(item.directory)}><FolderGit2 size={14} /><span><b>{item.primary ? '主工作区' : item.name}</b><small>{item.branch || '未命名分支'}{item.dirty ? ' · 有变更' : ''}</small></span>{item.directory === worktreeState.activePath && <Check size={13} />}</button>
                {!item.primary && <div><button title="重置隔离工作区" onClick={() => setWorktreeDialog({ type: 'reset', worktree: item })}><RotateCcw size={13} /></button><button title="删除隔离工作区" disabled={item.dirty} onClick={() => setWorktreeDialog({ type: 'remove', worktree: item })}><Trash2 size={13} /></button></div>}
              </div>)}
              <button className="worktree-create" onClick={() => { setWorktreeDialog({ type: 'create' }); setWorktreeName('') }}><Plus size={14} />新建隔离工作区</button>
            </div>}
          </div>}
        </div>
        <div className="header-actions">
          <button className={`icon-btn ${terminalOpen ? 'active' : ''}`} title={terminalOpen ? '关闭终端' : '打开终端'} disabled={!project} onClick={() => setTerminalOpen((open) => !open)}><TerminalSquare size={18} /></button>
          <button className={`icon-btn ${previewOpen ? 'active' : ''}`} title="开发预览" disabled={!project} onClick={() => { setPreviewOpen((open) => !open); setTerminalOpen(false) }}><Monitor size={18} /></button>
          <button className={`icon-btn ${panel === 'files' ? 'active' : ''}`} title="项目文件" disabled={!project} onClick={() => setPanel(panel === 'files' ? 'none' : 'files')}><FolderTree size={18} /></button>
          <button className={`icon-btn ${panel === 'extensions' ? 'active' : ''}`} title="扩展中心" disabled={!project} onClick={() => setPanel(panel === 'extensions' ? 'none' : 'extensions')}><Plug size={18} /></button>
          <button className={`icon-btn ${panel === 'models' ? 'active' : ''}`} title="模型中心" onClick={() => setPanel(panel === 'models' ? 'none' : 'models')}><Sparkles size={18} /></button>
          <button className={`icon-btn automation-button ${panel === 'automations' ? 'active' : ''}`} title="自动化任务" onClick={() => setPanel(panel === 'automations' ? 'none' : 'automations')}><CalendarClock size={18} />{enabledAutomationCount ? <span>{enabledAutomationCount > 9 ? '9+' : enabledAutomationCount}</span> : null}</button>
          <button className={`icon-btn ${panel === 'usage' ? 'active' : ''}`} title="使用统计" onClick={() => setPanel(panel === 'usage' ? 'none' : 'usage')}><Activity size={18} /></button>
          <button className={`icon-btn tasks-button ${panel === 'tasks' ? 'active' : ''}`} title="后台任务" onClick={() => setPanel(panel === 'tasks' ? 'none' : 'tasks')}>
            <ListTodo size={18} />{activeTaskCount ? <span>{activeTaskCount > 9 ? '9+' : activeTaskCount}</span> : null}
          </button>
          <button className={`icon-btn changes-button ${panel === 'changes' ? 'active' : ''}`} title="查看变更" onClick={() => setPanel(panel === 'changes' ? 'none' : 'changes')}>
            <GitCompare size={18} />{gitStatus?.changes.length ? <span>{gitStatus.changes.length > 99 ? '99+' : gitStatus.changes.length}</span> : null}
          </button>
          <button className="icon-btn" title="上下文状态" onClick={() => setPanel(panel === 'context' ? 'none' : 'context')}><BrainCircuit size={18} /></button>
          <button className="icon-btn" title="设置" onClick={() => setPanel(panel === 'settings' ? 'none' : 'settings')}><Settings size={18} /></button>
        </div>
      </header>

      <aside className="sidebar">
        <div className="sidebar-tools">
          <button className="primary-action" onClick={newSession}><Plus size={17} /><span>新建任务</span></button>
          <button className="icon-btn sidebar-toggle" title="收起侧栏" onClick={() => void setSidebarVisibility(false)}><Menu size={18} /></button>
        </div>
        <div className="sidebar-scroll">
          <section className="side-section">
            <div className="section-label"><span>项目</span><button title="打开项目" onClick={chooseProject}><Plus size={14} /></button></div>
            {bootstrap.settings.recentProjects.map((item) => (
              <button key={item} className={`project-item ${project?.path === item ? 'active' : ''}`} onClick={() => openRecent(item)} title={item}>
                <Folder size={16} /><span>{item.split(/[\\/]/).filter(Boolean).pop()}</span>{project?.path === item && <span className="active-dot" />}
              </button>
            ))}
            {!bootstrap.settings.recentProjects.length && <button className="empty-project" onClick={chooseProject}><FolderOpen size={18} />打开第一个项目</button>}
          </section>

          <section className="side-section sessions-section">
            <div className="section-label"><span>任务</span><button title="刷新" onClick={() => project && bridge.listSessions(project.path).then(setSessions)}><RefreshCw size={13} /></button></div>
            <div className="session-filters">
              <label><Search size={13} /><input value={sessionSearch} onChange={(event) => setSessionSearch(event.target.value)} placeholder="搜索任务" /></label>
              <div className="session-tabs">
                <button className={!showArchived ? 'active' : ''} onClick={() => setShowArchived(false)}>最近</button>
                <button className={showArchived ? 'active' : ''} onClick={() => setShowArchived(true)}>归档{archivedSessionCount ? ` ${archivedSessionCount}` : ''}</button>
              </div>
            </div>
            <div className="session-list">
              {visibleSessions.map((session) => (
                <div key={session.id} className={`session-row ${activeSessionId === session.id ? 'active' : ''}`}>
                  <button className="session-item" onClick={() => openSession(session)}>
                    <MessageSquareText size={15} /><span><b>{session.title}</b><small>{timeAgo(session.archivedAt || session.updated)}</small></span>
                  </button>
                  <button className="session-more" title="任务操作" onClick={() => setSessionMenuId(sessionMenuId === session.id ? undefined : session.id)}><MoreHorizontal size={15} /></button>
                  {sessionMenuId === session.id && (
                    <div className="session-menu">
                      <button onClick={() => { setSessionDialog({ type: 'rename', session }); setSessionTitle(session.title) }}><PencilLine size={14} />重命名</button>
                      <button onClick={() => archiveSession(session, !session.archived)}>{session.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}{session.archived ? '恢复' : '归档'}</button>
                      <button className="danger" onClick={() => setSessionDialog({ type: 'delete', session })}><Trash2 size={14} />永久删除</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {project && !visibleSessions.length && <div className="empty-list">{sessionSearch ? '没有匹配的任务' : showArchived ? '还没有归档任务' : '这个项目还没有任务'}</div>}
          </section>
        </div>
        <button className="sidebar-settings" onClick={() => setPanel('settings')}><Settings size={16} /><span>模型与设置</span><ChevronRight size={14} /></button>
      </aside>

      {!sidebarOpen && <button className="floating-sidebar-toggle" title="展开侧栏" onClick={() => void setSidebarVisibility(true)}><Menu size={18} /></button>}

      <main
        className={`workspace ${terminalOpen && project && !previewOpen ? 'terminal-open' : ''} ${terminalOpen && terminalSettings.maximized && !previewOpen ? 'terminal-maximized' : ''} ${terminalOpen && terminalSettings.collapsed && !previewOpen ? 'terminal-collapsed' : ''} ${previewOpen ? 'preview-open' : ''}`}
        style={{ '--terminal-height': `${activeTerminalHeight}px` } as React.CSSProperties}
      >
        <div className="workspace-head">
          <div>
            <h1>{previewOpen ? '开发预览' : activeSessionId ? sessions.find((item) => item.id === activeSessionId)?.title : messages.length ? '当前任务' : '准备开始'}</h1>
            <span>{project ? project.path : '打开一个代码项目后开始工作'}</span>
          </div>
          {previewOpen ? <button className="preview-close-button" onClick={() => setPreviewOpen(false)}><X size={14} />关闭预览</button> : <div className="model-picker" onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setModelMenuOpen(false)
          }}>
            <button className="model-select" disabled={Boolean(activeRunId) || switchingProvider} onClick={() => setModelMenuOpen((open) => !open)} aria-haspopup="menu" aria-expanded={modelMenuOpen}>
              <span className="model-logo"><Sparkles size={15} /></span>
              <span><b>{activeProvider?.name}</b><small>{activeProvider?.model}</small></span>
              {switchingProvider ? <LoaderCircle className="spin" size={15} /> : <ChevronDown size={15} />}
            </button>
            {modelMenuOpen && <div className="model-menu" role="menu">
              <div className="model-menu-head"><span>选择任务模型</span><button title="打开模型中心" onClick={() => { setModelMenuOpen(false); setPanel('models') }}><Sparkles size={14} /></button></div>
              {bootstrap.settings.providers.map((provider) => <button key={provider.id} className={provider.id === activeProvider?.id ? 'active' : ''} onClick={() => void changeActiveProvider(provider.id)}>
                <span className="provider-mark">{provider.name.slice(0, 1)}</span><span><b>{provider.name}</b><small>{provider.model}</small></span>{provider.id === activeProvider?.id && <Check size={14} />}
              </button>)}
            </div>}
          </div>}
        </div>

        {terminalOpen && project && !previewOpen && <TerminalPanel
          key={project.path}
          project={project}
          theme={bootstrap.settings.appearance.theme}
          settings={terminalSettings}
          custom={customAppearance}
          height={activeTerminalHeight}
          onHeightChange={setTerminalHeight}
          onHeightCommit={(height) => void changeTerminalAppearance({ height })}
          onToggleMaximized={() => void changeTerminalAppearance({ maximized: !terminalSettings.maximized, collapsed: false })}
          onToggleCollapsed={() => void changeTerminalAppearance({ collapsed: !terminalSettings.collapsed, maximized: false })}
          onClose={() => setTerminalOpen(false)}
          onError={setToast}
        />}

        {previewOpen && project ? <PreviewWorkspace project={project} preview={preview} onPreview={setPreview} onError={setToast} /> : <div className="messages" ref={messagesRef}>
          {!project ? <NoProject onChoose={chooseProject} /> : !messages.length ? (
            <Welcome project={project} onTask={sendPrompt} />
          ) : (
            <div className="message-list">
              {messages.map((message) => <Message key={message.id} message={message} canManage={Boolean(runSessionId) && !activeRunId} onFork={forkFromMessage} onRevert={revertToMessage} />)}
            </div>
          )}
        </div>}

        {!previewOpen && <div className="composer-wrap">
          {goal && <section className={`goal-strip ${goal.status}`}>
            <span className="goal-strip-icon"><Goal size={16} /></span>
            <span className="goal-strip-copy"><b>{goal.objective}</b><small>{goalStatusLabel(goal)} · 第 {goal.iteration}/{goal.limits.maxIterations} 轮 · {compactNumber(goal.tokenUsage)} tokens · {goal.toolCalls} 次工具调用</small></span>
            <span className="goal-strip-result">{goal.timeline.at(-1)?.summary || goal.nextAction || '等待本轮独立校验'}</span>
            {goal.status === 'active' ? <button title="暂停目标" onClick={() => void changeGoalStatus('pause')}><CircleStop size={14} /></button> : goal.status !== 'complete' ? <button title="恢复目标" onClick={() => void changeGoalStatus('resume')}><RefreshCw size={14} /></button> : null}
            <button title="清除目标" onClick={() => void changeGoalStatus('clear')}><X size={14} /></button>
          </section>}
          <div className={`composer ${activeRunId ? 'running' : ''}`}>
            {attachments.length > 0 && <div className="attachment-strip">{attachments.map((attachment) => <div className="attachment-chip" key={attachment.id}>
              {attachment.previewUrl ? <img src={attachment.previewUrl} alt="" /> : <span><FileCode2 size={15} /></span>}
              <b>{attachment.name}</b><small>{attachment.kind === 'project' ? attachment.relativePath : formatFileSize(attachment.size)}</small>
              <button title={`移除 ${attachment.name}`} onClick={() => removeAttachment(attachment)}><X size={13} /></button>
            </div>)}</div>}
            <textarea
              value={prompt}
              onChange={(event) => {
                const value = event.target.value
                setPrompt(value)
                const mention = value.match(/@([^\s@]*)$/)
                if (project && mention) void bridge.searchProjectFiles(project.path, mention[1]).then(setFileSuggestions).catch(() => setFileSuggestions([]))
                else setFileSuggestions([])
                const commandQuery = value.match(/^\/([^\s/]*)$/)?.[1]
                if (project && commandQuery !== undefined) void bridge.getExtensions(project.path).then((overview) => setCommandSuggestions(overview.commands.filter((item) => item.name.toLowerCase().includes(commandQuery.toLowerCase())).slice(0, 10))).catch(() => setCommandSuggestions([]))
                else setCommandSuggestions([])
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendPrompt() }
              }}
              onPaste={(event) => {
                const files = event.clipboardData.files
                if (files.length && Array.from(files).some((file) => file.type.startsWith('image/'))) {
                  event.preventDefault()
                  void addPastedAttachments(files)
                }
              }}
              disabled={!project || Boolean(activeRunId)}
              placeholder={!project ? '请先打开一个项目' : activeRunId ? 'WetoCode 正在处理当前任务...' : '描述你要完成的开发任务'}
              rows={1}
            />
            {fileSuggestions.length > 0 && <div className="composer-suggestions"><div><Files size={14} /><b>引用文件</b></div>{fileSuggestions.slice(0, 8).map((file) => <button key={file} onClick={() => chooseFileSuggestion(file)}><FileCode2 size={14} /><span>{file}</span></button>)}</div>}
            {commandSuggestions.length > 0 && <div className="composer-suggestions"><div><Command size={14} /><b>命令</b></div>{commandSuggestions.map((command) => <button key={command.name} onClick={() => void executeCommand(command)}><Command size={14} /><span><b>/{command.name}</b>{command.description ? ` · ${command.description}` : ''}</span></button>)}</div>}
            <div className="composer-bottom">
              <div className="composer-meta">
                <button className="composer-icon-button" title="添加文件或图片" disabled={!project || Boolean(activeRunId) || attachments.length >= 12} onClick={() => void chooseAttachments()}><Paperclip size={14} /></button>
                <div className="goal-control">
                  <button className={`access-mode-button ${goalMode ? 'goal-active' : ''}`} disabled={Boolean(activeRunId) || Boolean(goal)} onClick={() => setGoalMode((enabled) => !enabled)} title="让 Agent 持续迭代并独立校验目标"><Goal size={14} /><span>Goal</span></button>
                  {goalMode && !goal && <button className="goal-budget-button" title="设置 Goal 预算" onClick={() => setGoalDialogOpen(true)}>{goalLimits.maxIterations} 轮</button>}
                </div>
                <div className="access-mode-control">
                  <button
                    className={`access-mode-button ${bootstrap.settings.accessMode === 'full' ? 'full' : ''}`}
                    disabled={Boolean(activeRunId) || savingAccessMode}
                    onClick={() => setAccessMenuOpen((open) => !open)}
                    aria-haspopup="menu"
                    aria-expanded={accessMenuOpen}
                  >
                    {bootstrap.settings.accessMode === 'full' ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />}
                    <span>{accessModeLabel(bootstrap.settings.accessMode)}</span>
                    <ChevronDown size={12} />
                  </button>
                  {accessMenuOpen && (
                    <div className="access-mode-menu" role="menu">
                      {accessModes.map((mode) => <button key={mode.id} className={`${mode.id === 'full' ? 'full' : ''} ${bootstrap.settings.accessMode === mode.id ? 'active' : ''}`} onClick={() => mode.id === 'full' ? (setAccessMenuOpen(false), setConfirmFullControl(true)) : void changeAccessMode(mode.id)}>
                        {mode.id === 'full' ? <ShieldAlert size={16} /> : mode.id === 'plan' ? <ListTodo size={16} /> : <ShieldCheck size={16} />}<span><b>{mode.label}</b><small>{mode.description}</small></span>{bootstrap.settings.accessMode === mode.id && <Check size={14} />}
                      </button>)}
                    </div>
                  )}
                </div>
                <span className="divider" /><select className="effort-select" title="推理强度" disabled={Boolean(activeRunId)} value={bootstrap.settings.reasoningEffort} onChange={(event) => void changeReasoningEffort(event.target.value as AppSettings['reasoningEffort'])}><option value="off">快速</option><option value="high">深入</option><option value="max">最高推理</option></select>
              </div>
              {activeRunId ? (
                <button className="stop-btn" title="停止任务" onClick={() => bridge.stopAgent(activeRunId)}><CircleStop size={17} /></button>
              ) : (
                <button className="send-btn" title="发送" disabled={(!prompt.trim() && !attachments.length) || !project} onClick={() => sendPrompt()}><Send size={17} /></button>
              )}
            </div>
          </div>
          <div className="composer-hint"><span>Enter 发送 · Shift + Enter 换行</span><span>{activeProvider ? `${compactNumber(activeProvider.contextWindow)} 上下文` : ''}</span></div>
        </div>}
      </main>

      {panel !== 'none' && (
        <aside className="detail-panel">
          {panel === 'settings' ? (
            <SettingsPanel bootstrap={bootstrap} activeProvider={activeProvider} update={update} onClose={() => setPanel('none')} onSettings={updateSettings} onAppearance={changeAppearance} onProviderChange={changeActiveProvider} />
          ) : panel === 'models' ? (
            <ModelCenterPanel project={project} activeProvider={activeProvider} onSettings={updateSettings} onConfigure={() => setPanel('settings')} onError={setToast} onClose={() => setPanel('none')} />
          ) : panel === 'context' ? (
            <ContextPanel settings={bootstrap.settings} provider={activeProvider} tokenTotal={tokenTotal} percent={contextPercent} canManage={Boolean(runSessionId) && !activeRunId} onCompact={compactCurrentSession} onRestore={restoreRevertedSession} onFork={() => forkFromMessage()} onClose={() => setPanel('none')} />
          ) : panel === 'tasks' ? (
            <TasksPanel tasks={backgroundTasks} activeRunId={activeRunId} onOpen={openBackgroundTask} onStop={(runId) => bridge.stopAgent(runId)} onDismiss={dismissBackgroundTask} onClose={() => setPanel('none')} />
          ) : panel === 'files' ? (
            <FilesPanel project={project} gitStatus={gitStatus} onReference={addProjectReference} onError={setToast} onClose={() => setPanel('none')} />
          ) : panel === 'extensions' ? (
            <ExtensionsPanel project={project} onCommand={(command) => { setPrompt(`/${command.name} `); setPanel('none') }} onError={setToast} onClose={() => setPanel('none')} />
          ) : panel === 'usage' ? (
            <UsagePanel onError={setToast} onClose={() => setPanel('none')} />
          ) : panel === 'automations' ? (
            <AutomationsPanel automations={automations} projects={bootstrap.settings.recentProjects} providers={bootstrap.settings.providers} currentProject={project} onAutomations={setAutomations} onOpenTask={(runId) => { const task = backgroundTasks.find((item) => item.runId === runId); if (task) void openBackgroundTask(task) }} onError={setToast} onClose={() => setPanel('none')} />
          ) : (
            <ChangesPanel project={project} status={gitStatus} onStatus={setGitStatus} onRefresh={refreshGitStatus} onError={setToast} onClose={() => setPanel('none')} />
          )}
        </aside>
      )}

      {toast && <div className="toast"><AlertTriangle size={16} />{toast}<button onClick={() => setToast(undefined)}><X size={14} /></button></div>}
      {onboardingOpen && <OnboardingDialog
        step={onboardingStep}
        project={project}
        provider={activeProvider}
        report={environmentReport}
        busy={doctorBusy}
        onStep={setOnboardingStep}
        onDoctor={runEnvironmentDoctor}
        onChooseProject={async () => { if (await chooseProject()) setOnboardingStep(2) }}
        onOpenModels={() => { setOnboardingOpen(false); setPanel('models') }}
        onFinish={finishOnboarding}
        onSkip={() => void finishOnboarding()}
      />}
      {goalDialogOpen && <div className="dialog-backdrop"><div className="goal-dialog" role="dialog" aria-modal="true"><div className="session-dialog-icon"><Goal size={20} /></div><h2>Goal Loop 预算</h2><p>达到任一上限后停止自动续跑，并保留目标供你恢复。</p><div className="goal-limit-grid"><label><span>最大轮次</span><input type="number" min="1" max="50" value={goalLimits.maxIterations} onChange={(event) => setGoalLimits({ ...goalLimits, maxIterations: Number(event.target.value) })} /></label><label><span>最长分钟</span><input type="number" min="5" max="1440" value={goalLimits.maxMinutes} onChange={(event) => setGoalLimits({ ...goalLimits, maxMinutes: Number(event.target.value) })} /></label><label><span>Token 上限</span><input type="number" min="10000" max="20000000" step="10000" value={goalLimits.maxTokens} onChange={(event) => setGoalLimits({ ...goalLimits, maxTokens: Number(event.target.value) })} /></label></div><div className="dialog-actions"><button className="ghost-button" onClick={() => setGoalDialogOpen(false)}>取消</button><button className="solid-button" onClick={() => setGoalDialogOpen(false)}>应用</button></div></div></div>}
      {confirmFullControl && (
        <div className="dialog-backdrop">
          <div className="access-dialog" role="dialog" aria-modal="true" aria-labelledby="full-control-title">
            <div className="access-dialog-icon"><ShieldAlert size={22} /></div>
            <h2 id="full-control-title">启用完全控制？</h2>
            <p>WetoCode 将能够访问项目外目录、读取敏感配置文件并执行所有本机命令，包括不可逆操作。</p>
            <div className="access-warning"><AlertTriangle size={15} /><span>仅在你信任当前任务和项目内容时启用。</span></div>
            <div className="dialog-actions"><button className="ghost-button" onClick={() => setConfirmFullControl(false)}>取消</button><button className="danger-button" disabled={savingAccessMode} onClick={() => changeAccessMode('full')}>{savingAccessMode && <LoaderCircle className="spin" size={14} />}启用完全控制</button></div>
          </div>
        </div>
      )}
      {sessionDialog && (
        <div className="dialog-backdrop">
          <div className="session-dialog" role="dialog" aria-modal="true" aria-labelledby="session-dialog-title">
            <div className={`session-dialog-icon ${sessionDialog.type === 'delete' ? 'danger' : ''}`}>{sessionDialog.type === 'rename' ? <PencilLine size={20} /> : <Trash2 size={20} />}</div>
            <h2 id="session-dialog-title">{sessionDialog.type === 'rename' ? '重命名任务' : '永久删除任务？'}</h2>
            {sessionDialog.type === 'rename' ? (
              <label><span>任务标题</span><input autoFocus value={sessionTitle} maxLength={120} onChange={(event) => setSessionTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitSessionDialog() }} /></label>
            ) : <p>“{sessionDialog.session.title}”的对话和工具记录将从本机永久删除，无法恢复。</p>}
            <div className="dialog-actions"><button className="ghost-button" onClick={() => setSessionDialog(undefined)}>取消</button>{sessionDialog.type === 'rename' ? <button className="solid-button" disabled={!sessionTitle.trim() || sessionBusy} onClick={submitSessionDialog}>保存</button> : <button className="danger-button" disabled={sessionBusy} onClick={submitSessionDialog}>永久删除</button>}</div>
          </div>
        </div>
      )}
      {worktreeDialog && (
        <div className="dialog-backdrop">
          <div className="worktree-dialog" role="dialog" aria-modal="true" aria-labelledby="worktree-dialog-title">
            <div className={`session-dialog-icon ${worktreeDialog.type !== 'create' ? 'danger' : ''}`}>{worktreeDialog.type === 'create' ? <GitBranch size={20} /> : worktreeDialog.type === 'reset' ? <RotateCcw size={20} /> : <Trash2 size={20} />}</div>
            <h2 id="worktree-dialog-title">{worktreeDialog.type === 'create' ? '新建隔离工作区' : worktreeDialog.type === 'reset' ? '重置隔离工作区？' : '删除隔离工作区？'}</h2>
            {worktreeDialog.type === 'create' ? <label><span>工作区名称</span><input autoFocus value={worktreeName} maxLength={48} placeholder="例如 feature-login" onChange={(event) => setWorktreeName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void submitWorktreeDialog() }} /><small>将从当前主分支创建独立目录和 opencode/ 分支。</small></label> : <p>{worktreeDialog.type === 'reset' ? `“${worktreeDialog.worktree.name}”中的未提交变更和未跟踪文件将被永久清除，并恢复到主分支。` : `“${worktreeDialog.worktree.name}”的目录与 ${worktreeDialog.worktree.branch || '对应分支'} 将被删除。`}</p>}
            <div className="dialog-actions"><button className="ghost-button" onClick={() => setWorktreeDialog(undefined)}>取消</button><button className={worktreeDialog.type === 'create' ? 'solid-button' : 'danger-button'} disabled={worktreeBusy || (worktreeDialog.type === 'create' && !worktreeName.trim())} onClick={() => void submitWorktreeDialog()}>{worktreeBusy && <LoaderCircle className="spin" size={14} />}{worktreeDialog.type === 'create' ? '创建并切换' : worktreeDialog.type === 'reset' ? '永久重置' : '删除工作区'}</button></div>
          </div>
        </div>
      )}
      {permissionRequest && (
        <div className="dialog-backdrop permission-backdrop">
          <div className="permission-dialog" role="dialog" aria-modal="true" aria-labelledby="permission-dialog-title">
            <div className="permission-dialog-head"><div><ShieldAlert size={20} /></div><span><h2 id="permission-dialog-title">需要你的授权</h2><small>{permissionLabel(permissionRequest.permission)}</small></span></div>
            <div className="permission-targets">
              {(permissionRequest.patterns.length ? permissionRequest.patterns : permissionDetails(permissionRequest.metadata)).map((item) => <code key={item}>{item}</code>)}
            </div>
            <p>WetoCode 已暂停当前操作，等待你的决定。</p>
            <div className="permission-actions">
              <button className="ghost-button" disabled={permissionBusy} onClick={() => void replyPermission('reject')}>拒绝</button>
              <span />
              <button className="ghost-button" disabled={permissionBusy} onClick={() => void replyPermission('always')}>本次会话始终允许</button>
              <button className="solid-button" disabled={permissionBusy} onClick={() => void replyPermission('once')}>{permissionBusy && <LoaderCircle className="spin" size={14} />}允许一次</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NoProject({ onChoose }: { onChoose: () => void }) {
  return <div className="empty-state"><div className="empty-icon"><FolderOpen size={30} /></div><h2>打开一个代码项目</h2><p>WetoCode 只在你选择的目录中读取和修改文件。</p><button className="solid-button" onClick={onChoose}><FolderOpen size={16} />选择项目</button></div>
}

function OnboardingDialog({ step, project, provider, report, busy, onStep, onDoctor, onChooseProject, onOpenModels, onFinish, onSkip }: {
  step: number
  project: ProjectInfo | null
  provider?: ProviderSettings
  report?: EnvironmentReport
  busy: boolean
  onStep: (step: number) => void
  onDoctor: () => Promise<void>
  onChooseProject: () => Promise<void>
  onOpenModels: () => void
  onFinish: (prompt?: string) => Promise<void>
  onSkip: () => void
}) {
  const [firstPrompt, setFirstPrompt] = useState('')
  const steps = ['检查电脑环境', '选择项目目录', '选择模型服务', '测试模型连接', '输入第一个需求']
  const missingRequired = report?.checks.some((item) => item.required && item.status === 'missing')
  const copyDiagnostics = () => {
    if (!report) return
    const text = [`WetoCode 环境诊断 ${new Date(report.checkedAt).toLocaleString('zh-CN')}`, ...report.checks.map((item) => `[${item.status}] ${item.name}: ${item.detail}${item.action ? ` (${item.action})` : ''}`)].join('\n')
    void bridge.writeClipboardText(text)
  }
  return <div className="onboarding-backdrop"><section className="onboarding-dialog" role="dialog" aria-modal="true" aria-label="WetoCode 首次使用引导">
    <aside className="onboarding-steps"><div className="onboarding-brand"><span className="brand-mark">W</span><span><b>开始使用 WetoCode</b><small>五步完成首次配置</small></span></div>{steps.map((label, index) => <button key={label} className={`${index === step ? 'active' : ''} ${index < step ? 'done' : ''}`} onClick={() => index <= step && onStep(index)}><span>{index < step ? <Check size={13} /> : index + 1}</span><b>{label}</b></button>)}</aside>
    <div className="onboarding-main">
      <div className="onboarding-head"><span><small>第 {step + 1} 步，共 5 步</small><h2>{steps[step]}</h2></span><button onClick={onSkip}>暂时跳过</button></div>
      {step === 0 && <div className="doctor-step"><p>WetoCode 只读取工具版本和项目依赖状态，不会安装软件或修改 PATH。</p>{!report ? <button className="doctor-start" disabled={busy} onClick={() => void onDoctor()}>{busy ? <LoaderCircle className="spin" size={18} /> : <Activity size={18} />}开始检查</button> : <div className="doctor-list">{report.checks.map((item) => <article className={item.status} key={item.id}><span>{item.status === 'ready' ? <CheckCircle2 size={16} /> : item.status === 'missing' ? <AlertTriangle size={16} /> : <Activity size={16} />}</span><span><b>{item.name}</b><small>{item.detail}</small>{item.action && <em>{item.action}</em>}</span></article>)}</div>}<div className="onboarding-actions">{report && <button className="ghost-button" onClick={copyDiagnostics}><ClipboardPaste size={14} />复制诊断信息</button>}<button className="ghost-button" disabled={busy} onClick={() => void onDoctor()}><RefreshCw size={14} />重新检查</button><button className="solid-button" disabled={!report} onClick={() => onStep(1)}>{missingRequired ? '稍后处理并继续' : '下一步'}<ChevronRight size={14} /></button></div></div>}
      {step === 1 && <div className="onboarding-choice"><FolderOpen size={34} /><h3>{project ? `已选择 ${project.name}` : '选择或创建一个项目目录'}</h3><p>{project?.path || 'WetoCode 只会在你授权的目录中读取和修改文件。'}</p><button className="solid-button" onClick={() => void onChooseProject()}><FolderOpen size={15} />{project ? '重新选择' : '选择目录'}</button>{project && <button className="next-link" onClick={() => onStep(2)}>下一步<ChevronRight size={14} /></button>}</div>}
      {step === 2 && <div className="onboarding-choice"><Sparkles size={34} /><h3>{provider ? `当前服务：${provider.name}` : '选择模型服务'}</h3><p>{provider ? `模型 ${provider.model}。你可以先使用当前服务，也可以打开模型中心查看动态模型列表。` : '需要先配置一个模型服务。API Key 由系统密钥环加密保存。'}</p><div><button className="ghost-button" onClick={onOpenModels}><Sparkles size={14} />打开模型中心</button>{provider && <button className="solid-button" onClick={() => onStep(3)}>使用当前服务<ChevronRight size={14} /></button>}</div></div>}
      {step === 3 && <div className="onboarding-choice"><Activity size={34} /><h3>测试模型是否可以连接</h3><p>将在模型中心使用当前项目和服务执行安全的目录检查，不会发送项目代码。</p><button className="solid-button" disabled={!provider || !project} onClick={() => { onOpenModels() }}><Activity size={14} />前往测试连接</button><button className="next-link" onClick={() => onStep(4)}>稍后测试，继续输入需求<ChevronRight size={14} /></button></div>}
      {step === 4 && <div className="onboarding-prompt"><Rocket size={32} /><h3>用一句话描述你想做什么</h3><textarea autoFocus value={firstPrompt} onChange={(event) => setFirstPrompt(event.target.value)} placeholder="例如：帮我做一个可以记录每日开销的中文网页" rows={4} /><div className="onboarding-actions"><button className="ghost-button" onClick={() => onStep(3)}>上一步</button><button className="solid-button" disabled={!firstPrompt.trim() || !project} onClick={() => void onFinish(firstPrompt)}>进入工作台<ChevronRight size={14} /></button></div></div>}
    </div>
  </section></div>
}

function Welcome({ project, onTask }: { project: ProjectInfo; onTask: (prompt: string) => void }) {
  return (
    <div className="welcome">
      <div className="welcome-symbol"><Code2 size={30} /></div>
      <h2>想从哪里开始？</h2>
      <p>更符合中国开发者使用习惯的中文桌面 Coding Agent。已打开 <b>{project.name}</b>，会先理解代码，再执行修改与验证。</p>
      <div className="starter-grid">
        {starterTasks.map((task) => <button key={task.label} onClick={() => onTask(task.prompt)}><task.icon size={19} /><span>{task.label}</span><ChevronRight size={15} /></button>)}
      </div>
      <div className="safety-guard"><ShieldCheck size={16} /><span>敏感数据、项目边界和危险操作会按安全规则处理</span></div>
    </div>
  )
}

function Message({ message, canManage, onFork, onRevert }: { message: ChatMessage; canManage: boolean; onFork: (messageId?: string) => Promise<void>; onRevert: (messageId: string) => Promise<void> }) {
  return (
    <article className={`message ${message.role}`}>
      <div className="message-avatar">{message.role === 'user' ? '你' : <Bot size={17} />}</div>
      <div className="message-body">
        <div className="message-name"><b>{message.role === 'user' ? '你' : 'WetoCode'}</b><span>{new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(message.createdAt)}</span>{message.role === 'user' && canManage && <div className="message-actions"><button title="从这条消息创建分支" onClick={() => void onFork(message.id)}><GitBranch size={13} /></button><button title="回退到这条消息" onClick={() => void onRevert(message.id)}><RotateCcw size={13} /></button></div>}</div>
        {message.attachments?.length ? <div className="message-attachments">{message.attachments.map((attachment) => <div key={attachment.id}>{attachment.previewUrl ? <img src={attachment.previewUrl} alt={attachment.name} /> : <FileCode2 size={15} />}<span><b>{attachment.name}</b><small>{attachment.relativePath || formatFileSize(attachment.size)}</small></span></div>)}</div> : null}
        {message.tools?.length ? <ToolStack tools={message.tools} /> : null}
        {message.text ? <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown></div> : null}
        {message.running && !message.text && <div className="thinking"><span /><span /><span /><em>正在分析项目</em></div>}
        {message.tokens && message.role === 'assistant' && <div className="message-stats"><CheckCircle2 size={13} />已完成 · 本轮 {compactNumber(message.tokens.total)} tokens</div>}
      </div>
    </article>
  )
}

function ToolStack({ tools }: { tools: ToolActivity[] }) {
  const [expanded, setExpanded] = useState<string>()
  return <div className="tool-stack">{tools.map((tool) => {
    const Icon = toolIcon(tool.tool)
    const isExpanded = expanded === tool.id
    return <div className={`tool-row ${tool.status}`} key={tool.id}>
      <button onClick={() => setExpanded(isExpanded ? undefined : tool.id)}>
        <span className="tool-icon"><Icon size={15} /></span><span><b>{toolLabel(tool.tool)}</b><small>{tool.title}</small></span>
        {tool.status === 'running' ? <LoaderCircle className="spin" size={15} /> : tool.status === 'error' ? <AlertTriangle size={15} /> : <Check size={15} />}
        {(tool.output || tool.input) && (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
      </button>
      {isExpanded && <pre>{tool.output || JSON.stringify(tool.input, null, 2)}</pre>}
    </div>
  })}</div>
}

function TerminalPanel({ project, theme, settings, custom, height, onHeightChange, onHeightCommit, onToggleMaximized, onToggleCollapsed, onClose, onError }: {
  project: ProjectInfo
  theme: AppearanceSettings['theme']
  settings: AppearanceSettings['terminal']
  custom: AppearanceSettings['custom']
  height: number
  onHeightChange: (height: number) => void
  onHeightCommit: (height: number) => void
  onToggleMaximized: () => void
  onToggleCollapsed: () => void
  onClose: () => void
  onError: (message: string) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<XtermTerminal | undefined>(undefined)
  const fitRef = useRef<XtermFitAddon | undefined>(undefined)
  const infoRef = useRef<TerminalInfo | undefined>(undefined)
  const initialThemeRef = useRef(theme)
  const initialFontSizeRef = useRef(settings.fontSize)
  const initialTerminalSettingsRef = useRef(settings)
  const initialTerminalCustomRef = useRef(custom)
  const fitTerminalRef = useRef<() => void>(() => {})
  const lastResizeRef = useRef<{ ptyId: string; rows: number; cols: number } | undefined>(undefined)
  const dragCleanupRef = useRef<(() => void) | undefined>(undefined)
  const [info, setInfo] = useState<TerminalInfo>()
  const [starting, setStarting] = useState(false)
  const [terminalReady, setTerminalReady] = useState(false)
  const [generation, setGeneration] = useState(0)
  const [mode, setMode] = useState<TerminalInfo['mode']>('cli')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; canCopy: boolean }>()

  const pasteText = useCallback((text: string) => {
    const terminal = terminalRef.current
    if (!terminal || !text) return
    const lineCount = text.split(/\r?\n/).length
    if ((lineCount > 3 || text.length > 800) && !window.confirm(`准备向终端粘贴 ${lineCount} 行内容。请确认这不是未经检查的命令。`)) return
    terminal.paste(text)
    terminal.focus()
  }, [])

  const pasteFromClipboard = useCallback(() => {
    void bridge.readClipboardText().then(pasteText).catch(() => onError('无法读取剪贴板内容。'))
  }, [onError, pasteText])

  function beginResize(event: React.PointerEvent<HTMLButtonElement>) {
    if (settings.maximized || settings.collapsed) return
    event.preventDefault()
    const startY = event.clientY
    const startHeight = height
    let nextHeight = startHeight
    const move = (moveEvent: PointerEvent) => {
      nextHeight = Math.min(1200, Math.max(220, startHeight + moveEvent.clientY - startY))
      onHeightChange(nextHeight)
    }
    const finish = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      dragCleanupRef.current = undefined
      onHeightCommit(nextHeight)
    }
    dragCleanupRef.current?.()
    dragCleanupRef.current = finish
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(undefined)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [contextMenu])

  useEffect(() => {
    let disposed = false
    let observer: ResizeObserver | undefined
    let input: { dispose: () => void } | undefined
    let animationFrame = 0
    void Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]).then(([xterm, addon]) => {
      if (disposed || !hostRef.current) return
      const terminal = new xterm.Terminal({
        cursorBlink: true,
        cursorStyle: 'bar',
        fontFamily: "'Cascadia Mono', 'JetBrains Mono', Consolas, 'Microsoft YaHei UI', 'Microsoft YaHei', 'Noto Sans SC Variable', monospace",
        fontSize: initialFontSizeRef.current,
        lineHeight: 1.25,
        screenReaderMode: true,
        scrollback: 5000,
        theme: terminalTheme(initialThemeRef.current, initialTerminalSettingsRef.current, initialTerminalCustomRef.current),
      })
      const fit = new addon.FitAddon()
      terminal.loadAddon(fit)
      terminalRef.current = terminal
      fitRef.current = fit
      terminal.open(hostRef.current)
      terminal.attachCustomKeyEventHandler((event) => {
        if (event.type !== 'keydown' || event.isComposing) return true
        const key = event.key.toLowerCase()
        if (event.ctrlKey && event.shiftKey && key === 'c') {
          if (terminal.hasSelection()) void bridge.writeClipboardText(terminal.getSelection())
          return false
        }
        if ((event.ctrlKey && event.shiftKey && key === 'v') || (event.shiftKey && key === 'insert')) {
          pasteFromClipboard()
          return false
        }
        return true
      })
      const fitTerminal = () => {
        animationFrame = 0
        if (!hostRef.current || !hostRef.current.clientWidth || !hostRef.current.clientHeight) return
        fit.fit()
        const current = infoRef.current
        if (!current || current.status !== 'running') return
        const previous = lastResizeRef.current
        if (previous?.ptyId === current.id && previous.rows === terminal.rows && previous.cols === terminal.cols) return
        lastResizeRef.current = { ptyId: current.id, rows: terminal.rows, cols: terminal.cols }
        void bridge.resizeTerminal(current.id, { rows: terminal.rows, cols: terminal.cols }).catch(() => undefined)
      }
      const scheduleFit = () => {
        if (animationFrame) return
        animationFrame = window.requestAnimationFrame(fitTerminal)
      }
      fitTerminalRef.current = scheduleFit
      observer = new ResizeObserver(scheduleFit)
      observer.observe(hostRef.current)
      input = terminal.onData((data) => {
        const current = infoRef.current
        if (current?.status === 'running') void bridge.sendTerminalInput(current.id, data)
      })
      scheduleFit()
      setTerminalReady(true)
    }).catch((error: Error) => onError(`终端组件加载失败：${error.message}`))

    return () => {
      disposed = true
      const current = infoRef.current
      if (current) void bridge.closeTerminal(current.id)
      observer?.disconnect()
      input?.dispose()
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      terminalRef.current?.dispose()
      terminalRef.current = undefined
      fitRef.current = undefined
      fitTerminalRef.current = () => {}
      lastResizeRef.current = undefined
      infoRef.current = undefined
    }
  }, [onError, pasteFromClipboard, project.path])

  useEffect(() => {
    if (!terminalRef.current) return
    const nextSettings = {
      background: settings.background,
      foreground: settings.foreground,
      cursor: settings.cursor,
      fontSize: settings.fontSize,
    }
    const nextCustom = { accent: custom.accent }
    terminalRef.current.options.theme = terminalTheme(theme, nextSettings, nextCustom)
    terminalRef.current.options.fontSize = nextSettings.fontSize
    fitTerminalRef.current()
  }, [custom.accent, settings.background, settings.cursor, settings.fontSize, settings.foreground, theme])

  useEffect(() => () => dragCleanupRef.current?.(), [])

  useEffect(() => {
    bridge.onTerminalEvent((event: TerminalEvent) => {
      const current = infoRef.current
      if (!current || event.ptyId !== current.id) return
      if (event.type === 'data' && event.data) terminalRef.current?.write(event.data)
      if (event.type === 'error') onError(event.message || '终端连接已中断。')
      if (event.type === 'exit') {
        const exited = { ...current, status: 'exited' as const, exitCode: event.exitCode }
        infoRef.current = exited
        setInfo(exited)
        terminalRef.current?.write(`\r\n\x1b[90m[进程已退出，代码 ${event.exitCode ?? 0}]\x1b[0m\r\n`)
      }
    })
  }, [onError])

  useEffect(() => {
    if (!terminalReady) return
    let cancelled = false
    async function start() {
      setStarting(true)
      const previous = infoRef.current
      if (previous) await bridge.closeTerminal(previous.id).catch(() => false)
      infoRef.current = undefined
      setInfo(undefined)
      lastResizeRef.current = undefined
      terminalRef.current?.reset()
      fitTerminalRef.current()
      try {
        const terminal = terminalRef.current
        const created = await bridge.createTerminal(project.path, { rows: terminal?.rows || 24, cols: terminal?.cols || 80 }, mode)
        if (cancelled) {
          await bridge.closeTerminal(created.id)
          return
        }
        infoRef.current = created
        setInfo(created)
        await bridge.attachTerminal(created.id)
        fitTerminalRef.current()
        terminalRef.current?.focus()
      } catch (error) {
        if (!cancelled) onError(userErrorMessage(error, '终端启动失败，请重试。'))
      } finally {
        if (!cancelled) setStarting(false)
      }
    }
    void start()
    return () => { cancelled = true }
  }, [generation, mode, onError, project.path, terminalReady])

  return (
    <section className="terminal-panel" aria-label="集成终端" data-pty-id={info?.id} data-pty-pid={info?.pid}>
      <div className="terminal-toolbar">
        <div><TerminalSquare size={14} /><b>终端</b><button className="terminal-resize-handle" title="拖拽调整终端高度，双击最大化或恢复" aria-label="调整终端高度" onPointerDown={beginResize} onDoubleClick={onToggleMaximized} /><div className="terminal-mode-switch"><button className={mode === 'cli' ? 'active' : ''} disabled={starting} onClick={() => setMode('cli')}>WetoCode CLI</button><button className={mode === 'shell' ? 'active' : ''} disabled={starting} onClick={() => setMode('shell')}>Shell</button></div><span>{starting ? '正在启动' : info ? `${info.status === 'running' ? '运行中' : `已退出 ${info.exitCode ?? ''}`}` : '未连接'}</span></div>
        <div><button className="icon-btn" title="从剪贴板粘贴" onClick={pasteFromClipboard}><ClipboardPaste size={14} /></button><button className="icon-btn" title={settings.collapsed ? '展开终端' : '折叠终端'} onClick={onToggleCollapsed}>{settings.collapsed ? <Maximize2 size={14} /> : <Minimize2 size={14} />}</button><button className="icon-btn" title={settings.maximized ? '恢复终端尺寸' : '终端占满工作区'} onClick={onToggleMaximized}>{settings.maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button><button className="icon-btn" title="重新启动终端" disabled={starting} onClick={() => setGeneration((value) => value + 1)}><RefreshCw size={14} /></button><button className="icon-btn" title="关闭终端" onClick={onClose}><X size={15} /></button></div>
      </div>
      <div className="terminal-host" onContextMenu={(event) => {
        event.preventDefault()
        terminalRef.current?.focus()
        const bounds = event.currentTarget.getBoundingClientRect()
        setContextMenu({
          x: Math.min(event.clientX - bounds.left, Math.max(0, bounds.width - 118)),
          y: Math.min(event.clientY - bounds.top, Math.max(0, bounds.height - 72)),
          canCopy: Boolean(terminalRef.current?.hasSelection()),
        })
      }}>
        <div className="terminal-canvas" ref={hostRef} />
        {contextMenu && <div className="terminal-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()} onMouseLeave={() => setContextMenu(undefined)}>
          <button disabled={!contextMenu.canCopy} onClick={() => {
            const terminal = terminalRef.current
            if (terminal?.hasSelection()) void bridge.writeClipboardText(terminal.getSelection())
            terminal?.clearSelection()
            terminal?.focus()
            setContextMenu(undefined)
          }}>复制</button>
          <button onClick={() => {
            pasteFromClipboard()
            setContextMenu(undefined)
          }}>粘贴</button>
        </div>}
      </div>
    </section>
  )
}

function terminalTheme(theme: AppearanceSettings['theme'], settings?: Pick<AppearanceSettings['terminal'], 'background' | 'foreground' | 'cursor'>, custom?: Pick<AppearanceSettings['custom'], 'accent'>) {
  const dark = ['dark', 'wetocode-dark', 'forest-care'].includes(theme) || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const base = dark
    ? { background: '#171a1c', foreground: '#d9dfdc', cursor: '#65b88f', selectionBackground: '#315642', black: '#171a1c', red: '#e06c75', green: '#77b889', yellow: '#d9ad63', blue: '#77a8e8', magenta: '#c98ddb', cyan: '#70b8bd', white: '#d9dfdc', brightBlack: '#7c8983', brightRed: '#ee8e95', brightGreen: '#93d4a5', brightYellow: '#efca82', brightBlue: '#97c5ff', brightMagenta: '#e3aae9', brightCyan: '#93d7dc', brightWhite: '#f4f7f5' }
    : { background: '#202528', foreground: '#e0e6e3', cursor: '#72c79d', selectionBackground: '#355e49', black: '#202528', red: '#ef8585', green: '#91ce9e', yellow: '#e6c277', blue: '#8ab4f8', magenta: '#d6a1e7', cyan: '#89cdd1', white: '#e0e6e3', brightBlack: '#8a9690', brightRed: '#ffaaaa', brightGreen: '#b0e6bb', brightYellow: '#f4d796', brightBlue: '#aed0ff', brightMagenta: '#ebbeef', brightCyan: '#afe7e9', brightWhite: '#ffffff' }
  return { ...base, background: settings?.background || base.background, foreground: settings?.foreground || base.foreground, cursor: settings?.cursor || custom?.accent || base.cursor }
}

function PanelHead({ icon: Icon, title, onClose }: { icon: typeof Settings; title: string; onClose: () => void }) {
  return <div className="panel-head"><div><Icon size={18} /><b>{title}</b></div><button className="icon-btn" title="关闭" onClick={onClose}><PanelRightClose size={18} /></button></div>
}

function FilesPanel({ project, gitStatus, onReference, onError, onClose }: {
  project: ProjectInfo | null
  gitStatus?: GitStatusInfo
  onReference: (relativePath: string) => Promise<void>
  onError: (message: string) => void
  onClose: () => void
}) {
  const [nodes, setNodes] = useState<Record<string, ProjectFileNode[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<string[]>([])
  const [selected, setSelected] = useState<string>()
  const [content, setContent] = useState<ProjectFileContent>()
  const [loading, setLoading] = useState(false)
  const loadedDirectories = useRef(new Set<string>())
  const changed = useMemo(() => new Map((gitStatus?.changes || []).map((item) => [item.path.replace(/\\/g, '/'), item.kind])), [gitStatus])

  const loadDirectory = useCallback(async (directory: string) => {
    if (!project || loadedDirectories.current.has(directory)) return
    loadedDirectories.current.add(directory)
    try {
      const loaded = await bridge.listProjectFiles(project.path, directory)
      setNodes((current) => ({ ...current, [directory]: loaded.sort((left, right) => left.type === right.type ? left.name.localeCompare(right.name) : left.type === 'directory' ? -1 : 1) }))
    } catch (error) {
      loadedDirectories.current.delete(directory)
      onError((error as Error).message)
    }
  }, [onError, project])

  useEffect(() => { void loadDirectory('') }, [loadDirectory])
  useEffect(() => {
    if (!project || !query.trim()) { setMatches([]); return }
    const timer = window.setTimeout(() => void bridge.searchProjectFiles(project.path, query).then(setMatches).catch((error: Error) => onError(error.message)), 160)
    return () => window.clearTimeout(timer)
  }, [onError, project, query])

  async function toggleDirectory(directory: string) {
    const next = new Set(expanded)
    if (next.has(directory)) next.delete(directory)
    else { next.add(directory); await loadDirectory(directory) }
    setExpanded(next)
  }

  async function chooseFile(filePath: string) {
    if (!project) return
    setSelected(filePath); setLoading(true)
    try { setContent(await bridge.readProjectFile(project.path, filePath)) }
    catch (error) { onError((error as Error).message) }
    finally { setLoading(false) }
  }

  function renderDirectory(directory: string, depth = 0): React.ReactNode {
    return (nodes[directory] || []).map((node) => node.type === 'directory' ? <div key={node.path}>
      <button className="file-tree-row directory" style={{ paddingLeft: `${9 + depth * 13}px` }} onClick={() => void toggleDirectory(node.path)}>{expanded.has(node.path) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<Folder size={14} /><span>{node.name}</span></button>
      {expanded.has(node.path) && renderDirectory(node.path, depth + 1)}
    </div> : <button key={node.path} className={`file-tree-row ${selected === node.path ? 'active' : ''}`} style={{ paddingLeft: `${26 + depth * 13}px` }} onClick={() => void chooseFile(node.path)}><FileCode2 size={13} /><span>{node.name}</span>{changed.has(node.path) && <em className={changed.get(node.path)}>{changed.get(node.path)?.slice(0, 1).toUpperCase()}</em>}</button>)
  }

  return <><PanelHead icon={FolderTree} title="项目文件" onClose={onClose} /><div className="files-panel-body">
    <div className="file-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文件名或路径" /></div>
    <div className="files-layout">
      <div className="file-tree">{query.trim() ? matches.map((file) => <button key={file} className={`file-tree-row ${selected === file ? 'active' : ''}`} onClick={() => void chooseFile(file)}><FileCode2 size={13} /><span>{file}</span>{changed.has(file) && <em className={changed.get(file)}>{changed.get(file)?.slice(0, 1).toUpperCase()}</em>}</button>) : renderDirectory('')}</div>
      <div className="file-preview">{!selected ? <div className="file-preview-empty"><Files size={26} /><span>选择文件查看内容</span></div> : <><div className="file-preview-head"><span title={selected}>{selected}</span><div><button title="加入对话" onClick={() => void onReference(selected)}><Paperclip size={14} /></button><button title="使用系统编辑器打开" onClick={() => project && void bridge.openProjectFile(project.path, selected).catch((error: Error) => onError(error.message))}><FolderOpen size={14} /></button></div></div>{loading ? <div className="file-preview-empty"><LoaderCircle className="spin" size={18} /></div> : content?.type === 'binary' ? <div className="file-preview-empty"><FileCode2 size={24} /><span>二进制文件无法预览</span></div> : <pre>{content?.content || ''}</pre>}{content?.truncated && <div className="file-truncated">文件较大，仅显示前 512 KB</div>}</>}</div>
    </div>
  </div></>
}

function ExtensionsPanel({ project, onCommand, onError, onClose }: {
  project: ProjectInfo | null
  onCommand: (command: AgentCommandInfo) => void
  onError: (message: string) => void
  onClose: () => void
}) {
  const [overview, setOverview] = useState<ExtensionOverview>()
  const [tab, setTab] = useState<'commands' | 'skills' | 'agents' | 'mcp' | 'lsp'>('commands')
  const [query, setQuery] = useState('')
  const onErrorRef = useRef(onError)
  useEffect(() => { onErrorRef.current = onError }, [onError])
  useEffect(() => {
    if (!project) return
    let cancelled = false
    bridge.getExtensions(project.path).then((value) => { if (!cancelled) setOverview(value) }).catch((error: Error) => onErrorRef.current(error.message))
    return () => { cancelled = true }
  }, [project])
  const tabs = [
    ['commands', '命令', overview?.commands.length || 0], ['skills', '技能', overview?.skills.length || 0],
    ['agents', '智能体', overview?.agents.length || 0], ['mcp', 'MCP', overview?.mcp.length || 0], ['lsp', 'LSP', overview?.lsp.length || 0],
  ] as const
  const matches = (value: string) => !query.trim() || value.toLowerCase().includes(query.trim().toLowerCase())
  return <><PanelHead icon={Plug} title="扩展中心" onClose={onClose} /><div className="extensions-body">
    <div className="extension-tabs">{tabs.map(([id, label, count]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}<span>{count}</span></button>)}</div>
    <div className="file-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`搜索${tabs.find(([id]) => id === tab)?.[1]}`} /></div>
    <div className="extension-list">{!overview ? <div className="extensions-empty"><LoaderCircle className="spin" size={18} />正在读取引擎扩展</div> : tab === 'commands' ? overview.commands.filter((item) => matches(`${item.name} ${item.description}`)).map((item) => <button className="extension-row action" key={item.name} onClick={() => onCommand(item)}><span className="extension-icon"><Command size={15} /></span><span><b>/{item.name}</b><small>{item.description || '自定义命令'}{item.agent ? ` · ${item.agent}` : ''}</small></span><ChevronRight size={14} /></button>) : tab === 'skills' ? overview.skills.filter((item) => matches(`${item.name} ${item.description}`)).map((item) => <div className="extension-row" key={item.path}><span className="extension-icon"><Sparkles size={15} /></span><span><b>{item.name}</b><small>{item.description || '可按需加载的 Agent Skill'}</small></span><em>{item.scope === 'project' ? '项目' : '用户'}</em></div>) : tab === 'agents' ? overview.agents.filter((item) => matches(`${item.name} ${item.description}`)).map((item) => <div className="extension-row" key={item.name}><span className="extension-icon"><Bot size={15} /></span><span><b>{item.name}</b><small>{item.description || item.model || 'Agent'}</small></span><em>{item.mode === 'subagent' ? '子智能体' : item.builtIn ? '内置' : '自定义'}</em></div>) : tab === 'mcp' ? overview.mcp.filter((item) => matches(item.name)).map((item) => <div className="extension-row" key={item.name}><span className="extension-icon"><Plug size={15} /></span><span><b>{item.name}</b><small>{item.error || 'Model Context Protocol 服务'}</small></span><em className={item.status === 'connected' ? 'connected' : item.status === 'failed' ? 'failed' : ''}>{item.status === 'connected' ? '已连接' : item.status === 'disabled' ? '已停用' : item.status === 'needs_auth' ? '待认证' : '异常'}</em></div>) : overview.lsp.filter((item) => matches(`${item.name} ${item.root}`)).map((item) => <div className="extension-row" key={item.id}><span className="extension-icon"><Code2 size={15} /></span><span><b>{item.name}</b><small>{item.root}</small></span><em className={item.status === 'connected' ? 'connected' : 'failed'}>{item.status === 'connected' ? '运行中' : '异常'}</em></div>)}
      {overview && ((overview[tab] as unknown[]) || []).length === 0 && <div className="extensions-empty"><Plug size={24} />当前项目没有发现此类扩展</div>}
    </div>
  </div></>
}

function UsagePanel({ onError, onClose }: { onError: (message: string) => void; onClose: () => void }) {
  const [range, setRange] = useState<UsageSummary['range']>('30d')
  const [usage, setUsage] = useState<UsageSummary>()
  const onErrorRef = useRef(onError)
  useEffect(() => { onErrorRef.current = onError }, [onError])
  useEffect(() => { bridge.getUsage(range).then(setUsage).catch((error: Error) => onErrorRef.current(error.message)) }, [range])
  const maxDay = Math.max(1, ...(usage?.days.map((day) => day.tokens) || [1]))
  const maxModel = Math.max(1, ...(usage?.models.map((model) => model.tokens) || [1]))
  const completionRate = usage?.totals.sessions ? Math.round((usage.totals.completed / usage.totals.sessions) * 100) : 0
  return <><PanelHead icon={Activity} title="使用统计" onClose={onClose} /><div className="panel-scroll usage-content">
    <div className="usage-range"><button className={range === '7d' ? 'active' : ''} onClick={() => setRange('7d')}>最近 7 天</button><button className={range === '30d' ? 'active' : ''} onClick={() => setRange('30d')}>最近 30 天</button><button className={range === 'all' ? 'active' : ''} onClick={() => setRange('all')}>全部</button></div>
    {!usage ? <div className="extensions-empty"><LoaderCircle className="spin" size={18} />正在统计本机使用记录</div> : <>
      <div className="usage-metrics"><div><span><Zap size={14} />Token</span><b>{compactNumber(usage.totals.tokens)}</b></div><div><span><MessageSquareText size={14} />消息</span><b>{usage.totals.messages}</b></div><div><span><TerminalSquare size={14} />工具调用</span><b>{usage.totals.toolCalls}</b></div><div><span><CheckCircle2 size={14} />完成率</span><b>{completionRate}%</b></div></div>
      <section className="usage-section"><h3>每日 Token 趋势 <span>{usage.activeDays} 个活跃日</span></h3><div className="usage-bars">{usage.days.length ? usage.days.map((day) => <div key={day.date} title={`${day.date} · ${day.tokens} tokens`}><i style={{ height: `${Math.max(3, Math.round((day.tokens / maxDay) * 100))}%` }} /><span>{day.date.slice(5)}</span></div>) : <p>开始运行任务后，这里会显示每日趋势。</p>}</div></section>
      <section className="usage-section"><h3>模型用量</h3><div className="model-usage">{usage.models.length ? usage.models.map((model) => <div key={model.model}><span><b>{model.model}</b><small>{compactNumber(model.tokens)} tokens · {model.toolCalls} 次工具</small></span><i><em style={{ width: `${Math.max(2, Math.round((model.tokens / maxModel) * 100))}%` }} /></i></div>) : <p>还没有模型用量记录。</p>}</div></section>
      <div className="usage-note"><ShieldCheck size={14} /><span>仅统计本机聚合数据，不上传对话、代码或提示词。</span></div>
    </>}
  </div></>
}

function PreviewWorkspace({ project, preview, onPreview, onError }: {
  project: ProjectInfo
  preview: PreviewState | null
  onPreview: (preview: PreviewState | null) => void
  onError: (message: string) => void
}) {
  const [suggestions, setSuggestions] = useState<PreviewSuggestion[]>([])
  const [command, setCommand] = useState('')
  const [url, setUrl] = useState('http://localhost:5173/')
  const [busy, setBusy] = useState(false)
  const [frameKey, setFrameKey] = useState(0)
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    bridge.getPreviewSuggestions(project.path).then((items) => {
      setSuggestions(items)
      if (!preview?.command && items[0]) setCommand(items[0].command)
    }).catch((error: Error) => onError(error.message))
  }, [onError, preview?.command, project.path])
  useEffect(() => {
    if (preview?.command) setCommand(preview.command)
    if (preview?.url) setUrl(preview.url)
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [preview])

  async function start() {
    if (!command.trim() || busy) return
    setBusy(true)
    try {
      const next = await bridge.startPreview(project.path, { command: command.trim(), url: url.trim() || undefined })
      onPreview(next)
    } catch (error) { onError((error as Error).message) }
    finally { setBusy(false) }
  }

  async function applyUrl() {
    if (!url.trim() || !preview) return
    try { onPreview(await bridge.setPreviewUrl(project.path, url.trim())); setFrameKey((key) => key + 1) }
    catch (error) { onError((error as Error).message) }
  }

  const active = preview?.status === 'running' || preview?.status === 'starting'
  return <section className="preview-workspace">
    <div className="preview-toolbar">
      <span className={`preview-status ${preview?.status || 'idle'}`} title={preview?.message || preview?.status || '尚未启动'}>{active ? <LoaderCircle className={preview?.status === 'starting' ? 'spin' : ''} size={14} /> : <Monitor size={14} />}</span>
      <label className="preview-address"><input value={url} aria-label="预览地址" onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void applyUrl() }} /><button title="打开地址" disabled={!preview} onClick={() => void applyUrl()}><ChevronRight size={15} /></button></label>
      <button title="刷新页面" disabled={!preview?.url} onClick={() => setFrameKey((key) => key + 1)}><RefreshCw size={15} /></button>
      <button title="在系统浏览器打开" disabled={!preview?.url} onClick={() => preview?.url && void bridge.openPreviewExternal(project.path, preview.url).catch((error: Error) => onError(error.message))}><SquareArrowOutUpRight size={15} /></button>
      {active ? <button className="preview-stop" title="停止开发服务器" onClick={() => void bridge.stopPreview(project.path).then(() => onPreview(preview ? { ...preview, status: 'stopped' } : null)).catch((error: Error) => onError(error.message))}><CircleStop size={15} /></button> : null}
    </div>
    <div className="preview-stage">
      {preview?.url && active ? <iframe key={`${preview.id}-${frameKey}`} src={preview.url} title="项目开发预览" sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin" /> : <div className="preview-empty"><Rocket size={32} /><b>{preview?.status === 'error' ? '开发服务器启动失败' : '启动项目开发服务器'}</b><span>{preview?.message || '选择项目脚本或输入开发服务器命令。'}</span></div>}
    </div>
    <div className="preview-console">
      <div className="preview-launcher">
        <select value={command} onChange={(event) => setCommand(event.target.value)} aria-label="开发服务器命令">
          {!suggestions.some((item) => item.command === command) && command && <option value={command}>{command}</option>}
          {!suggestions.length && <option value="">未发现 package.json 开发脚本</option>}
          {suggestions.map((item) => <option key={item.command} value={item.command}>{item.command} · {item.description}</option>)}
        </select>
        <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="npm run dev" aria-label="自定义开发服务器命令" />
        <button className="solid-button" disabled={!command.trim() || busy || active} onClick={() => void start()}>{busy ? <LoaderCircle className="spin" size={14} /> : <Play size={14} />}启动</button>
      </div>
      <pre ref={logRef}>{preview?.output || '开发服务器日志会显示在这里。'}</pre>
    </div>
  </section>
}

function scheduleLabel(schedule: AutomationSchedule) {
  if (schedule.kind === 'once') return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(schedule.onceAt)
  if (schedule.kind === 'interval') return `每 ${schedule.intervalMinutes} 分钟`
  const time = `${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`
  if (schedule.kind === 'daily') return `每天 ${time}`
  const names = ['日', '一', '二', '三', '四', '五', '六']
  return `每周${schedule.days.map((day) => names[day]).join('、')} ${time}`
}

function dateTimeLocal(timestamp: number) {
  const date = new Date(timestamp)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(timestamp - offset).toISOString().slice(0, 16)
}

function defaultAutomationSchedule(): AutomationSchedule {
  const next = new Date(Date.now() + 3_600_000)
  return { kind: 'daily', hour: next.getHours(), minute: 0 }
}

function AutomationsPanel({ automations, projects, providers, currentProject, onAutomations, onOpenTask, onError, onClose }: {
  automations: AutomationTask[]
  projects: string[]
  providers: ProviderSettings[]
  currentProject: ProjectInfo | null
  onAutomations: (automations: AutomationTask[]) => void
  onOpenTask: (runId: string) => void
  onError: (message: string) => void
  onClose: () => void
}) {
  const activeProviderId = providers[0]?.id || ''
  const [editing, setEditing] = useState<Partial<AutomationTask>>()
  const [busy, setBusy] = useState(false)
  const beginCreate = () => setEditing({ name: '', prompt: '', projectPath: currentProject?.path || projects[0] || '', providerId: activeProviderId, enabled: true, schedule: defaultAutomationSchedule() })
  const schedule = editing?.schedule || defaultAutomationSchedule()

  async function save() {
    if (!editing?.name?.trim() || !editing.prompt?.trim() || !editing.projectPath || !editing.providerId || busy) return
    setBusy(true)
    try {
      onAutomations(await bridge.saveAutomation({
        ...editing,
        name: editing.name.trim(), prompt: editing.prompt.trim(), projectPath: editing.projectPath,
        providerId: editing.providerId, schedule,
      }))
      setEditing(undefined)
    } catch (error) { onError((error as Error).message) }
    finally { setBusy(false) }
  }

  async function action(task: AutomationTask, kind: 'toggle' | 'run' | 'delete') {
    if (busy) return
    setBusy(true)
    try {
      if (kind === 'toggle') onAutomations(await bridge.setAutomationEnabled(task.id, !task.enabled))
      else if (kind === 'delete') onAutomations(await bridge.deleteAutomation(task.id))
      else {
        const result = await bridge.runAutomationNow(task.id)
        onAutomations(result.automations)
      }
    } catch (error) { onError((error as Error).message) }
    finally { setBusy(false) }
  }

  const updateSchedule = (next: AutomationSchedule) => setEditing((current) => current ? { ...current, schedule: next } : current)
  return <><PanelHead icon={CalendarClock} title="自动化任务" onClose={onClose} /><div className="panel-scroll automation-content">
    <div className="automation-toolbar"><span>{automations.filter((item) => item.enabled).length} 个计划已启用</span><button className="solid-button" disabled={!projects.length} onClick={beginCreate}><Plus size={14} />新建</button></div>
    {editing ? <section className="automation-editor">
      <label><span>名称</span><input autoFocus value={editing.name || ''} maxLength={120} onChange={(event) => setEditing({ ...editing, name: event.target.value })} placeholder="每日代码健康检查" /></label>
      <label><span>任务内容</span><textarea value={editing.prompt || ''} maxLength={20_000} rows={5} onChange={(event) => setEditing({ ...editing, prompt: event.target.value })} placeholder="检查项目的测试、安全风险和未提交变更，给出可验证结论。" /></label>
      <div className="automation-fields"><label><span>项目</span><select value={editing.projectPath || ''} onChange={(event) => setEditing({ ...editing, projectPath: event.target.value })}>{projects.map((item) => <option key={item} value={item}>{item.split(/[\\/]/).filter(Boolean).pop()}</option>)}</select></label><label><span>模型</span><select value={editing.providerId || ''} onChange={(event) => setEditing({ ...editing, providerId: event.target.value })}>{providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      <label><span>计划</span><select value={schedule.kind} onChange={(event) => {
        const kind = event.target.value
        if (kind === 'once') updateSchedule({ kind, onceAt: Date.now() + 3_600_000 })
        else if (kind === 'interval') updateSchedule({ kind, intervalMinutes: 60 })
        else if (kind === 'weekly') updateSchedule({ kind, hour: 9, minute: 0, days: [1, 2, 3, 4, 5] })
        else updateSchedule({ kind: 'daily', hour: 9, minute: 0 })
      }}><option value="once">单次</option><option value="interval">固定间隔</option><option value="daily">每天</option><option value="weekly">每周</option></select></label>
      {schedule.kind === 'once' && <label><span>执行时间</span><input type="datetime-local" min={dateTimeLocal(Date.now() + 60_000)} value={dateTimeLocal(schedule.onceAt)} onChange={(event) => updateSchedule({ kind: 'once', onceAt: new Date(event.target.value).getTime() })} /></label>}
      {schedule.kind === 'interval' && <label><span>间隔分钟</span><input type="number" min="15" max="10080" value={schedule.intervalMinutes} onChange={(event) => updateSchedule({ kind: 'interval', intervalMinutes: Number(event.target.value) })} /></label>}
      {(schedule.kind === 'daily' || schedule.kind === 'weekly') && <label><span>本地时间</span><input type="time" value={`${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`} onChange={(event) => { const [hour, minute] = event.target.value.split(':').map(Number); updateSchedule(schedule.kind === 'weekly' ? { ...schedule, hour, minute } : { kind: 'daily', hour, minute }) }} /></label>}
      {schedule.kind === 'weekly' && <div className="weekday-picker">{['日', '一', '二', '三', '四', '五', '六'].map((name, day) => <button key={name} className={schedule.days.includes(day) ? 'active' : ''} onClick={() => updateSchedule({ ...schedule, days: schedule.days.includes(day) ? schedule.days.filter((item) => item !== day) : [...schedule.days, day].sort() })}>{name}</button>)}</div>}
      <div className="dialog-actions"><button className="ghost-button" onClick={() => setEditing(undefined)}>取消</button><button className="solid-button" disabled={!editing.name?.trim() || !editing.prompt?.trim() || !editing.projectPath || !schedule || busy} onClick={() => void save()}>{busy && <LoaderCircle className="spin" size={14} />}保存计划</button></div>
    </section> : null}
    {!editing && !automations.length ? <div className="tasks-empty"><Workflow size={28} /><b>还没有自动化任务</b><span>按计划运行代码检查、测试维护或项目例行工作。</span><button className="solid-button" disabled={!projects.length} onClick={beginCreate}><Plus size={14} />新建计划</button></div> : null}
    {!editing && automations.map((task) => <article className={`automation-item ${task.enabled ? 'enabled' : ''}`} key={task.id}>
      <div className="automation-head"><span><b>{task.name}</b><small>{task.projectPath.split(/[\\/]/).filter(Boolean).pop()} · {scheduleLabel(task.schedule)}</small></span><button className={`toggle-button ${task.enabled ? 'on' : ''}`} title={task.enabled ? '停用计划' : '启用计划'} disabled={busy || Boolean(task.runningRunId)} onClick={() => void action(task, 'toggle')}><i /></button></div>
      <p>{task.prompt}</p>
      <div className="automation-next"><CalendarClock size={13} /><span>{task.runningRunId ? '正在运行' : task.enabled && task.nextRunAt ? `下次 ${timeAgo(task.nextRunAt)}` : '计划已停用'}</span>{task.lastStatus && <em className={task.lastStatus}>{task.lastStatus === 'completed' ? '上次成功' : task.lastStatus === 'running' ? '运行中' : '上次未完成'}</em>}</div>
      {task.history.length ? <details><summary>运行历史 · {task.history.length}</summary>{task.history.slice(0, 8).map((run) => <button key={run.id} disabled={!run.runId} onClick={() => run.runId && onOpenTask(run.runId)}><span>{new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(run.startedAt)}</span><em className={run.status}>{run.status === 'completed' ? '成功' : run.status === 'running' ? '运行中' : run.status === 'aborted' ? '已停止' : '失败'}</em></button>)}</details> : null}
      <div className="automation-actions"><button title="立即运行" disabled={busy || Boolean(task.runningRunId)} onClick={() => void action(task, 'run')}><Play size={14} /></button><button title="编辑计划" disabled={busy || Boolean(task.runningRunId)} onClick={() => setEditing(task)}><PencilLine size={14} /></button><span /><button title="删除计划" disabled={busy} onClick={() => void action(task, 'delete')}><Trash2 size={14} /></button></div>
    </article>)}
  </div></>
}

function TasksPanel({ tasks, activeRunId, onOpen, onStop, onDismiss, onClose }: {
  tasks: BackgroundTask[]
  activeRunId?: string
  onOpen: (task: BackgroundTask) => Promise<void>
  onStop: (runId: string) => Promise<boolean>
  onDismiss: (task: BackgroundTask) => Promise<void>
  onClose: () => void
}) {
  const [, setClock] = useState(Date.now())
  useEffect(() => {
    if (!tasks.some(isActiveTask)) return
    const timer = window.setInterval(() => setClock(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [tasks])

  const status = (task: BackgroundTask) => {
    if (task.status === 'waiting_permission') return '等待授权'
    if (task.status === 'running') return '运行中'
    if (task.status === 'completed') return '已完成'
    if (task.status === 'budget_limited') return '预算已用尽'
    if (task.status === 'aborted') return '已停止'
    return '执行失败'
  }

  return <>
    <PanelHead icon={ListTodo} title="后台任务" onClose={onClose} />
    <div className="panel-scroll tasks-content">
      {!tasks.length ? <div className="tasks-empty"><ListTodo size={28} /><b>没有后台任务</b><span>正在运行和最近完成的任务会显示在这里。</span></div> : tasks.map((task) => {
        const active = isActiveTask(task)
        return <article className={`task-card ${task.status} ${activeRunId === task.runId ? 'current' : ''}`} key={task.runId}>
          <button className="task-main" onClick={() => void onOpen(task)}>
            <span className="task-status-icon">{task.status === 'waiting_permission' ? <BellRing size={16} /> : active ? <LoaderCircle className="spin" size={16} /> : task.status === 'completed' ? <CheckCircle2 size={16} /> : <CircleStop size={16} />}</span>
            <span className="task-copy"><b>{task.title}</b><small>{task.projectPath.split(/[\\/]/).filter(Boolean).pop()} · {task.provider || '默认模型'}</small></span>
            <ChevronRight size={14} />
          </button>
          <div className="task-meta"><span className="task-state">{status(task)}</span><span>{active ? `${timeAgo(task.startedAt)}开始` : task.completedAt ? timeAgo(task.completedAt) : ''}</span></div>
          {task.permission && <button className="task-permission" onClick={() => void onOpen(task)}><ShieldAlert size={13} />{permissionLabel(task.permission.permission)}</button>}
          <div className="task-actions">
            <button className="mini-button" onClick={() => void onOpen(task)}>{active ? '打开任务' : '查看结果'}</button>
            {active ? <button className="task-stop" title="停止任务" onClick={() => void onStop(task.runId)}><CircleStop size={14} />停止</button> : <button className="task-dismiss" title="移除记录" onClick={() => void onDismiss(task)}><X size={14} /></button>}
          </div>
        </article>
      })}
    </div>
  </>
}

type ModelFilter = 'all' | 'free' | 'connected' | 'favorite' | 'tools' | 'vision' | 'reasoning'

function modelPriceLabel(model: RegistryModel) {
  if (model.priceState === 'free') return '免费'
  if (model.priceState === 'unknown') return '价格未知'
  if (model.inputPrice === undefined || model.outputPrice === undefined) return '付费'
  return `输入 $${model.inputPrice} / 输出 $${model.outputPrice}`
}

function ModelCenterPanel({ project, activeProvider, onSettings, onConfigure, onError, onClose }: {
  project: ProjectInfo | null
  activeProvider?: ProviderSettings
  onSettings: (settings: AppSettings) => void
  onConfigure: () => void
  onError: (message: string) => void
  onClose: () => void
}) {
  const [registry, setRegistry] = useState<ModelRegistryResult>()
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ModelFilter>('all')
  const [busyId, setBusyId] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const load = useCallback(async (refresh = false) => {
    setLoading(true); setNotice(undefined)
    try { setRegistry(await bridge.listModelRegistry(project?.path, refresh)) }
    catch (error) { onErrorRef.current((error as Error).message) }
    finally { setLoading(false) }
  }, [project?.path])

  useEffect(() => { void load(false) }, [load])

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
    const favorites = new Set(registry?.favorites || [])
    return (registry?.models || []).filter((model) => {
      if (normalizedQuery && !`${model.displayName} ${model.modelId} ${model.providerName}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery)) return false
      if (filter === 'free') return model.isFree
      if (filter === 'connected') return model.availability === 'connected'
      if (filter === 'favorite') return favorites.has(model.id)
      if (filter === 'tools') return model.supportsTools === true
      if (filter === 'vision') return model.supportsVision === true
      if (filter === 'reasoning') return model.supportsReasoning === true
      return true
    })
  }, [filter, query, registry])

  async function activateModel(model: RegistryModel) {
    setBusyId(model.id); setNotice(undefined)
    try {
      onSettings(await bridge.useRegistryModel({ configurationId: model.configurationId, modelId: model.modelId, contextWindow: model.contextWindow }))
      setNotice(`已将 ${model.displayName} 设为当前模型。`)
    } catch (error) { onError((error as Error).message) }
    finally { setBusyId(undefined) }
  }

  async function testModel(model: RegistryModel) {
    setBusyId(model.id); setNotice(undefined)
    try {
      const result = await bridge.testRegistryModel({ configurationId: model.configurationId, modelId: model.modelId })
      setNotice(`${model.displayName}：${result.message} ${result.latencyMs} ms`)
    } catch (error) { onError((error as Error).message) }
    finally { setBusyId(undefined) }
  }

  async function toggleFavorite(model: RegistryModel) {
    const favorite = !(registry?.favorites || []).includes(model.id)
    try {
      const favorites = await bridge.setModelFavorite(model.id, favorite)
      setRegistry((current) => current ? { ...current, favorites } : current)
    } catch (error) { onError((error as Error).message) }
  }

  const filters: Array<{ id: ModelFilter; label: string }> = [
    { id: 'all', label: '全部' }, { id: 'free', label: '免费' }, { id: 'connected', label: '已连接' },
    { id: 'favorite', label: '收藏' }, { id: 'tools', label: '工具' }, { id: 'vision', label: '图片' }, { id: 'reasoning', label: '推理' },
  ]

  return <><PanelHead icon={Sparkles} title="模型中心" onClose={onClose} /><div className="panel-scroll model-center">
    <div className="model-center-summary"><span><b>当前已连接服务中可用的模型</b><small>{registry ? `${registry.models.length} 个模型 · ${registry.cached ? '使用缓存' : '刚刚刷新'}` : '正在读取模型目录'}</small></span><button className="icon-btn" title="手动刷新模型列表" disabled={loading} onClick={() => void load(true)}><RefreshCw className={loading ? 'spin' : ''} size={15} /></button></div>
    <label className="model-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模型或服务商" /></label>
    <div className="model-filters">{filters.map((item) => <button key={item.id} className={filter === item.id ? 'active' : ''} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div>
    {notice && <div className="model-notice"><CheckCircle2 size={14} />{notice}</div>}
    {registry?.errors.map((error) => <div className="model-discovery-error" key={error.configurationId}><AlertTriangle size={14} /><span><b>{error.providerName} 加载失败</b><small>{error.message}</small></span><button onClick={() => void load(true)}>重试</button></div>)}
    {loading && !registry ? <div className="models-loading"><LoaderCircle className="spin" size={20} /><span>正在同步已连接服务的模型</span></div> : null}
    {!loading && !visible.length ? <div className="models-empty"><Sparkles size={25} /><b>没有匹配的模型</b><span>{filter === 'free' ? '价格未知的模型不会被归入免费列表。' : '调整筛选条件，或配置新的模型服务。'}</span><button className="ghost-button" onClick={onConfigure}>配置模型服务</button></div> : null}
    <div className="model-card-list">{visible.map((model) => {
      const favorite = (registry?.favorites || []).includes(model.id)
      const selected = activeProvider?.id === model.configurationId && activeProvider.model === model.modelId
      return <article className={`model-card ${selected ? 'selected' : ''}`} key={model.id}>
        <div className="model-card-head"><span className="provider-mark">{model.providerName.slice(0, 1)}</span><span><b>{model.displayName}</b><small>{model.providerName} · {model.modelId}</small></span><button className={`model-favorite ${favorite ? 'active' : ''}`} title={favorite ? '取消收藏' : '收藏模型'} onClick={() => void toggleFavorite(model)}>{favorite ? <Star size={15} fill="currentColor" /> : <Heart size={15} />}</button></div>
        <div className="model-badges"><span className={`price ${model.priceState}`}>{modelPriceLabel(model)}</span><span className={`availability ${model.availability}`}>{model.authRequired ? '需要密钥' : model.availability === 'connected' ? '可用' : model.availability === 'not_configured' ? '未配置' : '已配置'}</span>{model.supportsTools && <span><Plug size={11} />工具</span>}{model.supportsVision && <span><Image size={11} />图片</span>}{model.supportsReasoning && <span><BrainCircuit size={11} />推理</span>}</div>
        <p>{model.description}{model.contextWindow ? ` · ${compactNumber(model.contextWindow)} 上下文` : ''}</p>
        <div className="model-card-actions"><button className="ghost-button" disabled={Boolean(busyId) || model.authRequired} onClick={() => void testModel(model)}>{busyId === model.id ? <LoaderCircle className="spin" size={13} /> : <Activity size={13} />}测试连接</button><button className="solid-button" disabled={Boolean(busyId) || model.authRequired || selected} onClick={() => void activateModel(model)}>{selected ? <Check size={13} /> : <Play size={13} />}{selected ? '当前使用' : '开始使用'}</button></div>
      </article>
    })}</div>
  </div></>
}

function SettingsPanel({ bootstrap, activeProvider, update, onClose, onSettings, onAppearance, onProviderChange }: {
  bootstrap: BootstrapData
  activeProvider?: ProviderSettings
  update?: UpdateEvent
  onClose: () => void
  onSettings: (settings: AppSettings) => void
  onAppearance: (appearance: Partial<AppearanceSettings>) => Promise<void>
  onProviderChange: (providerId: string) => Promise<void>
}) {
  const [editing, setEditing] = useState<Partial<ProviderSettings> & { apiKey?: string }>()
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string>()
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string>()
  const [zoom, setZoom] = useState(bootstrap.settings.appearance.zoom)

  useEffect(() => setZoom(bootstrap.settings.appearance.zoom), [bootstrap.settings.appearance.zoom])

  const selectedPreset = editing ? providerPresets.find((preset) => preset.name === editing.name && preset.providerId === editing.providerId) : undefined
  const themePresets: Array<{ id: AppearanceSettings['theme']; label: string; icon: typeof Moon }> = [
    { id: 'wetocode-dark', label: 'Weto 深色', icon: Moon }, { id: 'cloud-light', label: '云雾浅色', icon: Sun },
    { id: 'strawberry-cream', label: '草莓奶油', icon: Heart }, { id: 'silver-minimal', label: '极简银灰', icon: Monitor },
    { id: 'forest-care', label: '护眼墨绿', icon: Leaf },
  ]

  function editProvider(provider?: Partial<ProviderSettings>) {
    setError(undefined)
    setTestResult(undefined)
    setEditing(provider ? { protocol: 'openai-compatible', ...provider } : { ...providerPresets[3] })
  }

  async function save() {
    if (!editing) return
    setSaving(true); setError(undefined)
    try { onSettings(await bridge.saveProvider(editing)); setEditing(undefined) }
    catch (reason) { setError((reason as Error).message) }
    finally { setSaving(false) }
  }

  async function testConnection() {
    if (!editing) return
    setTesting(true); setError(undefined); setTestResult(undefined)
    try {
      const result = await bridge.testProvider(editing)
      setTestResult(`${result.message} ${result.latencyMs} ms`)
    } catch (reason) { setError((reason as Error).message) }
    finally { setTesting(false) }
  }

  async function checkUpdate() {
    setChecking(true)
    try {
      const result = await bridge.checkForUpdates()
      if (result.message) setError(result.message)
    } catch (reason) { setError((reason as Error).message) }
    finally { setChecking(false) }
  }

  async function selectBackgroundImage() {
    try {
      const backgroundImage = await bridge.chooseAppearanceBackground()
      if (backgroundImage) await onAppearance({ custom: { ...bootstrap.settings.appearance.custom, backgroundImage } })
    } catch (reason) { setError((reason as Error).message) }
  }

  async function importTheme() {
    try {
      const settings = await bridge.importAppearance()
      if (settings) onSettings(settings)
    } catch (reason) { setError((reason as Error).message) }
  }

  return (
    <>
      <PanelHead icon={Settings} title="模型与设置" onClose={onClose} />
      <div className="panel-scroll settings-content">
        <section className="settings-section">
          <div className="settings-title"><div><Zap size={16} /><span><b>使用模式</b><small>项目和会话数据在两种模式间共享</small></span></div></div>
          <div className="experience-options"><button className={bootstrap.settings.experienceMode === 'beginner' ? 'active' : ''} onClick={async () => onSettings(await bridge.setExperienceMode('beginner'))}><Sparkles size={15} /><span><b>小白模式</b><small>任务入口优先，默认隐藏终端</small></span></button><button className={bootstrap.settings.experienceMode === 'professional' ? 'active' : ''} onClick={async () => onSettings(await bridge.setExperienceMode('professional'))}><Code2 size={15} /><span><b>专业模式</b><small>保留完整开发工作台</small></span></button></div>
        </section>
        <section className="settings-section">
          <div className="settings-title"><div><Sun size={16} /><span><b>外观</b><small>主题、密度和界面缩放</small></span></div></div>
          <div className="appearance-setting theme-setting"><span><b>主题</b><small>实时应用并在重启后保持</small></span><select value={bootstrap.settings.appearance.theme} onChange={(event) => void onAppearance({ theme: event.target.value as AppearanceSettings['theme'] })}><option value="system">跟随系统</option><option value="light">经典浅色</option><option value="dark">经典深色</option>{themePresets.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}</select></div>
          <div className="theme-preset-grid">{themePresets.map(({ id, label, icon: Icon }) => <button key={id} className={bootstrap.settings.appearance.theme === id ? 'active' : ''} onClick={() => void onAppearance({ theme: id })}><Icon size={15} /><span>{label}</span></button>)}</div>
          <div className="appearance-setting"><span><b>信息密度</b><small>调整任务列表和内容间距</small></span><div className="appearance-options text-options">
            <button className={bootstrap.settings.appearance.density === 'comfortable' ? 'active' : ''} onClick={() => onAppearance({ density: 'comfortable' })}>舒适</button>
            <button className={bootstrap.settings.appearance.density === 'compact' ? 'active' : ''} onClick={() => onAppearance({ density: 'compact' })}>紧凑</button>
          </div></div>
          <div className="appearance-setting zoom-setting"><span><b>界面缩放</b><small>调整所有文字和控件大小</small></span><div className="zoom-slider"><input type="range" min="0.8" max="1.4" step="0.05" value={zoom} aria-label="界面缩放" onChange={(event) => {
            setZoom(Number(event.target.value))
          }} onPointerUp={(event) => void onAppearance({ zoom: Number(event.currentTarget.value) })} onKeyUp={(event) => void onAppearance({ zoom: Number(event.currentTarget.value) })} /><output>{Math.round(zoom * 100)}%</output></div></div>
          <div className="appearance-setting zoom-setting"><span><b>终端字号</b><small>中英文代码与中文输出同步调整</small></span><div className="zoom-slider"><input type="range" min="10" max="22" step="1" value={bootstrap.settings.appearance.terminal.fontSize} aria-label="终端字号" onChange={(event) => void onAppearance({ terminal: { ...bootstrap.settings.appearance.terminal, fontSize: Number(event.target.value) } })} /><output>{bootstrap.settings.appearance.terminal.fontSize}px</output></div></div>
          <div className="appearance-setting zoom-setting"><span><b>自定义颜色</b><small>主题 token 会立即应用到界面和终端光标</small></span><div className="color-controls"><label><span>主色</span><input type="color" value={bootstrap.settings.appearance.custom.accent || '#176b4d'} onChange={(event) => void onAppearance({ custom: { ...bootstrap.settings.appearance.custom, accent: event.target.value } })} /></label><label><span>背景</span><input type="color" value={bootstrap.settings.appearance.custom.background || '#f3f5f7'} onChange={(event) => void onAppearance({ custom: { ...bootstrap.settings.appearance.custom, background: event.target.value } })} /></label><label><span>终端背景</span><input type="color" value={bootstrap.settings.appearance.terminal.background || '#202528'} onChange={(event) => void onAppearance({ terminal: { ...bootstrap.settings.appearance.terminal, background: event.target.value } })} /></label></div></div>
          <div className="appearance-setting zoom-setting"><span><b>卡片透明度</b><small>使用背景图片时保持内容可读</small></span><div className="zoom-slider"><input type="range" min="70" max="100" step="1" value={bootstrap.settings.appearance.custom.transparency} onChange={(event) => void onAppearance({ custom: { ...bootstrap.settings.appearance.custom, transparency: Number(event.target.value), surface: bootstrap.settings.appearance.custom.surface || '#ffffff' } })} /><output>{bootstrap.settings.appearance.custom.transparency}%</output></div></div>
          <div className="appearance-setting zoom-setting"><span><b>圆角</b><small>调整主要控件的边角大小</small></span><div className="zoom-slider"><input type="range" min="0" max="12" step="1" value={bootstrap.settings.appearance.custom.radius} onChange={(event) => void onAppearance({ custom: { ...bootstrap.settings.appearance.custom, radius: Number(event.target.value) } })} /><output>{bootstrap.settings.appearance.custom.radius}px</output></div></div>
          <div className="appearance-setting zoom-setting"><span><b>阴影强度</b><small>调整浮层与工作区的层级感</small></span><div className="zoom-slider"><input type="range" min="0" max="3" step="1" value={bootstrap.settings.appearance.custom.shadow} onChange={(event) => void onAppearance({ custom: { ...bootstrap.settings.appearance.custom, shadow: Number(event.target.value) } })} /><output>{bootstrap.settings.appearance.custom.shadow}</output></div></div>
          <div className="appearance-setting zoom-setting"><span><b>终端配色</b><small>分别设置前景文字与光标</small></span><div className="color-controls"><label><span>文字</span><input type="color" value={bootstrap.settings.appearance.terminal.foreground || '#e0e6e3'} onChange={(event) => void onAppearance({ terminal: { ...bootstrap.settings.appearance.terminal, foreground: event.target.value } })} /></label><label><span>光标</span><input type="color" value={bootstrap.settings.appearance.terminal.cursor || '#72c79d'} onChange={(event) => void onAppearance({ terminal: { ...bootstrap.settings.appearance.terminal, cursor: event.target.value } })} /></label></div></div>
          <div className="appearance-setting"><span><b>界面动画</b><small>可减少动画以提升稳定性</small></span><button className={`toggle-button ${bootstrap.settings.appearance.custom.animations ? 'on' : ''}`} title="切换界面动画" onClick={() => void onAppearance({ custom: { ...bootstrap.settings.appearance.custom, animations: !bootstrap.settings.appearance.custom.animations } })}><i /></button></div>
          <div className="theme-file-actions"><button className="ghost-button" onClick={() => void selectBackgroundImage()}><Image size={14} />选择本地背景</button><button className="ghost-button" onClick={() => void bridge.exportAppearance()}><ArrowDownToLine size={14} />导出主题</button><button className="ghost-button" onClick={() => void importTheme()}><ArrowDownToLine size={14} />导入主题</button><button className="ghost-button" onClick={() => void onAppearance({ theme: 'system', custom: { accent: '', background: '', surface: '', transparency: 100, radius: 6, shadow: 1, animations: true, backgroundImage: '' }, terminal: { ...bootstrap.settings.appearance.terminal, background: '', foreground: '', cursor: '' } })}><RotateCcw size={14} />恢复默认</button></div>
        </section>
        <section className="settings-section">
          <div className="settings-title"><div><KeyRound size={16} /><span><b>模型供应商</b><small>密钥不会进入对话上下文</small></span></div><button className="mini-button" onClick={() => editProvider()}><Plus size={14} />添加</button></div>
          <div className="provider-list">
            {bootstrap.settings.providers.map((provider) => (
              <div className={`provider-row ${activeProvider?.id === provider.id ? 'active' : ''}`} key={provider.id}>
                <button className="provider-main" onClick={() => void onProviderChange(provider.id)}>
                  <span className="provider-mark">{provider.name.slice(0, 1)}</span><span><b>{provider.name}</b><small>{provider.id === 'wetocode-free' ? `${provider.model} · 第三方公共试用额度` : provider.model}</small></span>
                  {activeProvider?.id === provider.id && <CheckCircle2 size={16} />}
                </button>
                {provider.id !== 'wetocode-free' && <button className="provider-edit" title="编辑" onClick={() => editProvider(provider)}><PencilLine size={14} /></button>}
              </div>
            ))}
          </div>
          <p className="provider-note">公共免费模型无需你的个人密钥，试用额度由第三方按公网 IP 统计；同一网络下的用户可能共享限额，服务也可能限流或调整。其他模型使用各自用户配置的 API Key。</p>
          <button className="preset-toggle" onClick={() => editProvider()}><Plus size={15} />接入其他模型或内网网关</button>
        </section>

        <section className="settings-section">
          <div className="settings-title"><div><ShieldCheck size={16} /><span><b>安全</b><small>{bootstrap.settings.security.keyStorage}</small></span></div></div>
          <div className="setting-line"><span><b>Agent 权限</b><small>从输入框下方切换</small></span><span className={`status-chip ${bootstrap.settings.accessMode === 'full' ? 'danger' : ''}`}>{accessModeLabel(bootstrap.settings.accessMode)}</span></div>
          <div className="setting-line"><span><b>项目外访问</b><small>{bootstrap.settings.accessMode === 'full' ? '允许访问本机其他目录' : '超出工作区时停止任务'}</small></span><span className={`status-chip ${bootstrap.settings.accessMode === 'full' ? 'danger' : 'warn'}`}>{bootstrap.settings.accessMode === 'full' ? '已允许' : '默认拦截'}</span></div>
          <div className="setting-line"><span><b>读取环境密钥</b><small>.env 及同类文件</small></span><span className={`status-chip ${bootstrap.settings.accessMode === 'full' ? 'danger' : 'warn'}`}>{bootstrap.settings.accessMode === 'full' ? '已允许' : '默认拦截'}</span></div>
          <div className="setting-line"><span><b>会话分享</b><small>防止代码意外上传</small></span><span className="status-chip">已关闭</span></div>
        </section>

        <section className="settings-section">
          <div className="settings-title"><div><RefreshCw size={16} /><span><b>软件更新</b><small>当前版本 {bootstrap.appVersion}</small></span></div></div>
          <div className="update-box">
            <span className={`update-icon ${update?.status === 'ready' ? 'ready' : ''}`}><ArrowDownToLine size={18} /></span>
            <span><b>{update?.status === 'available' ? `发现 ${update.version}` : update?.status === 'ready' ? '更新已就绪' : '自动保持最新'}</b><small>{update?.status === 'downloading' ? `正在下载 ${Math.round(update.percent || 0)}%` : '发布后自动检查签名安装包'}</small></span>
            {update?.status === 'ready' ? <button className="mini-button" onClick={() => bridge.installUpdate()}>重启安装</button> : <button className="icon-btn" title="检查更新" onClick={checkUpdate}><RefreshCw className={checking ? 'spin' : ''} size={15} /></button>}
          </div>
          {!bootstrap.packaged && <p className="dev-note">当前为开发模式，安装包发布后启用自动更新。</p>}
        </section>
      </div>

      {editing && (
        <div className="dialog-backdrop">
          <div className="provider-dialog">
            <div className="dialog-head"><div><KeyRound size={18} /><b>{editing.id ? '编辑模型' : '接入模型'}</b></div><button className="icon-btn" onClick={() => setEditing(undefined)}><X size={17} /></button></div>
            <label><span>服务商预设</span><select value={selectedPreset?.presetKey || ''} onChange={(event) => {
              const preset = providerPresets.find((item) => item.presetKey === event.target.value)
              if (preset) { setEditing({ ...editing, ...preset, id: editing.id }); setError(undefined); setTestResult(undefined) }
            }}><option value="">自定义配置</option>{providerPresets.map((preset) => <option key={preset.presetKey} value={preset.presetKey}>{preset.name}</option>)}</select></label>
            {selectedPreset?.help && <div className="provider-help"><AlertTriangle size={15} /><span><b>讯飞鉴权说明</b>{selectedPreset.help}</span></div>}
            <label><span>显示名称</span><input value={editing.name || ''} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
            <div className="field-row">
              <label><span>API 协议</span><select value={editing.protocol || 'openai-compatible'} onChange={(event) => setEditing({ ...editing, protocol: event.target.value as ProviderSettings['protocol'], kind: editing.baseUrl ? 'custom' : editing.kind })}>{providerProtocolOptions.map((protocol) => <option key={protocol.id} value={protocol.id}>{protocol.label}</option>)}</select></label>
              <label><span>模型 ID</span><input value={editing.model || ''} onChange={(event) => setEditing({ ...editing, model: event.target.value })} /></label>
            </div>
            <label><span>{selectedPreset?.credentialLabel || 'API Key'} {editing.hasApiKey && <small>已保存，留空则不修改</small>}</span><input type="password" autoComplete="off" value={editing.apiKey || ''} placeholder={editing.hasApiKey ? '••••••••••••••••' : selectedPreset?.credentialPlaceholder || 'sk-...'} onChange={(event) => setEditing({ ...editing, apiKey: event.target.value })} /></label>
            <label><span>API 地址 <small>填写版本根路径，不要追加 /chat/completions</small></span><input value={editing.baseUrl || ''} placeholder="https://gateway.example.com/v1" onChange={(event) => setEditing({ ...editing, baseUrl: event.target.value, kind: event.target.value ? 'custom' : editing.kind })} /></label>
            <details className="provider-advanced"><summary>高级配置</summary>
              <label><span>供应商 ID</span><input value={editing.providerId || ''} onChange={(event) => setEditing({ ...editing, providerId: event.target.value })} /></label>
              <label><span>价格标记 <small>内部服务可由你明确标记</small></span><select value={editing.priceMode || 'unknown'} onChange={(event) => setEditing({ ...editing, priceMode: event.target.value as ProviderSettings['priceMode'] })}><option value="unknown">价格未知</option><option value="free">内部免费</option><option value="paid">付费</option></select></label>
              <div className="field-row">
                <label><span>上下文窗口</span><input type="number" value={editing.contextWindow || 128000} onChange={(event) => setEditing({ ...editing, contextWindow: Number(event.target.value) })} /></label>
                <label><span>最大输出</span><input type="number" value={editing.outputLimit || 16384} onChange={(event) => setEditing({ ...editing, outputLimit: Number(event.target.value) })} /></label>
              </div>
            </details>
            {error && <div className="form-error"><AlertTriangle size={14} />{error}</div>}
            {testResult && <div className="form-success"><CheckCircle2 size={14} />{testResult}</div>}
            <div className="dialog-actions">
              {editing.id && editing.id !== 'wetocode-free' && <button className="danger-link" onClick={async () => { onSettings(await bridge.deleteProvider(editing.id!)); setEditing(undefined) }}><Trash2 size={14} />删除</button>}
              <span />
              {editing.kind === 'custom' && <button className="ghost-button" onClick={testConnection} disabled={testing || saving}>{testing ? <LoaderCircle className="spin" size={14} /> : <Activity size={14} />}测试连接</button>}
              <button className="ghost-button" onClick={() => setEditing(undefined)}>取消</button><button className="solid-button" onClick={save} disabled={saving || testing}>{saving && <LoaderCircle className="spin" size={14} />}保存并使用</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ContextPanel({ settings, provider, tokenTotal, percent, canManage, onCompact, onRestore, onFork, onClose }: {
  settings: AppSettings
  provider?: ProviderSettings
  tokenTotal: number
  percent: number
  canManage: boolean
  onCompact: () => Promise<void>
  onRestore: () => Promise<void>
  onFork: () => Promise<void>
  onClose: () => void
}) {
  return <><PanelHead icon={BrainCircuit} title="上下文状态" onClose={onClose} /><div className="panel-scroll context-content">
    <div className="context-gauge"><div className="gauge-ring" style={{ '--progress': `${percent * 3.6}deg` } as React.CSSProperties}><span>{percent}<small>%</small></span></div><div><b>{compactNumber(tokenTotal)} / {compactNumber(provider?.contextWindow || 0)}</b><span>当前会话使用量</span></div></div>
    <section className="context-section"><h3><Gauge size={16} />长上下文策略</h3>
      <div className="strategy-line"><span><b>自动压缩</b><small>接近模型上限时保留任务摘要</small></span><span className="toggle on"><i /></span></div>
      <div className="strategy-line"><span><b>工具输出裁剪</b><small>移除已消费的冗长日志</small></span><span className="toggle on"><i /></span></div>
      <div className="strategy-line"><span><b>保留最近上下文</b><small>压缩时不动最近的对话</small></span><b className="value">{compactNumber(settings.context.preserveRecentTokens)}</b></div>
      <div className="strategy-line"><span><b>预留输出空间</b><small>避免模型没有空间完成回答</small></span><b className="value">{compactNumber(settings.context.reservedTokens)}</b></div>
    </section>
    <section className="context-section"><h3><History size={16} />会话时间线</h3><div className="context-actions"><button disabled={!canManage} onClick={() => void onCompact()}><BrainCircuit size={14} /><span><b>立即压缩</b><small>整理长对话并保留关键状态</small></span></button><button disabled={!canManage} onClick={() => void onFork()}><GitBranch size={14} /><span><b>创建分支</b><small>从当前会话复制一条独立路线</small></span></button><button disabled={!canManage} onClick={() => void onRestore()}><RotateCcw size={14} /><span><b>恢复回退内容</b><small>撤销最近一次消息回退</small></span></button></div></section>
    <section className="context-section"><h3><ShieldCheck size={16} />项目安全规则</h3><div className="rule-list"><span><CheckCircle2 size={14} />敏感数据默认脱敏</span><span><CheckCircle2 size={14} />关键流程检查一致性与幂等</span><span><CheckCircle2 size={14} />数据库变更检查回滚方案</span><span>{settings.accessMode === 'full' ? <ShieldAlert size={14} /> : <CheckCircle2 size={14} />}{settings.accessMode === 'full' ? '本机操作已授权完全控制' : '危险操作默认拦截'}</span><span><CheckCircle2 size={14} />禁止会话公开分享</span></div></section>
    <div className="context-note"><Zap size={15} /><p><b>上下文由本地执行引擎管理</b><span>WetoCode 在压缩时保留任务目标、关键决策和未完成事项，不承诺超过当前模型的真实窗口。</span></p></div>
  </div></>
}

function changeIcon(change: GitFileChange) {
  if (change.kind === 'added') return FilePlus2
  if (change.kind === 'deleted') return FileMinus2
  return FilePenLine
}

function changeLabel(change: GitFileChange) {
  const labels: Record<GitFileChange['kind'], string> = {
    added: '新增', deleted: '删除', renamed: '重命名', copied: '复制', conflict: '冲突', modified: '修改',
  }
  return labels[change.kind]
}

function DiffView({ diff }: { diff?: GitDiffInfo }) {
  if (!diff) return <div className="diff-empty">选择文件查看变更</div>
  if (!diff.diff.trim()) return <div className="diff-empty">这个文件没有可显示的文本差异</div>
  return <pre className="diff-view">{diff.diff.split(/\r?\n/).map((line, index) => {
    const kind = line.startsWith('+++') || line.startsWith('---') ? 'file'
      : line.startsWith('@@') ? 'hunk'
        : line.startsWith('+') ? 'addition'
          : line.startsWith('-') ? 'deletion' : 'context'
    return <span className={kind} key={`${index}-${line.slice(0, 20)}`}><i>{index + 1}</i><code>{line || ' '}</code></span>
  })}</pre>
}

function ChangesPanel({ project, status, onStatus, onRefresh, onError, onClose }: {
  project: ProjectInfo | null
  status?: GitStatusInfo
  onStatus: (status: GitStatusInfo) => void
  onRefresh: () => Promise<void>
  onError: (message: string) => void
  onClose: () => void
}) {
  const [selectedPath, setSelectedPath] = useState<string>()
  const [diff, setDiff] = useState<GitDiffInfo>()
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<{ type: 'discard'; change: GitFileChange } | { type: 'restore'; checkpointId: string; label: string }>()

  useEffect(() => {
    const nextPath = status?.changes.some((item) => item.path === selectedPath) ? selectedPath : status?.changes[0]?.path
    setSelectedPath(nextPath)
    if (!project || !nextPath) { setDiff(undefined); return }
    let current = true
    bridge.getGitDiff(project.path, nextPath).then((value) => { if (current) setDiff(value) }).catch((error: Error) => onError(error.message))
    return () => { current = false }
  }, [onError, project, selectedPath, status])

  async function chooseChange(change: GitFileChange) {
    if (!project) return
    setSelectedPath(change.path); setDiff(undefined)
    try { setDiff(await bridge.getGitDiff(project.path, change.path)) }
    catch (error) { onError((error as Error).message) }
  }

  async function createCheckpoint() {
    if (!project || busy) return
    setBusy(true)
    try {
      const label = `手动检查点 ${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(Date.now())}`
      onStatus(await bridge.createGitCheckpoint(project.path, label))
    } catch (error) { onError((error as Error).message) }
    finally { setBusy(false) }
  }

  async function runConfirmedAction() {
    if (!project || !confirm || busy) return
    setBusy(true)
    try {
      const next = confirm.type === 'discard'
        ? await bridge.discardGitChange(project.path, confirm.change.path)
        : await bridge.restoreGitCheckpoint(project.path, confirm.checkpointId)
      onStatus(next); setConfirm(undefined); setDiff(undefined)
    } catch (error) { onError((error as Error).message) }
    finally { setBusy(false) }
  }

  return <>
    <PanelHead icon={GitCompare} title="变更" onClose={onClose} />
    <div className="panel-scroll changes-content">
      {!project ? <div className="git-empty"><FolderGit2 size={30} /><b>先打开一个项目</b><span>打开项目后可审阅文件变更。</span></div>
        : !status ? <div className="git-loading"><LoaderCircle className="spin" size={18} />正在读取 Git 状态</div>
          : !status.isRepository ? <div className="git-empty"><FolderGit2 size={30} /><b>尚未启用 Git</b><span>{status.reason}</span><button className="ghost-button" onClick={() => bridge.openProjectFolder(project.path)}>打开项目目录</button></div>
            : <>
              <div className="git-summary"><div><GitBranch size={15} /><span><b>{status.branch || '未命名分支'}</b><small>{status.head || '尚无提交'}</small></span></div><button className="icon-btn" title="刷新变更" onClick={onRefresh}><RefreshCw size={15} /></button></div>
              <div className="changes-toolbar"><span>{status.changes.length ? `${status.changes.length} 个文件有变更` : '工作区干净'}</span><button className="mini-button" disabled={!status.head || busy} onClick={createCheckpoint}><History size={14} />创建检查点</button></div>
              {status.changes.length ? <div className="change-list">{status.changes.map((change) => {
                const Icon = changeIcon(change)
                return <div className={`change-row ${selectedPath === change.path ? 'active' : ''}`} key={change.path}>
                  <button onClick={() => chooseChange(change)}><Icon size={15} /><span><b>{change.path.split(/[\\/]/).pop()}</b><small>{change.path}</small></span><em className={change.kind}>{changeLabel(change)}</em></button>
                  <button className="discard-change" title="撤销这个文件" onClick={() => setConfirm({ type: 'discard', change })}><RotateCcw size={14} /></button>
                </div>
              })}</div> : <div className="clean-state"><CheckCircle2 size={24} /><b>没有未提交变更</b></div>}
              {selectedPath && <section className="diff-section"><div className="diff-head"><span title={selectedPath}>{selectedPath}</span>{diff && <b><i>+{diff.additions}</i><em>-{diff.deletions}</em></b>}</div><DiffView diff={diff} /></section>}
              <section className="checkpoint-section"><h3><History size={15} />检查点</h3>{status.checkpoints.length ? status.checkpoints.map((checkpoint) => <div className="checkpoint-row" key={checkpoint.id}><span><b>{checkpoint.label}</b><small>{timeAgo(checkpoint.createdAt)}</small></span><button title="恢复检查点" onClick={() => setConfirm({ type: 'restore', checkpointId: checkpoint.id, label: checkpoint.label })}><RotateCcw size={14} /></button><button title="删除检查点" onClick={async () => { if (project) onStatus(await bridge.deleteGitCheckpoint(project.path, checkpoint.id)) }}><Trash2 size={14} /></button></div>) : <p>创建检查点后，可将工作区恢复到保存时的状态。</p>}</section>
            </>}
    </div>
    {confirm && <div className="dialog-backdrop"><div className="session-dialog"><div className="session-dialog-icon danger"><RotateCcw size={20} /></div><h2>{confirm.type === 'discard' ? '撤销这个文件的变更？' : '恢复检查点？'}</h2><p>{confirm.type === 'discard' ? `“${confirm.change.path}”的未提交内容将永久丢失。` : `当前未提交变更将被替换为“${confirm.label}”保存的状态。`}</p><div className="dialog-actions"><button className="ghost-button" onClick={() => setConfirm(undefined)}>取消</button><button className="danger-button" disabled={busy} onClick={runConfirmedAction}>{busy && <LoaderCircle className="spin" size={14} />}确认恢复</button></div></div></div>}
  </>
}

export default App
