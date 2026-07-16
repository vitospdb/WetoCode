const { contextBridge, ipcRenderer } = require('electron')

let agentEventHandler
let agentTasksHandler
let updateEventHandler
let terminalEventHandler
let automationEventHandler
let previewEventHandler

contextBridge.exposeInMainWorld('wetocode', {
  getBootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  getEngineStatus: () => ipcRenderer.invoke('app:engine-status'),
  getEnvironmentDoctor: (projectPath) => ipcRenderer.invoke('app:environment-doctor', projectPath),
  showMainWindow: () => ipcRenderer.invoke('app:show-window'),
  chooseProject: () => ipcRenderer.invoke('project:choose'),
  listSessions: (projectPath) => ipcRenderer.invoke('session:list', projectPath),
  getSession: (sessionId, projectPath) => ipcRenderer.invoke('session:get', sessionId, projectPath),
  renameSession: (sessionId, projectPath, title) => ipcRenderer.invoke('session:rename', sessionId, projectPath, title),
  archiveSession: (sessionId, projectPath, archived) => ipcRenderer.invoke('session:archive', sessionId, projectPath, archived),
  deleteSession: (sessionId, projectPath) => ipcRenderer.invoke('session:delete', sessionId, projectPath),
  forkSession: (sessionId, projectPath, messageId) => ipcRenderer.invoke('session:fork', sessionId, projectPath, messageId),
  revertSession: (sessionId, projectPath, messageId) => ipcRenderer.invoke('session:revert', sessionId, projectPath, messageId),
  unrevertSession: (sessionId, projectPath) => ipcRenderer.invoke('session:unrevert', sessionId, projectPath),
  compactSession: (sessionId, projectPath, providerId) => ipcRenderer.invoke('session:compact', sessionId, projectPath, providerId),
  runCommand: (sessionId, projectPath, providerId, command, args) => ipcRenderer.invoke('session:command', sessionId, projectPath, providerId, command, args),
  getExtensions: (projectPath) => ipcRenderer.invoke('extensions:overview', projectPath),
  getUsage: (range) => ipcRenderer.invoke('usage:get', range),
  listAutomations: () => ipcRenderer.invoke('automation:list'),
  saveAutomation: (input) => ipcRenderer.invoke('automation:save', input),
  setAutomationEnabled: (id, enabled) => ipcRenderer.invoke('automation:set-enabled', id, enabled),
  runAutomationNow: (id) => ipcRenderer.invoke('automation:run-now', id),
  deleteAutomation: (id) => ipcRenderer.invoke('automation:delete', id),
  getPreviewSuggestions: (projectPath) => ipcRenderer.invoke('preview:suggestions', projectPath),
  getPreview: (projectPath) => ipcRenderer.invoke('preview:get', projectPath),
  startPreview: (projectPath, input) => ipcRenderer.invoke('preview:start', projectPath, input),
  setPreviewUrl: (projectPath, url) => ipcRenderer.invoke('preview:set-url', projectPath, url),
  stopPreview: (projectPath) => ipcRenderer.invoke('preview:stop', projectPath),
  openPreviewExternal: (projectPath, url) => ipcRenderer.invoke('preview:open-external', projectPath, url),
  runAgent: (request) => ipcRenderer.invoke('agent:run', request),
  stopAgent: (runId) => ipcRenderer.invoke('agent:stop', runId),
  listAgentTasks: () => ipcRenderer.invoke('agent:tasks'),
  dismissAgentTask: (runId) => ipcRenderer.invoke('agent:task-dismiss', runId),
  replyPermission: (permissionId, response) => ipcRenderer.invoke('agent:permission-reply', permissionId, response),
  getGoal: (sessionId, projectPath) => ipcRenderer.invoke('goal:get', sessionId, projectPath),
  setGoalStatus: (sessionId, projectPath, action) => ipcRenderer.invoke('goal:set-status', sessionId, projectPath, action),
  createTerminal: (projectPath, size, mode) => ipcRenderer.invoke('terminal:create', projectPath, size, mode),
  attachTerminal: (ptyId) => ipcRenderer.invoke('terminal:attach', ptyId),
  sendTerminalInput: (ptyId, data) => ipcRenderer.invoke('terminal:input', ptyId, data),
  resizeTerminal: (ptyId, size) => ipcRenderer.invoke('terminal:resize', ptyId, size),
  closeTerminal: (ptyId) => ipcRenderer.invoke('terminal:close', ptyId),
  readClipboardText: () => ipcRenderer.invoke('clipboard:read-text'),
  writeClipboardText: (value) => ipcRenderer.invoke('clipboard:write-text', value),
  saveProvider: (provider) => ipcRenderer.invoke('provider:save', provider),
  testProvider: (provider) => ipcRenderer.invoke('provider:test', provider),
  listModelRegistry: (projectPath, refresh) => ipcRenderer.invoke('model:list', projectPath, refresh),
  useRegistryModel: (input) => ipcRenderer.invoke('model:use', input),
  testRegistryModel: (input) => ipcRenderer.invoke('model:test', input),
  setModelFavorite: (modelId, favorite) => ipcRenderer.invoke('model:favorite', modelId, favorite),
  deleteProvider: (id) => ipcRenderer.invoke('provider:delete', id),
  setActiveProvider: (id) => ipcRenderer.invoke('provider:set-active', id),
  setAccessMode: (accessMode) => ipcRenderer.invoke('settings:set-access-mode', accessMode),
  setReasoningEffort: (effort) => ipcRenderer.invoke('settings:set-reasoning-effort', effort),
  setAppearance: (appearance) => ipcRenderer.invoke('settings:set-appearance', appearance),
  exportAppearance: () => ipcRenderer.invoke('appearance:export'),
  importAppearance: () => ipcRenderer.invoke('appearance:import'),
  chooseAppearanceBackground: () => ipcRenderer.invoke('appearance:choose-background'),
  setOnboardingCompleted: (complete) => ipcRenderer.invoke('settings:set-onboarding-complete', complete),
  setExperienceMode: (mode) => ipcRenderer.invoke('settings:set-experience-mode', mode),
  getGitStatus: (projectPath) => ipcRenderer.invoke('git:status', projectPath),
  getGitDiff: (projectPath, filePath) => ipcRenderer.invoke('git:diff', projectPath, filePath),
  discardGitChange: (projectPath, filePath) => ipcRenderer.invoke('git:discard', projectPath, filePath),
  openProjectFolder: (projectPath) => ipcRenderer.invoke('git:open-project', projectPath),
  createGitCheckpoint: (projectPath, label) => ipcRenderer.invoke('git:checkpoint-create', projectPath, label),
  restoreGitCheckpoint: (projectPath, checkpointId) => ipcRenderer.invoke('git:checkpoint-restore', projectPath, checkpointId),
  deleteGitCheckpoint: (projectPath, checkpointId) => ipcRenderer.invoke('git:checkpoint-delete', projectPath, checkpointId),
  listWorktrees: (projectPath) => ipcRenderer.invoke('worktree:list', projectPath),
  createWorktree: (projectPath, name) => ipcRenderer.invoke('worktree:create', projectPath, name),
  removeWorktree: (projectPath, directory) => ipcRenderer.invoke('worktree:remove', projectPath, directory),
  resetWorktree: (projectPath, directory) => ipcRenderer.invoke('worktree:reset', projectPath, directory),
  chooseAttachments: (projectPath) => ipcRenderer.invoke('attachment:choose', projectPath),
  addProjectAttachment: (projectPath, relativePath) => ipcRenderer.invoke('attachment:add-project', projectPath, relativePath),
  addDataAttachment: (projectPath, input) => ipcRenderer.invoke('attachment:add-data', projectPath, input),
  removeAttachment: (attachmentId) => ipcRenderer.invoke('attachment:remove', attachmentId),
  listProjectFiles: (projectPath, relativePath) => ipcRenderer.invoke('file:list', projectPath, relativePath),
  searchProjectFiles: (projectPath, query) => ipcRenderer.invoke('file:search', projectPath, query),
  readProjectFile: (projectPath, relativePath) => ipcRenderer.invoke('file:read', projectPath, relativePath),
  openProjectFile: (projectPath, relativePath) => ipcRenderer.invoke('file:open', projectPath, relativePath),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  onAgentEvent: (listener) => {
    if (agentEventHandler) ipcRenderer.removeListener('agent:event', agentEventHandler)
    agentEventHandler = (_event, payload) => listener(payload)
    ipcRenderer.on('agent:event', agentEventHandler)
  },
  onAgentTasksChanged: (listener) => {
    if (agentTasksHandler) ipcRenderer.removeListener('agent:tasks-changed', agentTasksHandler)
    agentTasksHandler = (_event, payload) => listener(payload)
    ipcRenderer.on('agent:tasks-changed', agentTasksHandler)
  },
  onTerminalEvent: (listener) => {
    if (terminalEventHandler) ipcRenderer.removeListener('terminal:event', terminalEventHandler)
    terminalEventHandler = (_event, payload) => listener(payload)
    ipcRenderer.on('terminal:event', terminalEventHandler)
  },
  onUpdateEvent: (listener) => {
    if (updateEventHandler) ipcRenderer.removeListener('update:event', updateEventHandler)
    updateEventHandler = (_event, payload) => listener(payload)
    ipcRenderer.on('update:event', updateEventHandler)
  },
  onAutomationsChanged: (listener) => {
    if (automationEventHandler) ipcRenderer.removeListener('automation:changed', automationEventHandler)
    automationEventHandler = (_event, payload) => listener(payload)
    ipcRenderer.on('automation:changed', automationEventHandler)
  },
  onPreviewChanged: (listener) => {
    if (previewEventHandler) ipcRenderer.removeListener('preview:changed', previewEventHandler)
    previewEventHandler = (_event, payload) => listener(payload)
    ipcRenderer.on('preview:changed', previewEventHandler)
  },
})
