/**
 * Rendered width of a table header label, so the grid width tables can be asserted without a
 * browser.
 *
 * Vitest runs in the `node` environment — there is no layout engine and no `measureText`, so a
 * header that overflows its own column is invisible to every other test in this suite. These
 * advances are the real Segoe UI Bold ones (GDI+, `GenericTypographic`, no kerning applied to the
 * labels in use), measured at 1000px and divided down, so `labelWidth` reproduces the browser's
 * measurement of an existing label exactly and estimates a new one to within a fraction of a pixel.
 *
 * Segoe UI is the first family in the body font stack. A machine without it renders wider or
 * narrower fallbacks, which is the usual reason to widen a column past what this returns — never a
 * reason to shrink one below it.
 */

/** Advance widths in em, code points 32–126 in order. */
const ASCII_ADVANCES = [
  0.27588, 0.32715, 0.49316, 0.59229, 0.57520, 0.86719, 0.84961, 0.29297, 0.36914, 0.36914,
  0.45508, 0.70703, 0.27100, 0.40430, 0.27100, 0.44336, 0.57520, 0.57520, 0.57520, 0.57520,
  0.57520, 0.57520, 0.57520, 0.57520, 0.57520, 0.57520, 0.27100, 0.27100, 0.70703, 0.70703,
  0.70703, 0.43799, 0.95410, 0.70313, 0.64111, 0.62402, 0.73730, 0.53223, 0.52002, 0.71094,
  0.76611, 0.31689, 0.44531, 0.64893, 0.51123, 0.95703, 0.79004, 0.75830, 0.61426, 0.75830,
  0.65283, 0.56055, 0.58594, 0.72314, 0.66699, 1.00488, 0.65527, 0.60693, 0.60693, 0.36914,
  0.43604, 0.36914, 0.70703, 0.41504, 0.31396, 0.53809, 0.62012, 0.47998, 0.61914, 0.54102,
  0.38330, 0.61914, 0.60205, 0.28418, 0.28418, 0.55908, 0.28418, 0.91602, 0.60498, 0.61133,
  0.62012, 0.61914, 0.39795, 0.43994, 0.38916, 0.60498, 0.54199, 0.79736, 0.55225, 0.53809,
  0.47900, 0.36914, 0.32617, 0.36914, 0.70703,
]

/** Non-ASCII glyphs the headers and the sort indicator actually use. */
const EXTRA_ADVANCES: Record<string, number> = {
  '‘': 0.27100, '’': 0.27100,   // curly quotes, should a label ever pick one up
  '↑': 0.47217,
  '↕': 0.57178,                       // ↕ — the unsorted indicator
  '▲': 0.86133, '▼': 0.86133,    // ▲ ▼ — the sorted indicator
}

/** The em advance of a single character; the widest ASCII glyph stands in for anything unmapped. */
function advance(ch: string): number {
  const code = ch.codePointAt(0)!
  if (code >= 32 && code <= 126) return ASCII_ADVANCES[code - 32]
  return EXTRA_ADVANCES[ch] ?? Math.max(...ASCII_ADVANCES)
}

/** Width in px of `label` set in Segoe UI Bold at `fontPx`. */
export function labelWidth(label: string, fontPx: number): number {
  return [...label].reduce((sum, ch) => sum + advance(ch), 0) * fontPx
}

/**
 * The narrowest column width that renders `label` in full.
 *
 * `.sortable-th-label` lays the text out beside the sort indicator with a 5px gap, and
 * `.sortable-th-label > span:first-child` ellipsis-truncates the text as soon as the pair no longer
 * fits. Both sit inside the th's own side padding, and `box-sizing: border-box` (index.css) puts
 * that padding inside the declared width.
 *
 * @param fontPx      12 for `.data-table`, 11 for `.data-table.dense`.
 * @param sidePadding both sides together: 36 for `.data-table`, 18 for `.dense`, 24 on the Dashboard.
 */
export function minHeaderWidth(label: string, fontPx: number, sidePadding: number): number {
  const indicator = labelWidth('▲', 9)   // the widest of ↕ ▲ ▼, at .sortable-th-indicator's 9px
  const gap = 5
  return Math.ceil(labelWidth(label, fontPx) + gap + indicator + sidePadding)
}
