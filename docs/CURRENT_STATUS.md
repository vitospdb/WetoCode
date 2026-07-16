# WetoCode 当前状态

更新时间：2026-07-16（Asia/Shanghai）

## 已发布版本

- 版本：`0.2.8`
- 分支：`main`
- 提交：`21c062c0a4344e56611777e8936eaf7cbe80bff7`
- 标签：`v0.2.8`
- GitHub Release：https://github.com/vitospdb/WetoCode/releases/tag/v0.2.8

## 本次完成

- WetoCode CLI 保留真实 OpenCode TUI 和 WetoCode 品牌。
- 首页提示、命令面板、会话操作、权限对话框和常见状态使用中文固定文案。
- 修复 Windows 中文输入法无法向集成终端提交文字的问题。
- 新增右键“复制 / 粘贴”和 `Ctrl+Shift+C/V`。
- 普通项目 Shell、权限边界和终端切换保持正常。

## 本机产物

- 安装版：`/home/dev/projects/WetoCode/release/WetoCode-Setup-0.2.8-x64.exe`
- 免安装版：`/home/dev/projects/WetoCode/release/WetoCode-Portable-0.2.8-x64.zip`
- CLI 包：`/home/dev/projects/WetoCode/release/wetocode-0.2.8.tgz`
- 校验清单：`/home/dev/projects/WetoCode/release/SHA256SUMS-0.2.8.txt`

SHA-256：

- 安装版：`1ffcc96978a262bd073dcd4f2f8a764d8b31596c5fc99704a6df006c45b8c922`
- 免安装版：`57c2cc57228e135f61846de2bfd005067519442e19bb7ae7dbb749cf1fa989cb`

## 验证结果

- 单元测试：17 个测试文件、62 个用例全部通过。
- `npm run lint` 通过。
- `npm run build` 通过。
- Windows 原生构建和测试通过。
- 打包后的 `WetoCode.exe` 真实终端测试通过：中文界面、中文 IME、右键菜单、中文剪贴板粘贴、WetoCode 品牌和 Shell 切换均正常。
- GitHub Release 的 7 个附件均为公开可下载状态，安装版和免安装版下载端点返回 `200`，文件大小与本机一致。

## 下次继续

当前没有遗留的发布操作。下次优先收集 Windows 安装后的实际使用反馈；若仍有英文界面，只为明确属于 TUI 的固定长文案补充等宽翻译，避免全局替换短词而修改模型回答或代码内容。
