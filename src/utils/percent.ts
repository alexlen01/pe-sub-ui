/**
 * Percents and advance rates travel from the API as raw fractions — 0.91 means 91% — because the
 * columns behind them are NUMERIC(7,4). Formatting is the client's job, so every screen that shows
 * a rate, an advance rate, or a `pct*` field renders it through here rather than inlining `* 100`.
 *
 * Money and the concentration limits are the exception: those arrive already formatted as strings
 * ("$12,000,000", "7.5%") and must be rendered verbatim, never passed through this module.
 */

/** Fraction to a display percent: 0.91 → "91%", 0.075 → "7.5%". Null/undefined render as `dash`. */
export function formatPercent(
  fraction: number | null | undefined,
  { decimals, dash = '—' }: { decimals?: number; dash?: string } = {},
): string {
  if (fraction === null || fraction === undefined || Number.isNaN(fraction)) return dash
  const pct = fraction * 100
  // Default: show a decimal only when the value actually has one, so 0.90 reads "90%" not "90.0%".
  const places = decimals ?? (Number.isInteger(pct) ? 0 : 1)
  return `${pct.toFixed(places)}%`
}

/**
 * A user-entered percent back to the stored fraction: "91", "91%" and "0.91" all give 0.91.
 * Returns null for blank or unparseable input so the field clears rather than defaulting to zero.
 *
 * The `> 1` rescale mirrors the server's `MoneyValues.fraction`: an advance rate above 100% is not
 * representable, so a bare number greater than 1 is always percent-scaled.
 */
export function parsePercent(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null
  const cleaned = typeof input === 'number' ? input : Number(String(input).replace(/[%,\s]/g, ''))
  if (!Number.isFinite(cleaned)) return null
  return Math.abs(cleaned) > 1 ? cleaned / 100 : cleaned
}
