import { existsSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar')
const archive = process.argv[2] || path.resolve('release/win-unpacked/resources/app.asar')

if (!existsSync(archive)) throw new Error(`未找到待检查的安装包资源：${archive}`)

const files = asar.listPackage(archive)
const script = files.find((file) => /^\/dist\/assets\/index-.*\.js$/.test(file))
const stylesheet = files.find((file) => /^\/dist\/assets\/index-.*\.css$/.test(file))
const background = files.find((file) => /\/dist\/assets\/strawberry-dream-bg-.*\.png$/.test(file))

if (!script || !stylesheet || !background) throw new Error('安装包缺少草莓梦境的脚本、样式或背景资源。')

const application = asar.extractFile(archive, script.slice(1)).toString()
const css = asar.extractFile(archive, stylesheet.slice(1)).toString()
if (!application.includes('strawberry-dream') || !application.includes('草莓梦境') || !css.includes('strawberry-dream')) {
  throw new Error('安装包未包含草莓梦境主题逻辑。')
}

console.log(JSON.stringify({
  ok: true,
  archive,
  script,
  stylesheet,
  background,
}, null, 2))
