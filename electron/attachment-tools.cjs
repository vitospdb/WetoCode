const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024
const MAX_ATTACHMENTS_BYTES = 30 * 1024 * 1024
const MIME_BY_EXTENSION = new Map([
  ['.gif', 'image/gif'], ['.jpeg', 'image/jpeg'], ['.jpg', 'image/jpeg'], ['.png', 'image/png'],
  ['.webp', 'image/webp'], ['.pdf', 'application/pdf'],
])
const DATA_MIMES = new Set([...MIME_BY_EXTENSION.values(), 'text/plain'])

function isInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function looksLikeText(buffer) {
  const sample = buffer.subarray(0, 4096)
  if (!sample.length) return true
  let controls = 0
  for (const byte of sample) {
    if (byte === 0) return false
    if (byte < 9 || (byte > 13 && byte < 32)) controls += 1
  }
  return controls / sample.length <= 0.3
}

function mimeForFile(filePath, sample) {
  return MIME_BY_EXTENSION.get(path.extname(filePath).toLowerCase()) || (looksLikeText(sample) ? 'text/plain' : undefined)
}

function readAttachmentFile(projectPath, filePath) {
  const resolved = path.resolve(filePath)
  const stat = fs.statSync(resolved)
  if (!stat.isFile()) throw new Error('只能添加普通文件。')
  if (stat.size > MAX_ATTACHMENT_BYTES) throw new Error(`附件 ${path.basename(resolved)} 超过 15 MB。`)
  const descriptor = fs.openSync(resolved, 'r')
  const sample = Buffer.alloc(Math.min(stat.size, 4096))
  try { fs.readSync(descriptor, sample, 0, sample.length, 0) } finally { fs.closeSync(descriptor) }
  const mime = mimeForFile(resolved, sample)
  if (!mime) throw new Error(`附件 ${path.basename(resolved)} 不是支持的图片、PDF 或文本文件。`)
  const common = { name: path.basename(resolved), mime, size: stat.size }
  if (isInside(projectPath, resolved)) {
    return { descriptor: { ...common, kind: 'project', relativePath: path.relative(projectPath, resolved) }, part: {
      type: 'file', mime, filename: path.basename(resolved), url: pathToFileURL(resolved).href,
      source: { type: 'file', text: { value: `@${path.relative(projectPath, resolved)}`, start: 0, end: path.relative(projectPath, resolved).length + 1 }, path: resolved },
    } }
  }
  const content = fs.readFileSync(resolved)
  return { descriptor: { ...common, kind: 'upload', previewUrl: mime.startsWith('image/') ? `data:${mime};base64,${content.toString('base64')}` : undefined }, part: {
    type: 'file', mime, filename: path.basename(resolved), url: `data:${mime};base64,${content.toString('base64')}`,
  } }
}

function readDataAttachment(input) {
  const name = path.basename(String(input?.name || 'clipboard-image.png')).slice(0, 160)
  const match = String(input?.dataUrl || '').match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/)
  if (!match || !DATA_MIMES.has(match[1])) throw new Error('只支持图片、PDF 或文本附件。')
  const content = Buffer.from(match[2], 'base64')
  if (!content.length) throw new Error('附件内容为空。')
  if (content.length > MAX_ATTACHMENT_BYTES) throw new Error(`附件 ${name} 超过 15 MB。`)
  const mime = match[1]
  return {
    descriptor: { name, mime, size: content.length, kind: 'upload', previewUrl: mime.startsWith('image/') ? `data:${mime};base64,${content.toString('base64')}` : undefined },
    part: { type: 'file', mime, filename: name, url: `data:${mime};base64,${content.toString('base64')}` },
  }
}

module.exports = { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_BYTES, isInside, looksLikeText, mimeForFile, readAttachmentFile, readDataAttachment }
