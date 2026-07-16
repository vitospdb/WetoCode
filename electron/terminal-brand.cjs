const UPSTREAM_NAME = /opencode/gi

function brandText(value) {
  return value.replace(UPSTREAM_NAME, 'WetoCode')
}

function possibleNameSuffix(value) {
  const name = 'opencode'
  const lower = value.toLowerCase()
  for (let length = Math.min(name.length - 1, value.length); length > 0; length -= 1) {
    if (lower.endsWith(name.slice(0, length))) return length
  }
  return value.endsWith('\x1b') ? 1 : 0
}

function createTerminalBrandFilter() {
  let pending = ''

  function write(value, final = false) {
    pending += String(value || '')
    let output = ''
    let offset = 0

    while (offset < pending.length) {
      const titleStart = pending.indexOf('\x1b]', offset)
      if (titleStart < 0) {
        const rest = pending.slice(offset)
        const keep = final ? 0 : possibleNameSuffix(rest)
        output += brandText(keep ? rest.slice(0, -keep) : rest)
        offset = pending.length - keep
        break
      }

      output += brandText(pending.slice(offset, titleStart))
      const bel = pending.indexOf('\x07', titleStart + 2)
      const st = pending.indexOf('\x1b\\', titleStart + 2)
      const titleEnd = bel < 0 ? st : st < 0 ? bel : Math.min(bel, st)
      if (titleEnd < 0 && !final) {
        offset = titleStart
        break
      }
      if (titleEnd < 0) {
        output += brandText(pending.slice(titleStart))
        offset = pending.length
        break
      }
      output += '\x1b]0;WetoCode\x07'
      offset = titleEnd + (titleEnd === st ? 2 : 1)
    }

    pending = pending.slice(offset)
    return output
  }

  return {
    write: (value) => write(value),
    flush: () => write('', true),
  }
}

function brandTerminalOutput(value) {
  const filter = createTerminalBrandFilter()
  return filter.write(value) + filter.flush()
}

module.exports = { brandTerminalOutput, createTerminalBrandFilter }
