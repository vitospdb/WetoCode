const THEMES = new Set(['system', 'light', 'dark'])
const DENSITIES = new Set(['comfortable', 'compact'])
const MIN_ZOOM = 0.8
const MAX_ZOOM = 1.4
const ZOOM_STEP = 0.05

const DEFAULT_APPEARANCE = {
  theme: 'system',
  density: 'comfortable',
  zoom: 1,
  sidebarOpen: true,
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
  }
}

function updateAppearance(current, patch) {
  return normalizeAppearance({ ...normalizeAppearance(current), ...(patch && typeof patch === 'object' ? patch : {}) })
}

module.exports = { DEFAULT_APPEARANCE, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, normalizeAppearance, updateAppearance }
