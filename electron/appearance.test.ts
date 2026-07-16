import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { normalizeAppearance, updateAppearance } = require('./appearance.cjs')

describe('appearance settings', () => {
  it('uses stable defaults for missing or invalid values', () => {
    expect(normalizeAppearance({ theme: 'neon', density: 'tiny', zoom: 4, sidebarOpen: 'yes' })).toEqual({
      theme: 'system', density: 'comfortable', zoom: 1, sidebarOpen: true,
      terminal: { height: 360, maximized: false, collapsed: false, fontSize: 13, background: '', foreground: '', cursor: '' },
      custom: { accent: '', background: '', surface: '', transparency: 100, radius: 6, shadow: 1, animations: true, backgroundImage: '' },
    })
  })

  it('accepts and rounds zoom values across the slider range', () => {
    expect(normalizeAppearance({ theme: 'dark', density: 'compact', zoom: 1.17, sidebarOpen: false })).toEqual({
      theme: 'dark', density: 'compact', zoom: 1.15, sidebarOpen: false,
      terminal: { height: 360, maximized: false, collapsed: false, fontSize: 13, background: '', foreground: '', cursor: '' },
      custom: { accent: '', background: '', surface: '', transparency: 100, radius: 6, shadow: 1, animations: true, backgroundImage: '' },
    })
    expect(normalizeAppearance({ zoom: 0.8 }).zoom).toBe(0.8)
    expect(normalizeAppearance({ zoom: 1.4 }).zoom).toBe(1.4)
  })

  it('updates one preference without resetting the others', () => {
    expect(updateAppearance({ theme: 'dark', density: 'compact', zoom: 0.9, sidebarOpen: false }, { zoom: 1.25 })).toEqual({
      theme: 'dark', density: 'compact', zoom: 1.25, sidebarOpen: false,
      terminal: { height: 360, maximized: false, collapsed: false, fontSize: 13, background: '', foreground: '', cursor: '' },
      custom: { accent: '', background: '', surface: '', transparency: 100, radius: 6, shadow: 1, animations: true, backgroundImage: '' },
    })
  })

  it('persists bounded terminal workspace preferences', () => {
    expect(normalizeAppearance({ terminal: { height: 9999, maximized: true, collapsed: true, fontSize: 2 } }).terminal)
      .toMatchObject({ height: 1200, maximized: true, collapsed: true, fontSize: 10 })
  })

  it('accepts the original WetoCode theme presets', () => {
    for (const theme of ['wetocode-dark', 'cloud-light', 'strawberry-cream', 'silver-minimal', 'forest-care']) {
      expect(normalizeAppearance({ theme }).theme).toBe(theme)
    }
  })

  it('normalizes custom appearance values and rejects unsafe colors or image URLs', () => {
    expect(normalizeAppearance({ custom: { accent: '#ef7188', background: 'red', transparency: 9, backgroundImage: 'https://example.com/x.png' }, terminal: { background: '#202020' } }))
      .toMatchObject({ custom: { accent: '#ef7188', background: '', transparency: 70, backgroundImage: '' }, terminal: { background: '#202020' } })
  })
})
