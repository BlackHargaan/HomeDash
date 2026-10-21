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
