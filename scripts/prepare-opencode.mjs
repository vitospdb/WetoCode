#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const targetPlatform = process.argv[2] || process.platform
const targetArch = process.argv[3] || process.arch
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDirectory, 'node_modules', 'opencode-ai', 'package.json'), 'utf8'))

const packages = {
  'win32-x64': 'opencode-windows-x64-baseline',
  'win32-arm64': 'opencode-windows-arm64',
  'linux-x64': 'opencode-linux-x64-baseline',
  'linux-arm64': 'opencode-linux-arm64',
  'darwin-x64': 'opencode-darwin-x64-baseline',
  'darwin-arm64': 'opencode-darwin-arm64',
}

const target = `${targetPlatform}-${targetArch}`
const packageName = packages[target]
if (!packageName) {
  throw new Error(`不支持的 OpenCode 目标平台：${target}`)
}

const version = packageJson.optionalDependencies?.[packageName]
if (!version) {
  throw new Error(`opencode-ai 未声明 ${packageName} 依赖。`)
}

const destinationDirectory = path.join(rootDirectory, '.build', 'opencode', target)
const destination = path.join(destinationDirectory, 'opencode.exe')
const expectedMagic = targetPlatform === 'win32' ? Buffer.from('MZ') : Buffer.from([0x7f, 0x45, 0x4c, 0x46])

function hasExpectedFormat(file) {
  if (!fs.existsSync(file)) return false
  const descriptor = fs.openSync(file, 'r')
  try {
    const header = Buffer.alloc(expectedMagic.length)
    fs.readSync(descriptor, header, 0, header.length, 0)
    return header.equals(expectedMagic)
  } finally {
    fs.closeSync(descriptor)
  }
}

if (hasExpectedFormat(destination)) {
  console.log(`OpenCode ${target} 引擎已就绪：${path.relative(rootDirectory, destination)}`)
  process.exit(0)
}

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'wetocode-opencode-'))
try {
  const npmExecPath = process.env.npm_execpath
  const npmCommand = npmExecPath ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm')
  const npmArgs = npmExecPath
    ? [npmExecPath, 'pack', `${packageName}@${version}`, '--silent']
    : ['pack', `${packageName}@${version}`, '--silent']
  const archiveName = execFileSync(npmCommand, npmArgs, {
    cwd: tempDirectory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim().split(/\r?\n/).at(-1)

  if (!archiveName) throw new Error(`无法下载 ${packageName}@${version}。`)
  execFileSync('tar', ['-xzf', path.join(tempDirectory, archiveName)], { cwd: tempDirectory, stdio: 'inherit' })

  const sourceName = targetPlatform === 'win32' ? 'opencode.exe' : 'opencode'
  const source = path.join(tempDirectory, 'package', 'bin', sourceName)
  if (!hasExpectedFormat(source)) {
    throw new Error(`${packageName}@${version} 中的引擎格式与 ${target} 不匹配。`)
  }

  fs.mkdirSync(destinationDirectory, { recursive: true })
  fs.copyFileSync(source, destination)
  fs.chmodSync(destination, 0o755)
  console.log(`已准备 OpenCode ${version} ${target} 引擎：${path.relative(rootDirectory, destination)}`)
} finally {
  fs.rmSync(tempDirectory, { recursive: true, force: true })
}
