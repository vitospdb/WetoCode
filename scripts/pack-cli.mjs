#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePackage = JSON.parse(fs.readFileSync(path.join(rootDirectory, 'package.json'), 'utf8'))
const cliDirectory = path.join(rootDirectory, '.build', 'cli')
const outputDirectory = path.join(rootDirectory, 'release')

fs.rmSync(cliDirectory, { recursive: true, force: true })
fs.mkdirSync(path.join(cliDirectory, 'bin'), { recursive: true })
fs.mkdirSync(outputDirectory, { recursive: true })
fs.copyFileSync(path.join(rootDirectory, 'bin', 'wetocode.mjs'), path.join(cliDirectory, 'bin', 'wetocode.mjs'))
fs.copyFileSync(path.join(rootDirectory, 'README.md'), path.join(cliDirectory, 'README.md'))

const cliPackage = {
  name: sourcePackage.name,
  version: sourcePackage.version,
  description: `${sourcePackage.description} CLI`,
  author: sourcePackage.author,
  license: sourcePackage.license,
  type: 'module',
  bin: { wetocode: 'bin/wetocode.mjs' },
  files: ['bin/**/*', 'README.md'],
  engines: { node: '>=22.12.0' },
  dependencies: { 'opencode-ai': sourcePackage.devDependencies['opencode-ai'] },
}

fs.writeFileSync(path.join(cliDirectory, 'package.json'), `${JSON.stringify(cliPackage, null, 2)}\n`)
execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--pack-destination', outputDirectory], {
  cwd: cliDirectory,
  stdio: 'inherit',
})
