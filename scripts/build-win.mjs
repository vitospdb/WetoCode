import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

if (process.platform !== 'win32') {
  throw new Error('正式 Windows 安装包必须在 Windows 上构建，以保证 NSIS 卸载器完整性。请在 Windows 原生终端运行 npm run dist:win。')
}

const { Arch, build, Platform } = require('electron-builder')
const electronDist = process.env.WETOCODE_ELECTRON_DIST
const config = electronDist ? { electronDist: path.resolve(electronDist) } : {}

await build({
  targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
  config,
  publish: 'never',
})
