/** Aplica la paleta de marca del negocio sobre CSS variables usadas por Tailwind. */

const DEFAULT_PRIMARY = '#0F766E'

function clamp(n: number, min = 0, max = 255) {
  return Math.min(max, Math.max(min, Math.round(n)))
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '').trim()
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  if (!/^[0-9A-Fa-f]{6}$/.test(full)) return null
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((v) => clamp(v).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`
}

function toChannels(hex: string) {
  const rgb = hexToRgb(hex)
  if (!rgb) return '15 118 110'
  return `${clamp(rgb.r)} ${clamp(rgb.g)} ${clamp(rgb.b)}`
}

function mix(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
) {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  }
}

function shade(hex: string, amount: number) {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const target = amount < 0 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 }
  const m = mix(rgb, target, Math.abs(amount))
  return rgbToHex(m.r, m.g, m.b)
}

export function normalizeBrandHex(input?: string | null) {
  if (!input) return DEFAULT_PRIMARY
  let v = input.trim()
  if (!v.startsWith('#')) v = `#${v}`
  if (/^#[0-9A-Fa-f]{3}$/.test(v)) {
    v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
  }
  return /^#[0-9A-Fa-f]{6}$/.test(v) ? v.toUpperCase() : DEFAULT_PRIMARY
}

/** Inyecta --brand-* (canales RGB) en :root para Tailwind + alpha. */
export function applyBrandTheme(primary?: string | null) {
  if (typeof document === 'undefined') return
  const base = normalizeBrandHex(primary)
  const root = document.documentElement
  const map: Record<string, string> = {
    '--brand-50': toChannels(shade(base, 0.92)),
    '--brand-100': toChannels(shade(base, 0.82)),
    '--brand-200': toChannels(shade(base, 0.65)),
    '--brand-300': toChannels(shade(base, 0.45)),
    '--brand-400': toChannels(shade(base, 0.25)),
    '--brand-500': toChannels(shade(base, 0.08)),
    '--brand-600': toChannels(shade(base, -0.08)),
    '--brand-700': toChannels(base),
    '--brand-800': toChannels(shade(base, -0.22)),
    '--brand-900': toChannels(shade(base, -0.38)),
    '--brand-950': toChannels(shade(base, -0.55)),
  }
  for (const [k, v] of Object.entries(map)) {
    root.style.setProperty(k, v)
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', base)
}

export function resetBrandTheme() {
  applyBrandTheme(DEFAULT_PRIMARY)
}
