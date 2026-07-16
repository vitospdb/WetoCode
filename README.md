# WetoCode

WetoCode 是更符合中国开发者使用习惯的中文桌面 Coding Agent。它以 OpenCode 为本地执行引擎，在桌面端提供中文任务工作台、通用研发安全规则、多模型接入、长上下文治理和自动更新。

Windows 安装包和免安装版请从 [GitHub Releases](https://github.com/vitospdb/WetoCode/releases) 下载。

当前仓库包含可运行的 `0.2.5` CLI 与桌面应用，不是静态界面稿。

## 已实现

- Electron + React 中文桌面工作台
- 通过持久 OpenCode Server/SDK 运行真实 agent loop，流式展示文本、工具调用和 token 数据
- 项目选择、历史会话读取与续接、搜索、重命名、归档和永久删除
- 后台任务中心、系统托盘和完成通知；有任务时关窗继续执行，再次启动会唤醒原实例并恢复结果
- 原生权限确认，可按操作允许一次、会话始终允许或拒绝
- 集成终端默认进入 WetoCode 自有交互层，只显示 `WetoCode >`，可切换项目 Shell；支持真实 PTY、Git 变更审阅/丢弃/检查点和隔离 Worktree
- 项目文件、上传图片和剪贴板图片附件
- OpenAI、Anthropic、DeepSeek、通义、智谱、OpenRouter、Ollama 及 OpenAI 兼容内网接口
- API Key 由 Electron 主进程使用系统密钥环加密，渲染进程只拿到脱敏状态
- 自动压缩、工具输出裁剪、近期上下文保留和输出 token 预留
- 通用研发规则注入：敏感信息、数据一致性、幂等、审计、迁移和回滚约束
- 项目外访问、环境文件和危险命令的权限边界
- 可切换变更前确认、自动编辑、计划与完全访问；完全访问会明确确认并实际放开 OpenCode 本机权限
- 基于签名安装包的更新检查、下载和重启安装流程
- Goal Loop：持久目标、自动续跑、独立校验、预算控制、暂停与恢复
- 四档执行模式与三档推理强度
- 多项目并行执行服务池，可在任务运行时切换项目继续工作
- 项目文件树、搜索、预览、Git 状态和 `@` 文件引用
- 原生 `/` Command、Skills、Agents、MCP 与 LSP 扩展中心
- 会话分支、消息回退/恢复和手动上下文压缩
- Token、任务、工具调用、活跃天数与模型占比的本地统计
- 本地自动化任务：单次、间隔、每天或每周调度，复用完整 Agent 权限/会话链并保留运行历史
- 开发预览工作台：发现项目开发脚本，管理本机服务进程、回环地址、页面刷新和实时日志

## 本地运行

要求 Node.js 22.12 或更高版本。

```bash
npm install
npm run dev
```

## CLI

在仓库内直接运行：

```bash
npm run cli -- .
npm run cli -- run "检查当前项目并修复测试"
```

注册全局 `wetocode` 命令：

```bash
npm link
wetocode .
wetocode run "检查当前项目并修复测试"
```

也可以生成并安装 CLI 包：

```bash
npm run pack:cli
npm install -g ./release/wetocode-0.2.5.tgz
wetocode --version
```

CLI 会复用 OpenCode 的 TUI、模型和会话能力，并注入与桌面版相同的中文研发安全规则。可通过 `wetocode providers` 配置认证，或使用 `OPENCODE_BIN` 指向企业审批过的引擎。

桌面集成终端使用 WetoCode 自有的交互界面，底层执行引擎不会作为用户可见品牌展示。内置“公共免费模型”不包含 WetoCode 发布者的 API Key；未登录试用额度由第三方服务按公网 IP 统计，因此同一家庭、公司或代理网络下的用户可能共享限额。用户自行添加的模型和网关使用各自保存的 API Key，互不共享。

浏览器中查看渲染层：

```bash
npm run preview
```

质量检查：

```bash
npm test
npm run lint
npm run build
npm audit
npm run smoke:electron-background
npm run smoke:electron-automation
npm run smoke:electron-preview
```

`smoke:electron-background` 会真实启动任务、关闭窗口、确认任务在后台完成，再通过第二次启动唤醒原实例并验证会话恢复。`smoke:electron-automation` 会创建计划、运行真实 Agent 并验证历史持久化；`smoke:electron-preview` 会启动真实本地 HTTP 服务并验证页面、日志和进程停止。其他 `smoke:*` 命令覆盖 Goal、并行项目、权限、PTY、终端、Worktree 和附件。

本地自动化依赖 WetoCode 进程运行：启用计划后关窗会驻留系统托盘，电脑关机或用户明确退出期间不会执行云端任务。重新启动后会补跑已到期的单次计划，并为周期计划计算新的本地时间。开发预览只允许运行经过过滤的常见开发命令，只能嵌入 `localhost`、`127.0.0.1` 等本机回环地址。

## 打包

生成当前系统的安装包：

```bash
npm run dist
```

生成 Windows x64 NSIS 安装包：

```bash
npm run dist:win
```

正式 Windows 安装包必须在 Windows 原生终端中构建。构建过程需要实际运行 NSIS 中间安装器来生成带完整自校验数据的卸载器；不得从 Linux 使用解析器拼接卸载器。`0.2.2` 及后续安装器会自动迁移使用旧打包流程生成的 `0.2.0/0.2.1` 安装。

Windows 产物为 `release/WetoCode-Setup-<版本>-x64.exe`。安装时选择的是父目录，安装器会自动追加 `WetoCode`，例如选择 `D:\Program Files` 后实际安装到 `D:\Program Files\WetoCode`；同时会创建桌面与开始菜单快捷方式。构建脚本会下载并校验真正的 Windows OpenCode 引擎，避免把 Linux 二进制误装进 Windows 包。

所有产物位于 `release/`。未签名的 Windows 开发包可以安装，但可能出现 SmartScreen 的“未知发布者”提示；正式分发前应配置 Authenticode 代码签名。当前自动更新源为 [`vitospdb/WetoCode`](https://github.com/vitospdb/WetoCode)，只有在已打包且发布源存在有效 release 时才会启用；开发模式不会访问更新源。

OpenCode 各平台二进制由 `opencode-ai` npm 包随桌面安装包分发。也可以使用 `OPENCODE_BIN` 指向企业审批过的引擎版本。

## 架构

```text
React 渲染进程
  |  受限 IPC，不持有密钥
Electron 主进程
  |-- 系统密钥环 / 本地设置
  |-- 自动更新器
  `-- OpenCode 子进程
        |-- 模型供应商或内网 LLM 网关
        `-- 当前项目文件与开发工具
```

每次运行通过 `OPENCODE_CONFIG_CONTENT` 传入临时配置；研发安全规则文件存放在 WetoCode 的用户数据目录，不修改用户项目中的 `opencode.json`。会话分享默认关闭。

模型设置支持 OpenAI Compatible、Anthropic Messages 和 Google Gemini 三种主流协议，并内置讯飞星火、百炼、智谱、DeepSeek、硅基流动、ModelScope、火山方舟、Kimi、MiniMax、OpenRouter 和 Ollama 等预设。讯飞星火使用 `https://spark-api-open.xf-yun.com/v1`，密钥栏填写控制台中的 `APIPassword`，不要填写 APPID 或 APISecret；保存前可用“测试连接”核对地址、密钥和模型 ID。

## 安全边界

WetoCode 是研发辅助工具，不代替代码评审、测试或生产变更审批。当前桌面版保护的是本机使用边界：

- 自动编辑模式仅在项目内工作，默认拦截环境密钥、项目外目录和高风险命令
- 完全控制允许项目外访问、敏感配置文件和所有本机命令，仅应在信任当前任务时启用

- 不把 API Key 写进项目、浏览器存储或对话内容
- 不默认访问项目外目录或环境密钥文件
- 删除资源、强制 Git、提权和生产编排等高风险命令在当前 CLI 模式下默认拦截
- 不将代码会话公开分享

在企业环境正式推广前，还需要接入组织身份、集中策略、终端管控、制品签名、模型网关审计和软件供应链扫描。

完整功能对照与验收口径见 [功能矩阵](./docs/FEATURE_MATRIX.md)。

## 下一阶段

1. 增加面向常见技术栈的中文研发技能包和项目模板。
2. 增加企业策略中心、操作审计导出、SSO 与模型用量配额。
3. 增加 Remote、Bot Channel 与云任务所需的账号、配对和中继服务。
4. 为开发预览增加可选的浏览器自动化驱动和截图/DOM 验收记录。
5. 建立 Windows/macOS/Linux 签名发布流水线与灰度更新通道。

## 许可证

MIT。OpenCode 及模型供应商遵循各自许可证和服务条款。
