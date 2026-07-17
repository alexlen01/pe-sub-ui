/**
 * Formats an LP "size" value (AUM / NAV / Pension Assets) for display in the LP Size column
 * of the LP Master and Shadow BB tables and in the LP Record edit form.
 *
 * The value is shown AS-IS whenever it already carries any non-numeric text — an abbreviated
 * unit ("$700Mn", "240B", "2T", "$4.8 bn", "$21 bn+"), stray formatting, or a placeholder —
 * because those are the analyst-entered / extracted display strings and must not be
 * reinterpreted or re-scaled. Only a *purely numeric* value (e.g. "7650000000", "85.51",
 * "1,000,000,000", "$1000000000") is condensed into short currency form
 * (1,000,000,000 -> "$1bn"). Blank -> the em dash.
 *
 * This deliberately does the opposite of the general money formatter (which EXPANDS "$700Mn"
 * to "$700,000,000"); LP Size is the one column authorised to abbreviate.
 */
export function lpSizeFormat(value: unknown, fallback = '—'): string {
  const raw = String(value ?? '').trim()
  if (!raw || raw === fallback) return fallback

  // Strip a single leading "$" and thousands separators, then test for a pure number.
  const bare = raw.replace(/^\$/, '').replace(/,/g, '').trim()
  if (!/^-?\d+(\.\d+)?$/.test(bare)) return raw // carries units/text -> show verbatim

  const n = Number(bare)
  if (!Number.isFinite(n)) return raw
  return shortCurrency(n)
}

/** Condenses a plain dollar amount to short currency: $1,000,000,000 -> "$1bn". */
function shortCurrency(n: number): string {
  const neg = n < 0
  const abs = Math.abs(n)

  let body: number
  let suffix: string
  if (abs >= 1e12) {
    body = abs / 1e12
    suffix = 'tn'
  } else if (abs >= 1e9) {
    body = abs / 1e9
    suffix = 'bn'
  } else if (abs >= 1e6) {
    body = abs / 1e6
    suffix = 'mn'
  } else if (abs >= 1e3) {
    body = abs / 1e3
    suffix = 'k'
  } else {
    body = abs
    suffix = ''
  }

  // Up to two decimals, trailing zeros (and a bare trailing dot) trimmed.
  const digits = body.toFixed(2).replace(/\.?0+$/, '')
  return `${neg ? '-' : ''}$${digits}${suffix}`
}
