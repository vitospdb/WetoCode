#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDirectory, 'package.json'), 'utf8'))
const args = process.argv.slice(2)
const terminalTitle = 'WetoCode'

function setTerminalTitle() {
  process.title = terminalTitle
  if (process.stdout.isTTY) process.stdout.write(`\x1b]0;${terminalTitle}\x07`)
}

setTerminalTitle()

const developmentInstructions = [
  '你是 WetoCode，更符合中国开发者使用习惯的中文 Coding Agent。',
  '始终使用简体中文交流；代码、协议字段和行业通用缩写保持原文。',
  '先理解现有代码和约束，再做最小必要修改，并运行与风险相称的验证。',
  '严禁在回复、日志、补丁或测试数据中暴露 API Key、口令、身份证号、支付账号、手机号等敏感信息。',
  '处理用户或业务样例时使用明显虚构且脱敏的数据。不得绕过认证、审计、权限控制和幂等约束。',
  '涉及数据一致性或关键业务流程时，明确精度、时区、并发、幂等、审计轨迹和失败补偿。',
  'SQL 默认使用参数化查询；数据库变更必须考虑兼容发布、数据回填和回滚。',
  '未经明确授权，不访问项目目录外文件，不向公网发送项目代码或业务数据，不执行不可逆命令。',
  '当前为标准研发模式：小范围可逆修改可直接完成；高风险操作必须停止执行并清楚说明原因。',
].join('\n')

function findOpenCode() {
  const executable = process.platform === 'win32' ? 'opencode.exe' : 'opencode'
  const candidates = [
    process.env.OPENCODE_BIN,
    path.join(rootDirectory, 'node_modules', 'opencode-ai', 'bin', 'opencode.exe'),
    path.join(path.dirname(process.execPath), executable),
    executable,
  ].filter(Boolean)
  return candidates.find((candidate) => candidate === executable || fs.existsSync(candidate)) || executable
}

function ensureRules() {
  const directory = path.join(os.homedir(), '.wetocode', 'rules')
  const rulesPath = path.join(directory, 'development-safety.md')
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  fs.rmSync(path.join(directory, 'bank-coding.md'), { force: true })
  fs.writeFileSync(rulesPath, `${developmentInstructions}\n`, { mode: 0o600 })
  return rulesPath
}

function parseExistingConfig() {
  if (!process.env.OPENCODE_CONFIG_CONTENT) return {}
  try {
    return JSON.parse(process.env.OPENCODE_CONFIG_CONTENT)
  } catch {
    console.error('WetoCode: OPENCODE_CONFIG_CONTENT 不是有效 JSON。')
    process.exit(2)
  }
}

function buildConfig() {
  const existing = parseExistingConfig()
  const existingPermission = existing.permission || {}
  const existingBash = existingPermission.bash || {}
  const existingRead = existingPermission.read || {}
  const instructions = Array.isArray(existing.instructions) ? existing.instructions : []

  return {
    ...existing,
    model: existing.model || 'opencode/mimo-v2.5-free',
    instructions: [...new Set([...instructions, ensureRules()])],
    share: 'disabled',
    autoupdate: false,
    compaction: {
      auto: true,
      prune: true,
      preserve_recent_tokens: 24000,
      reserved: 16000,
      ...(existing.compaction || {}),
    },
    permission: {
      ...existingPermission,
      external_directory: 'deny',
      doom_loop: 'deny',
      read: {
        '*': 'allow',
        ...existingRead,
        '*.env': 'deny',
        '*.env.*': 'deny',
        '*.env.example': 'allow',
      },
      bash: {
        '*': 'allow',
        ...existingBash,
        'rm *': 'deny',
        'sudo *': 'deny',
        'git push *': 'deny',
        'git reset --hard*': 'deny',
        'git clean *': 'deny',
        'docker system prune*': 'deny',
        'kubectl delete *': 'deny',
        'terraform destroy*': 'deny',
      },
    },
  }
}

function printHelp() {
  console.log(`WetoCode CLI ${packageJson.version}

更符合中国开发者使用习惯的中文桌面 Coding Agent，底层使用 OpenCode。

用法:
  wetocode [项目目录]             启动交互式终端界面
  wetocode run "任务描述"        执行一次开发任务
  wetocode models                查看可用模型
  wetocode providers             配置模型认证
  wetocode <命令> --help         查看底层命令帮助

选项:
  -h, --help                  显示此帮助
  -v, --version               显示 WetoCode 和引擎版本

也可以设置 OPENCODE_BIN 使用企业审批过的 OpenCode 引擎。`)
}

const openCode = findOpenCode()

if (args.length === 1 && ['-h', '--help'].includes(args[0])) {
  printHelp()
  process.exit(0)
}

if (args.length === 1 && ['-v', '--version'].includes(args[0])) {
  const result = spawnSync(openCode, ['--version'], { encoding: 'utf8', windowsHide: true })
  const engineVersion = result.status === 0 ? result.stdout.trim() : '不可用'
  console.log(`WetoCode ${packageJson.version} (OpenCode ${engineVersion})`)
  process.exit(result.status === 0 ? 0 : 1)
}

const child = spawn(openCode, args, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    OPENCODE_CONFIG_CONTENT: JSON.stringify(buildConfig()),
  },
  stdio: 'inherit',
  windowsHide: false,
})
const titleTimer = setInterval(setTerminalTitle, 1_000)
titleTimer.unref()

child.on('error', (error) => {
  clearInterval(titleTimer)
  console.error(`WetoCode: 无法启动 OpenCode 引擎：${error.message}`)
  process.exitCode = 1
})

child.on('exit', (code, signal) => {
  clearInterval(titleTimer)
  setTerminalTitle()
  if (signal) process.kill(process.pid, signal)
  else process.exitCode = code ?? 1
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
