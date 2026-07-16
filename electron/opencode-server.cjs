const { spawn, spawnSync } = require('node:child_process')
const net = require('node:net')

function availableLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

function withTimeout(operation, timeout, message = '本地执行服务请求超时，请重试。') {
  let timer
  return Promise.race([
    Promise.resolve(operation),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeout)
    }),
  ]).finally(() => clearTimeout(timer))
}

async function startOpencodeServer({ binary, cwd, env, timeout = 15000, spawnProcess = spawn, getPort = availableLoopbackPort }) {
  const port = await getPort()
  const child = spawnProcess(binary, ['serve', '--hostname=127.0.0.1', `--port=${port}`], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  return new Promise((resolve, reject) => {
    let output = ''
    let settled = false
    const cleanup = () => {
      clearTimeout(timer)
      child.stdout.removeListener('data', onData)
      child.stderr.removeListener('data', onData)
      child.removeListener('error', onError)
      child.removeListener('exit', onExit)
    }
    const fail = (error) => {
      if (settled) return
      settled = true
      cleanup()
      if (process.platform !== 'win32' || !stopProcessTree(child.pid)) child.kill(process.platform === 'win32' ? 'SIGKILL' : 'SIGTERM')
      reject(error)
    }
    const onData = (chunk) => {
      output += chunk.toString()
      const match = output.match(/opencode server listening on (https?:\/\/\S+)/)
      if (!match || settled) return
      settled = true
      cleanup()
      resolve({ child, url: match[1] })
    }
    const onError = (error) => fail(error)
    const onExit = (code) => fail(new Error(`本地执行服务启动失败（代码 ${code}）。${output.trim() ? `\n${output.trim()}` : ''}`))
    const timer = setTimeout(() => fail(new Error('本地执行服务启动超时。')), timeout)

    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.once('error', onError)
    child.once('exit', onExit)
  })
}

function stopProcessTree(pid, { platform = process.platform, killProcessTree = spawnSync } = {}) {
  if (platform !== 'win32' || !Number.isInteger(pid)) return false
  const result = killProcessTree('taskkill.exe', ['/pid', String(pid), '/t', '/f'], {
    windowsHide: true,
    stdio: 'ignore',
  })
  return !result?.error && result?.status === 0
}

function waitForChildExit(child, timeout) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.removeListener('exit', onExit)
      resolve(false)
    }, timeout)
    const onExit = () => {
      clearTimeout(timer)
      resolve(true)
    }
    child.once('exit', onExit)
  })
}

async function stopChild(child, { platform = process.platform, killProcessTree = spawnSync } = {}) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return true
  if (platform === 'win32') {
    if (stopProcessTree(child.pid, { platform, killProcessTree })) return waitForChildExit(child, 3000)
    child.kill('SIGKILL')
    return waitForChildExit(child, 3000)
  }
  child.kill('SIGTERM')
  if (await waitForChildExit(child, 3000)) return true
  child.kill('SIGKILL')
  return waitForChildExit(child, 3000)
}

module.exports = { availableLoopbackPort, startOpencodeServer, stopChild, stopProcessTree, waitForChildExit, withTimeout }
