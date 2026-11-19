// Personalization options: layout density, font families, per-widget card
// styles, and the uploaded-wallpaper pipeline.

// Grid spacing per density (react-grid-layout row height + gutter, px).
export const DENSITIES = {
  compact: { label: 'Compact', rowHeight: 60, margin: 10 },
  cozy: { label: 'Cozy', rowHeight: 68, margin: 16 },
  comfortable: { label: 'Roomy', rowHeight: 78, margin: 22 },
}
export const densityOf = (id) => DENSITIES[id] || DENSITIES.cozy

// System font stacks only — nothing to download, works offline.
export const FONTS = {
  default: { label: 'Default', stack: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" },
  rounded: { label: 'Rounded', stack: "ui-rounded, 'SF Pro Rounded', 'Nunito', 'Varela Round', 'Quicksand', system-ui, sans-serif" },
  humanist: { label: 'Humanist', stack: "'Segoe UI', 'Optima', 'Candara', 'Noto Sans', 'Source Sans Pro', system-ui, sans-serif" },
  serif: { label: 'Serif', stack: "ui-serif, 'Iowan Old Style', 'Charter', 'Georgia', 'Cambria', 'Times New Roman', serif" },
  mono: { label: 'Mono', stack: "ui-monospace, 'SF Mono', 'Cascadia Code', 'JetBrains Mono', Menlo, Consolas, monospace" },
}
export const fontStack = (id) => (FONTS[id] || FONTS.default).stack

// The app's overall look. Light/dark comes from the theme setting on top.
export const UI_STYLES = {
  glass: { label: 'Glass', hint: 'Frosted cards on a soft glow' },
  paper: { label: 'Paper', hint: 'Editorial: paper & ink, serif headings, thin rules' },
}

// Paper's own type: bundled with the app (see main.jsx), so it works offline.
export const PAPER_FONTS = {
  sans: "'IBM Plex Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  serif: "'Newsreader', 'Iowan Old Style', 'Charter', Georgia, serif",
  mono: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
}

// The glass accents are pastels tuned for dark glass. Paper needs deeper
// shades on cream and softer ones on charcoal so accent text stays readable.
const PAPER_ACCENTS = {
  light: { indigo: '#3446c2', violet: '#6d3fc4', cyan: '#0e6f86', emerald: '#1f7a4d', amber: '#8a5a00', rose: '#b0305a', clay: '#b4410e' },
  dark: { indigo: '#9daaf2', violet: '#c2a3f2', cyan: '#7fd0e0', emerald: '#8cc79b', amber: '#e9c46a', rose: '#f2a0b6', clay: '#e8845a' },
}

export function accentColor(name, accents, uiStyle = 'glass', theme = 'dark') {
  if (uiStyle === 'paper') return PAPER_ACCENTS[theme === 'light' ? 'light' : 'dark'][name] || accents[name]
  return accents[name]
}

// "system" follows the OS; anything else is taken as-is.
export function resolveTheme(theme, prefersDark) {
  if (theme === 'system') return prefersDark ? 'dark' : 'light'
  return theme === 'light' ? 'light' : 'dark'
}

// Card looks a single widget can opt into.
export const CARD_VARIANTS = {
  glass: 'Glass',
  solid: 'Solid',
  clear: 'Clear',
  outline: 'Outline',
}

// Keep the wallpaper small enough to live in localStorage and sync: longest
// side ≤ maxSide, re-encoded as JPEG. Returns a data: URL.
export async function compressImage(file, { maxSide = 1920, quality = 0.82, maxBytes = 1_500_000 } = {}) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Please choose an image file')
  const bitmap = await createImageBitmap(file)
  let scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  let q = quality
  for (let attempt = 0; attempt < 5; attempt++) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const url = canvas.toDataURL('image/jpeg', q)
    if (url.length * 0.75 <= maxBytes) return url
    scale *= 0.8
    q = Math.max(0.6, q - 0.06)
  }
  throw new Error('That image is too large even after shrinking it')
}
