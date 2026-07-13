/** Formats a percentage value to tenths, omitting a trailing .0 for whole numbers. */
export function formatPercentageValue(value: number, fallback = '—'): string {
  if (!Number.isFinite(value)) return fallback
  const rounded = Math.round((value + Number.EPSILON) * 10) / 10
  const normalized = Object.is(rounded, -0) ? 0 : rounded
  return `${normalized.toFixed(1).replace(/\.0$/, '')}%`
}

/** Formats a decimal fraction (0.754 = 75.4%). */
export function formatPercentageFraction(value: number, fallback = '—'): string {
  return formatPercentageValue(value * 100, fallback)
}

/** Normalizes a display value such as "75.00%" to "75%". */
export function formatPercentageText(value: unknown, fallback = '—'): string {
  if (value == null || String(value).trim() === '') return fallback
  const text = String(value).trim()
  const parsed = Number.parseFloat(text.replace(/,/g, '').replace('%', ''))
  return Number.isFinite(parsed) ? formatPercentageValue(parsed, fallback) : text
}

export function formatSignedPercentageFraction(value: number, fallback = '—'): string {
  if (!Number.isFinite(value)) return fallback
  const formatted = formatPercentageFraction(Math.abs(value), fallback)
  if (formatted === fallback) return fallback
  const rounded = Math.round((value * 100 + Number.EPSILON) * 10) / 10
  if (rounded === 0) return `0%`
  return `${value < 0 ? '-' : '+'}${formatted}`
}
