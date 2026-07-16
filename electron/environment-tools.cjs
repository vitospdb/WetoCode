const fs = require('node:fs')
const path = require('node:path')

function reasonForMissing(name) {
  const labels = {
    Git: '未找到 Git，暂时无法使用版本管理和检查点。',
    'Node.js': '未找到 Node.js，WetoCode 暂时无法运行这个项目。',
    npm: '未找到 npm，无法安装或运行 Node.js 项目依赖。',
    Python: '未找到 Python，Python 项目暂时无法运行。',
    PowerShell: '未找到 PowerShell，Windows Shell 功能暂时不可用。',
  }
  return labels[name] || `未找到 ${name}。`
}

async function commandCheck({ id, name, command, args = ['--version'], required = false }, execFile) {
  try {
    const { stdout, stderr } = await execFile(command, args, { timeout: 5000, windowsHide: true })
    const version = String(stdout || stderr || '').trim().split(/\r?\n/)[0].slice(0, 120)
    return { id, name, status: 'ready', required, detail: version || '已找到并可运行。', action: '' }
  } catch (error) {
    const message = String(error?.message || '')
    const missing = error?.code === 'ENOENT' || /not found|not recognized/i.test(message)
    return {
      id, name, status: missing ? 'missing' : 'warning', required,
      detail: missing ? reasonForMissing(name) : `无法检查 ${name}：${message.slice(0, 140)}`,
      action: missing ? '查看原因或安装后重新检查' : '查看诊断信息后重试',
    }
  }
}

function projectDependencyCheck(projectPath) {
  if (!projectPath) return { id: 'project', name: '当前项目依赖', status: 'skipped', required: false, detail: '选择项目后检查依赖文件。', action: '' }
  const packageJson = path.join(projectPath, 'package.json')
  const nodeModules = path.join(projectPath, 'node_modules')
  if (!fs.existsSync(packageJson)) return { id: 'project', name: '当前项目依赖', status: 'ready', required: false, detail: '未发现 Node.js 项目依赖文件。', action: '' }
  if (fs.existsSync(nodeModules)) return { id: 'project', name: '当前项目依赖', status: 'ready', required: false, detail: '已检测到 node_modules。', action: '' }
  return { id: 'project', name: '当前项目依赖', status: 'warning', required: false, detail: '检测到 package.json，但尚未安装 node_modules。', action: '可在终端执行 npm install，或让 WetoCode 协助处理。' }
}

async function environmentReport({ platform, projectPath, engine, providers }, execFile) {
  const commands = [
    { id: 'git', name: 'Git', command: 'git', required: false },
    { id: 'node', name: 'Node.js', command: platform === 'win32' ? 'node.exe' : 'node', required: true },
    { id: 'npm', name: 'npm', command: platform === 'win32' ? 'npm.cmd' : 'npm', required: true },
    { id: 'pnpm', name: 'pnpm', command: platform === 'win32' ? 'pnpm.cmd' : 'pnpm', required: false },
    { id: 'python', name: 'Python', command: platform === 'win32' ? 'py' : 'python3', required: false },
    { id: 'powershell', name: 'PowerShell', command: platform === 'win32' ? 'powershell.exe' : 'pwsh', args: ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], required: platform === 'win32' },
  ]
  const checks = await Promise.all(commands.map((item) => commandCheck(item, execFile)))
  checks.push({ id: 'path', name: '系统 PATH', status: process.env.PATH ? 'ready' : 'warning', required: true, detail: process.env.PATH ? '已检测到系统 PATH 配置。' : '未检测到 PATH，系统命令可能无法启动。', action: process.env.PATH ? '' : '请在系统设置中检查 PATH。' })
  checks.push({ id: 'engine', name: 'OpenCode / WetoCode CLI', status: engine?.installed ? 'ready' : 'missing', required: true, detail: engine?.installed ? `本地执行引擎已就绪${engine.version ? `：${engine.version}` : ''}。` : '本地执行引擎未就绪，请重新安装 WetoCode。', action: engine?.installed ? '' : '重新安装后再次检查。' })
  checks.push(projectDependencyCheck(projectPath))
  const configured = Array.isArray(providers) ? providers.filter((item) => item.id === 'wetocode-free' || item.hasApiKey || String(item.baseUrl || '').startsWith('http://127.0.0.1')).length : 0
  checks.push({ id: 'provider', name: '模型服务配置', status: configured ? 'ready' : 'warning', required: true, detail: configured ? `已检测到 ${configured} 个可尝试使用的模型服务。` : '尚未配置可验证的模型服务。', action: configured ? '可在模型中心测试连接。' : '打开模型中心添加服务或 API Key。' })
  return { checkedAt: Date.now(), checks }
}

module.exports = { commandCheck, environmentReport, projectDependencyCheck, reasonForMissing }
