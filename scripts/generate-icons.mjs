import fs from 'node:fs/promises'
import path from 'node:path'
import { deflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = path.join(root, 'build')
const icoSizes = [16, 24, 32, 48, 64, 128, 256]

function crc32(buffer) {
  let value = 0xffffffff
  for (const byte of buffer) {
    value ^= byte
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (0xedb88320 & -(value & 1))
  }
  return (value ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const name = Buffer.from(type)
  const result = Buffer.alloc(12 + data.length)
  result.writeUInt32BE(data.length, 0)
  name.copy(result, 4)
  data.copy(result, 8)
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length)
  return result
}

function pointInPolygon(x, y, points) {
  let inside = false
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const [xi, yi] = points[index]
    const [xj, yj] = points[previous]
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

function roundedSquareContains(x, y, inset = 0.055, radius = 0.22) {
  const left = inset
  const right = 1 - inset
  const top = inset
  const bottom = 1 - inset
  if (x < left || x > right || y < top || y > bottom) return false
  const cornerX = x < left + radius ? left + radius : x > right - radius ? right - radius : x
  const cornerY = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y
  return Math.hypot(x - cornerX, y - cornerY) <= radius
}

function circleContains(x, y, centerX, centerY, radius) {
  return Math.hypot(x - centerX, y - centerY) <= radius
}

function rectangleContains(x, y, left, top, right, bottom) {
  return x >= left && x <= right && y >= top && y <= bottom
}

const promptMark = [
  [0.255, 0.47], [0.405, 0.60], [0.255, 0.73],
  [0.285, 0.47], [0.435, 0.60], [0.285, 0.73],
]

function drawIcon(size) {
  const scale = 4
  const sourceSize = size * scale
  const source = Buffer.alloc(sourceSize * sourceSize * 4)
  for (let y = 0; y < sourceSize; y += 1) {
    for (let x = 0; x < sourceSize; x += 1) {
      const normalizedX = (x + 0.5) / sourceSize
      const normalizedY = (y + 0.5) / sourceSize
      const offset = (y * sourceSize + x) * 4
      if (roundedSquareContains(normalizedX, normalizedY, 0.045, 0.18)) {
        const highlight = Math.max(0, 1 - normalizedY) * 10
        source[offset] = 15 + highlight
        source[offset + 1] = 25 + highlight
        source[offset + 2] = 37 + highlight
        source[offset + 3] = 255
      }
      if (roundedSquareContains(normalizedX, normalizedY, 0.135, 0.075)
        && normalizedY < 0.275
        && normalizedX > 0.18 && normalizedX < 0.82) {
        source[offset] = 58
        source[offset + 1] = 76
        source[offset + 2] = 91
        source[offset + 3] = 255
      }
      if (circleContains(normalizedX, normalizedY, 0.23, 0.205, 0.018)
        || circleContains(normalizedX, normalizedY, 0.30, 0.205, 0.018)
        || circleContains(normalizedX, normalizedY, 0.37, 0.205, 0.018)) {
        source[offset] = 88
        source[offset + 1] = 201
        source[offset + 2] = 165
        source[offset + 3] = 255
      }
      if (pointInPolygon(normalizedX, normalizedY, promptMark)
        || rectangleContains(normalizedX, normalizedY, 0.50, 0.585, 0.72, 0.625)) {
        source[offset] = 103
        source[offset + 1] = 221
        source[offset + 2] = 178
        source[offset + 3] = 255
      }
    }
  }

  const pixels = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const target = (y * size + x) * 4
      for (let channel = 0; channel < 4; channel += 1) {
        let total = 0
        for (let sampleY = 0; sampleY < scale; sampleY += 1) {
          for (let sampleX = 0; sampleX < scale; sampleX += 1) {
            total += source[(((y * scale + sampleY) * sourceSize + x * scale + sampleX) * 4) + channel]
          }
        }
        pixels[target + channel] = Math.round(total / (scale * scale))
      }
    }
  }
  return pixels
}

function encodePng(size) {
  const pixels = drawIcon(size)
  const rows = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (size * 4 + 1)
    rows[rowOffset] = 0
    pixels.copy(rows, rowOffset + 1, y * size * 4, (y + 1) * size * 4)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function encodeIco(images) {
  const directory = Buffer.alloc(6 + images.length * 16)
  directory.writeUInt16LE(0, 0)
  directory.writeUInt16LE(1, 2)
  directory.writeUInt16LE(images.length, 4)
  let offset = directory.length
  images.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16
    directory[entry] = size === 256 ? 0 : size
    directory[entry + 1] = size === 256 ? 0 : size
    directory.writeUInt16LE(1, entry + 4)
    directory.writeUInt16LE(32, entry + 6)
    directory.writeUInt32LE(data.length, entry + 8)
    directory.writeUInt32LE(offset, entry + 12)
    offset += data.length
  })
  return Buffer.concat([directory, ...images.map(({ data }) => data)])
}

await fs.mkdir(outputDirectory, { recursive: true })
const images = icoSizes.map((size) => ({ size, data: encodePng(size) }))
await fs.writeFile(path.join(outputDirectory, 'icon.ico'), encodeIco(images))
await fs.writeFile(path.join(outputDirectory, 'icon.png'), encodePng(512))
console.log('WetoCode desktop icons generated in build/icon.ico and build/icon.png')
