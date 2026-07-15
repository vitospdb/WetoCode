const { spawn } = require('node:child_process')

function startOpencodeServer({ binary, cwd, env, timeout = 15000, spawnProcess = spawn }) {
  const child = spawnProcess(binary, ['serve', '--hostname=127.0.0.1', '--port=0'], {
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
      child.removeListener('error', onError)
      child.removeListener('exit', onExit)
    }
    const fail = (error) => {
      if (settled) return
      settled = true
      cleanup()
      child.kill('SIGTERM')
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
    child.stderr.on('data', (chunk) => { output += chunk.toString() })
    child.once('error', onError)
    child.once('exit', onExit)
  })
}

function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }, 3000)
  timer.unref()
}

module.exports = { startOpencodeServer, stopChild }
