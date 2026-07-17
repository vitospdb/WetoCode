import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const width = 1600
const height = 1000
const pixels = Buffer.alloc(width * height * 4)

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function blendPixel(x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height) return
  const index = (y * width + x) * 4
  const alpha = (color[3] ?? 255) / 255
  const inverse = 1 - alpha
  pixels[index] = clamp(pixels[index] * inverse + color[0] * alpha)
  pixels[index + 1] = clamp(pixels[index + 1] * inverse + color[1] * alpha)
  pixels[index + 2] = clamp(pixels[index + 2] * inverse + color[2] * alpha)
  pixels[index + 3] = 255
}

function fillRect(x, y, rectWidth, rectHeight, color) {
  const left = Math.max(0, Math.floor(x))
  const right = Math.min(width, Math.ceil(x + rectWidth))
  const top = Math.max(0, Math.floor(y))
  const bottom = Math.min(height, Math.ceil(y + rectHeight))
  for (let row = top; row < bottom; row += 1) {
    for (let column = left; column < right; column += 1) blendPixel(column, row, color)
  }
}

function ellipse(cx, cy, rx, ry, color) {
  const left = Math.floor(cx - rx)
  const right = Math.ceil(cx + rx)
  const top = Math.floor(cy - ry)
  const bottom = Math.ceil(cy + ry)
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const dx = (x - cx) / rx
      const dy = (y - cy) / ry
      if (dx * dx + dy * dy <= 1) blendPixel(x, y, color)
    }
  }
}

function line(x1, y1, x2, y2, thickness, color) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1))
  for (let step = 0; step <= steps; step += 1) {
    const ratio = steps === 0 ? 0 : step / steps
    ellipse(x1 + (x2 - x1) * ratio, y1 + (y2 - y1) * ratio, thickness / 2, thickness / 2, color)
  }
}

function roundedRect(x, y, rectWidth, rectHeight, radius, color) {
  fillRect(x + radius, y, rectWidth - radius * 2, rectHeight, color)
  fillRect(x, y + radius, rectWidth, rectHeight - radius * 2, color)
  ellipse(x + radius, y + radius, radius, radius, color)
  ellipse(x + rectWidth - radius, y + radius, radius, radius, color)
  ellipse(x + radius, y + rectHeight - radius, radius, radius, color)
  ellipse(x + rectWidth - radius, y + rectHeight - radius, radius, radius, color)
}

function heart(cx, cy, size, color) {
  ellipse(cx - size * 0.25, cy - size * 0.12, size * 0.28, size * 0.3, color)
  ellipse(cx + size * 0.25, cy - size * 0.12, size * 0.28, size * 0.3, color)
  for (let y = 0; y < size * 0.7; y += 1) {
    const halfWidth = (size * 0.55) * (1 - y / (size * 0.75))
    fillRect(cx - halfWidth, cy + y, halfWidth * 2, 1, color)
  }
}

function sparkle(cx, cy, size, color) {
  ellipse(cx, cy, size * 0.13, size * 0.13, color)
  line(cx, cy - size / 2, cx, cy + size / 2, Math.max(2, size * 0.08), color)
  line(cx - size / 2, cy, cx + size / 2, cy, Math.max(2, size * 0.08), color)
}

function strawberry(cx, cy, size, opacity = 255) {
  const red = [244, 92, 136, opacity]
  const pink = [255, 147, 176, Math.round(opacity * 0.65)]
  const seed = [255, 241, 219, opacity]
  const leaf = [95, 171, 121, opacity]
  ellipse(cx, cy + size * 0.08, size * 0.5, size * 0.58, red)
  ellipse(cx - size * 0.12, cy - size * 0.04, size * 0.24, size * 0.38, pink)
  for (const [x, y] of [[-.2, .0], [.12, -.04], [-.08, .22], [.25, .24], [.02, .43]]) ellipse(cx + x * size, cy + y * size, size * 0.035, size * 0.05, seed)
  for (const offset of [-.26, 0, .26]) line(cx, cy - size * .32, cx + offset * size, cy - size * .58, size * .09, leaf)
}

function bow(cx, cy, size, opacity = 255) {
  const light = [255, 180, 201, opacity]
  const deep = [238, 102, 144, opacity]
  ellipse(cx - size * .35, cy, size * .42, size * .27, light)
  ellipse(cx + size * .35, cy, size * .42, size * .27, light)
  ellipse(cx, cy, size * .16, size * .18, deep)
  line(cx - size * .1, cy + size * .12, cx - size * .35, cy + size * .62, size * .12, deep)
  line(cx + size * .1, cy + size * .12, cx + size * .35, cy + size * .62, size * .12, deep)
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, checksum])
}

for (let y = 0; y < height; y += 1) {
  const progress = y / (height - 1)
  const top = [255, 250, 253]
  const bottom = [255, 217, 230]
  for (let x = 0; x < width; x += 1) {
    const side = Math.abs(x / width - .5) * 2
    const wash = Math.max(0, progress * .75 - side * .13)
    blendPixel(x, y, [
      top[0] + (bottom[0] - top[0]) * wash,
      top[1] + (bottom[1] - top[1]) * wash,
      top[2] + (bottom[2] - top[2]) * wash,
      255,
    ])
  }
}

for (let x = -20; x < width + 20; x += 40) {
  const y = 46 + Math.sin(x / 40 * Math.PI) * 11
  line(x, y, x + 40, 46 + Math.sin((x + 40) / 40 * Math.PI) * 11, 2, [255, 190, 207, 180])
  ellipse(x + 20, 56, 2.5, 2.5, [255, 182, 202, 210])
}

for (const item of [[112, 170, 18], [280, 622, 15], [555, 170, 10], [785, 105, 17], [1035, 195, 13], [1265, 118, 18], [1450, 380, 12], [1500, 690, 17], [1120, 830, 15], [690, 805, 10], [180, 840, 15]]) sparkle(item[0], item[1], item[2], [255, 255, 255, 220])
for (const item of [[230, 308, 14], [515, 490, 11], [820, 186, 13], [1110, 390, 16], [1370, 610, 14], [1180, 715, 12], [340, 735, 16]]) heart(item[0], item[1], item[2], [246, 128, 159, 155])

strawberry(90, 420, 64, 245)
strawberry(166, 800, 94, 250)
strawberry(1315, 772, 112, 245)
strawberry(1510, 255, 70, 245)
strawberry(1465, 900, 82, 240)
strawberry(1100, 915, 55, 210)
bow(160, 165, 52, 240)
bow(995, 95, 74, 235)
bow(1440, 505, 92, 220)
bow(430, 865, 55, 210)

roundedRect(1170, 490, 270, 255, 46, [255, 248, 252, 95])
roundedRect(1190, 510, 230, 215, 34, [255, 235, 242, 115])
roundedRect(1240, 540, 130, 88, 22, [244, 112, 151, 180])
roundedRect(1250, 550, 110, 66, 16, [255, 227, 237, 225])
line(1305, 574, 1305, 634, 7, [255, 184, 204, 210])
line(1248, 640, 1365, 640, 12, [238, 113, 151, 180])
sparkle(1165, 553, 26, [255, 255, 255, 220])
sparkle(1425, 683, 20, [255, 255, 255, 200])

const rows = []
for (let y = 0; y < height; y += 1) rows.push(Buffer.concat([Buffer.from([0]), pixels.subarray(y * width * 4, (y + 1) * width * 4)]))
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk('IHDR', Buffer.from([0, 0, 6, 64, 0, 0, 3, 232, 8, 6, 0, 0, 0])),
  pngChunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
  pngChunk('IEND', Buffer.alloc(0)),
])

const output = resolve('src/assets/strawberry-dream-bg.png')
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, png)
console.log(`Wrote ${output}`)
