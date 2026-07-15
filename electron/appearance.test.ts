import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { normalizeAppearance, updateAppearance } = require('./appearance.cjs')

describe('appearance settings', () => {
  it('uses stable defaults for missing or invalid values', () => {
    expect(normalizeAppearance({ theme: 'neon', density: 'tiny', zoom: 4, sidebarOpen: 'yes' })).toEqual({
      theme: 'system', density: 'comfortable', zoom: 1, sidebarOpen: true,
    })
  })

  it('accepts and rounds zoom values across the slider range', () => {
    expect(normalizeAppearance({ theme: 'dark', density: 'compact', zoom: 1.17, sidebarOpen: false })).toEqual({
      theme: 'dark', density: 'compact', zoom: 1.15, sidebarOpen: false,
    })
    expect(normalizeAppearance({ zoom: 0.8 }).zoom).toBe(0.8)
    expect(normalizeAppearance({ zoom: 1.4 }).zoom).toBe(1.4)
  })

  it('updates one preference without resetting the others', () => {
    expect(updateAppearance({ theme: 'dark', density: 'compact', zoom: 0.9, sidebarOpen: false }, { zoom: 1.25 })).toEqual({
      theme: 'dark', density: 'compact', zoom: 1.25, sidebarOpen: false,
    })
  })
})
