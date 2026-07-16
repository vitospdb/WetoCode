const THEMES = new Set(['system', 'light', 'dark', 'wetocode-dark', 'cloud-light', 'strawberry-cream', 'silver-minimal', 'forest-care'])
const DENSITIES = new Set(['comfortable', 'compact'])
const MIN_ZOOM = 0.8
const MAX_ZOOM = 1.4
const ZOOM_STEP = 0.05
const MIN_TERMINAL_HEIGHT = 220
const MAX_TERMINAL_HEIGHT = 1200
const MIN_TERMINAL_FONT_SIZE = 10
const MAX_TERMINAL_FONT_SIZE = 22
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

const DEFAULT_APPEARANCE = {
  theme: 'system',
  density: 'comfortable',
  zoom: 1,
  sidebarOpen: true,
  terminal: {
    height: 360,
    maximized: false,
    collapsed: false,
    fontSize: 13,
    background: '',
    foreground: '',
    cursor: '',
  },
  custom: {
    accent: '',
    background: '',
    surface: '',
    transparency: 100,
    radius: 6,
    shadow: 1,
    animations: true,
    backgroundImage: '',
  },
}

function boundedInteger(value, fallback, minimum, maximum) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(maximum, Math.max(minimum, Math.round(numeric)))
}

function colorOrEmpty(value) {
  const color = String(value || '').trim()
  return COLOR_PATTERN.test(color) ? color : ''
}

function normalizeAppearance(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const requestedZoom = Number(input.zoom)
  const zoom = Number.isFinite(requestedZoom) && requestedZoom >= MIN_ZOOM && requestedZoom <= MAX_ZOOM
    ? Math.round(requestedZoom / ZOOM_STEP) * ZOOM_STEP
    : DEFAULT_APPEARANCE.zoom
  return {
    theme: THEMES.has(input.theme) ? input.theme : DEFAULT_APPEARANCE.theme,
    density: DENSITIES.has(input.density) ? input.density : DEFAULT_APPEARANCE.density,
    zoom: Number(zoom.toFixed(2)),
    sidebarOpen: typeof input.sidebarOpen === 'boolean' ? input.sidebarOpen : DEFAULT_APPEARANCE.sidebarOpen,
    terminal: {
      height: boundedInteger(input.terminal?.height, DEFAULT_APPEARANCE.terminal.height, MIN_TERMINAL_HEIGHT, MAX_TERMINAL_HEIGHT),
      maximized: typeof input.terminal?.maximized === 'boolean' ? input.terminal.maximized : DEFAULT_APPEARANCE.terminal.maximized,
      collapsed: typeof input.terminal?.collapsed === 'boolean' ? input.terminal.collapsed : DEFAULT_APPEARANCE.terminal.collapsed,
      fontSize: boundedInteger(input.terminal?.fontSize, DEFAULT_APPEARANCE.terminal.fontSize, MIN_TERMINAL_FONT_SIZE, MAX_TERMINAL_FONT_SIZE),
      background: colorOrEmpty(input.terminal?.background),
      foreground: colorOrEmpty(input.terminal?.foreground),
      cursor: colorOrEmpty(input.terminal?.cursor),
    },
    custom: {
      accent: colorOrEmpty(input.custom?.accent),
      background: colorOrEmpty(input.custom?.background),
      surface: colorOrEmpty(input.custom?.surface),
      transparency: boundedInteger(input.custom?.transparency, DEFAULT_APPEARANCE.custom.transparency, 70, 100),
      radius: boundedInteger(input.custom?.radius, DEFAULT_APPEARANCE.custom.radius, 0, 12),
      shadow: boundedInteger(input.custom?.shadow, DEFAULT_APPEARANCE.custom.shadow, 0, 3),
      animations: typeof input.custom?.animations === 'boolean' ? input.custom.animations : DEFAULT_APPEARANCE.custom.animations,
      backgroundImage: typeof input.custom?.backgroundImage === 'string' && input.custom.backgroundImage.startsWith('file:') ? input.custom.backgroundImage.slice(0, 2048) : '',
    },
  }
}

function updateAppearance(current, patch) {
  return normalizeAppearance({ ...normalizeAppearance(current), ...(patch && typeof patch === 'object' ? patch : {}) })
}

module.exports = {
  DEFAULT_APPEARANCE,
  COLOR_PATTERN,
  MAX_TERMINAL_FONT_SIZE,
  MAX_TERMINAL_HEIGHT,
  MAX_ZOOM,
  MIN_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_HEIGHT,
  MIN_ZOOM,
  ZOOM_STEP,
  normalizeAppearance,
  updateAppearance,
}
