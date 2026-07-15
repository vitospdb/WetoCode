import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { isInside, looksLikeText, readAttachmentFile, readDataAttachment } = require('./attachment-tools.cjs')
const temporary: string[] = []
afterEach(() => temporary.splice(0).forEach((item) => fs.rmSync(item, { recursive: true, force: true })))

describe('attachment security', () => {
  it('keeps project files as file URLs without embedding their contents', () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'wetocode-attachment-'))
    temporary.push(project)
    const file = path.join(project, 'source.ts')
    fs.writeFileSync(file, 'export const value = 1\n')
    const attachment = readAttachmentFile(project, file)
    expect(attachment.descriptor).toMatchObject({ kind: 'project', relativePath: 'source.ts', mime: 'text/plain' })
    expect(attachment.part.url).toBe(pathToFileURL(file).href)
    expect(attachment.descriptor.previewUrl).toBeUndefined()
  })

  it('rejects unsupported binary data and detects path boundaries', () => {
    expect(looksLikeText(Buffer.from([0, 1, 2, 3]))).toBe(false)
    expect(isInside('/repo', '/repo/src/a.ts')).toBe(true)
    expect(isInside('/repo', '/repo-other/a.ts')).toBe(false)
    expect(() => readDataAttachment({ name: 'app.bin', dataUrl: 'data:application/octet-stream;base64,AAEC' })).toThrow(/只支持/)
  })

  it('normalizes pasted images into bounded data attachments', () => {
    const attachment = readDataAttachment({ name: '../shot.png', dataUrl: 'data:image/png;base64,aGVsbG8=' })
    expect(attachment.descriptor).toMatchObject({ name: 'shot.png', mime: 'image/png', size: 5, kind: 'upload' })
    expect(attachment.part.url).toBe('data:image/png;base64,aGVsbG8=')
  })
})
