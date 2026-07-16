const UPSTREAM_NAME = /opencode/gi

const TERMINAL_TRANSLATIONS = Object.freeze([
  ['What is the tech stack of this project?', '这个项目使用了哪些技术？'],
  ['Fix a TODO in the codebase', '修复代码库中的 TODO'],
  ['Fix broken tests', '修复失败的测试'],
  ['Connect a provider to send prompts', '连接模型服务后即可发送消息'],
  ['Run /connect to add an AI provider and start coding', '运行 /connect 添加模型服务并开始编程'],
  ['Show command palette', '显示命令面板'],
  ['Switch session', '切换会话'],
  ['New session', '新建会话'],
  ['Copy worktree path', '复制工作树路径'],
  ['Manage workspaces', '管理工作区'],
  ['Switch model variant', '切换模型变体'],
  ['Switch model', '切换模型'],
  ['Switch agent', '切换智能体'],
  ['Toggle MCPs', '切换 MCP'],
  ['Connect provider', '连接模型服务'],
  ['View status', '查看状态'],
  ['View debug info', '查看调试信息'],
  ['Switch theme', '切换主题'],
  ['Switch to light mode', '切换到浅色模式'],
  ['Switch to dark mode', '切换到深色模式'],
  ['Unlock theme mode', '解锁主题模式'],
  ['Lock theme mode', '锁定主题模式'],
  ['Open docs', '打开文档'],
  ['Exit the app', '退出应用'],
  ['Toggle debug panel', '切换调试面板'],
  ['Toggle console', '切换控制台'],
  ['Write heap snapshot', '写入堆快照'],
  ['Disable terminal title', '禁用终端标题'],
  ['Enable terminal title', '启用终端标题'],
  ['Disable animations', '禁用动画'],
  ['Enable animations', '启用动画'],
  ['Show tips', '显示提示'],
  ['Hide tips', '隐藏提示'],
  ['Clear prompt', '清空输入'],
  ['Submit prompt', '提交输入'],
  ['Remove editor context', '移除编辑器上下文'],
  ['Interrupt session', '中断会话'],
  ['Open editor', '打开编辑器'],
  ['Move session', '移动会话'],
  ['Change the workspace for the session', '更改当前会话的工作区'],
  ['Move to another project dir', '移动到其他项目目录'],
  ['Rename session', '重命名会话'],
  ['Jump to message', '跳转到消息'],
  ['Fork session', '派生会话'],
  ['Compact session', '压缩会话'],
  ['Undo previous message', '撤销上一条消息'],
  ['Copy last assistant message', '复制助手的上一条消息'],
  ['Copy session transcript', '复制会话记录'],
  ['Export session transcript', '导出会话记录'],
  ['Background subagents', '后台子智能体'],
  ['Go to child session', '前往子会话'],
  ['Go to parent session', '前往父会话'],
  ['Message Actions', '消息操作'],
  ['Subagent Actions', '子智能体操作'],
  ['Rename Session', '重命名会话'],
  ['Permission required', '需要权限'],
  ['Always allow', '始终允许'],
  ['Reject permission', '拒绝授权'],
  ['Tell OpenCode what to do differently', '告诉 WetoCode 应如何调整'],
  ['Continue after repeated failures', '多次失败后继续'],
  ['This keeps the session running despite repeated failures.', '即使多次失败也继续运行会话。'],
  ['No diff provided', '未提供差异'],
  ['Select agent', '选择智能体'],
  ['Connect a provider', '连接模型服务'],
  ['Select auth method', '选择认证方式'],
  ['Waiting for authorization...', '正在等待授权...'],
  ['Authorization code', '授权码'],
  ['Existing Workspace', '现有工作区'],
  ['Search skills...', '搜索技能...'],
  ['No matching items', '没有匹配项'],
  ['No results found', '未找到结果'],
  ['Type your own answer', '输入自定义回答'],
  ['An unexpected error stopped the session.', '意外错误导致会话停止。'],
  ['No MCP Servers', '没有 MCP 服务'],
  ['No Formatters', '无格式化工具'],
  ['No Plugins', '没有插件'],
  ['Disabled in configuration', '已在配置中禁用'],
])

function isWideCodePoint(codePoint) {
  return codePoint >= 0x1100 && (
    codePoint <= 0x115f ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1f64f) ||
    (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  )
}

function terminalDisplayWidth(value) {
  let width = 0
  for (const character of String(value || '')) {
    if (/\p{Mark}/u.test(character)) continue
    const codePoint = character.codePointAt(0)
    if (codePoint < 32 || (codePoint >= 0x7f && codePoint < 0xa0)) continue
    width += isWideCodePoint(codePoint) ? 2 : 1
  }
  return width
}

const PADDED_TRANSLATIONS = TERMINAL_TRANSLATIONS
  .map(([source, target]) => {
    const padding = terminalDisplayWidth(source) - terminalDisplayWidth(target)
    if (padding < 0) throw new Error(`Terminal translation is wider than its source: ${source}`)
    return [source, target + ' '.repeat(padding)]
  })
  .sort(([left], [right]) => right.length - left.length)

function brandText(value) {
  return value.replace(UPSTREAM_NAME, 'WetoCode')
}

function localizeTerminalText(value) {
  let output = String(value || '')
  for (const [source, target] of PADDED_TRANSLATIONS) output = output.replaceAll(source, target)
  return output
}

function transformText(value) {
  return brandText(localizeTerminalText(value))
}

function possibleNameSuffix(value) {
  const name = 'opencode'
  const lower = value.toLowerCase()
  for (let length = Math.min(name.length - 1, value.length); length > 0; length -= 1) {
    if (lower.endsWith(name.slice(0, length))) return length
  }
  return value.endsWith('\x1b') ? 1 : 0
}

function possibleTextSuffix(value) {
  let keep = possibleNameSuffix(value)
  for (const [source] of PADDED_TRANSLATIONS) {
    const limit = Math.min(source.length - 1, value.length)
    for (let length = limit; length > keep; length -= 1) {
      if (value.endsWith(source.slice(0, length))) {
        keep = length
        break
      }
    }
  }
  return keep
}

function createTerminalBrandFilter() {
  let pending = ''

  function write(value, final = false) {
    pending += String(value || '')
    let output = ''
    let offset = 0
    let remainder

    while (offset < pending.length) {
      const titleStart = pending.indexOf('\x1b]', offset)
      if (titleStart < 0) {
        const rest = pending.slice(offset)
        const transformed = transformText(rest)
        const keep = final ? 0 : possibleTextSuffix(transformed)
        output += keep ? transformed.slice(0, -keep) : transformed
        offset = pending.length
        remainder = keep ? transformed.slice(-keep) : ''
        break
      }

      output += transformText(pending.slice(offset, titleStart))
      const bel = pending.indexOf('\x07', titleStart + 2)
      const st = pending.indexOf('\x1b\\', titleStart + 2)
      const titleEnd = bel < 0 ? st : st < 0 ? bel : Math.min(bel, st)
      if (titleEnd < 0 && !final) {
        offset = titleStart
        break
      }
      if (titleEnd < 0) {
        output += transformText(pending.slice(titleStart))
        offset = pending.length
        break
      }
      output += '\x1b]0;WetoCode\x07'
      offset = titleEnd + (titleEnd === st ? 2 : 1)
    }

    pending = remainder === undefined ? pending.slice(offset) : remainder
    return output
  }

  return {
    write: (value) => write(value),
    flush: () => write('', true),
  }
}

function brandTerminalOutput(value) {
  const filter = createTerminalBrandFilter()
  return filter.write(value) + filter.flush()
}

module.exports = {
  TERMINAL_TRANSLATIONS,
  brandTerminalOutput,
  createTerminalBrandFilter,
  localizeTerminalText,
  terminalDisplayWidth,
}
