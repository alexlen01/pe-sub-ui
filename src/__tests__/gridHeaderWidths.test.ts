// @ts-expect-error This browser tsconfig omits Node typings; Vitest supplies the Node runtime.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { minHeaderWidth } from './support/headerWidth'

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8')

/**
 * Guards the two ways a grid header silently loses its own name, neither of which any other test in
 * this suite can see (Vitest runs headless — there is no layout engine here):
 *
 *  1. A width declared under a key no column reads back. `SortableHeader` hands its *sortKey* to
 *     `onResizeStart`, and each header reads its width out of the same map, so a mismatch leaves the
 *     column with no width at all — `table-layout: fixed` then hands it an even slice of whatever
 *     the sized columns left over, and the drag handle writes to a phantom entry.
 *  2. A width narrower than its own header label, which `.sortable-th-label > span` truncates to an
 *     ellipsis. Long labels like "Agent Excess Concentration" are the ones that go first.
 *
 * Deliberately no assertions on column order or JSX formatting — those belong to the screens' own
 * tests.
 */

const DENSE_FONT_PX = 11    // .data-table.dense
const DENSE_PADDING = 18    // .data-table.dense th { padding: 7px 9px }
const TABLE_FONT_PX = 12    // .data-table
const TABLE_PADDING = 36    // .data-table th { padding: 8px 18px }

interface Header {
  sortKey: string
  widthKey: string
  label: string
}

/** `&amp;` and friends reach the DOM as the character they name, so measure that. */
const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#39;/g, "'")

/**
 * Every `<SortableHeader>` whose width comes from `widthRef` — the `widths` / `facWidths` / `fixedW`
 * objects, or the `w(…)` accessor the two Shadow BB heads use. Screens that render more than one
 * table are split by which accessor a header reads, so each table is checked against its own map.
 */
function headers(src: string, widthRef: string): Header[] {
  const pattern = /<SortableHeader\s+sortKey="([^"]+)"([\s\S]*?)>([\s\S]*?)<\/SortableHeader>/g
  const widthPattern = widthRef === 'w'
    ? /width:\s*w\('(\w+)'\)/
    : new RegExp(`width:\\s*${widthRef}\\.(\\w+)`)

  return [...src.matchAll(pattern)].flatMap(([, sortKey, attrs, label]) => {
    const width = attrs.match(widthPattern)
    return width ? [{ sortKey, widthKey: width[1], label: decodeEntities(label).trim() }] : []
  })
}

/** The `{ key: 123, … }` literal captured by `pattern`'s first group. */
function widthMap(src: string, pattern: RegExp): Record<string, number> {
  const body = src.match(pattern)
  expect(body, `no width map matching ${pattern}`).not.toBeNull()
  return Object.fromEntries(
    [...body![1].matchAll(/(\w+):\s*(\d+)/g)].map(([, key, value]) => [key, Number(value)]),
  )
}

function expectKeyedBySortKey(cols: Header[], widths: Record<string, number>, ignored: string[] = []) {
  expect(cols.length).toBeGreaterThan(0)
  // Every column owns a width...
  cols.forEach(col => {
    expect(col.widthKey, `${col.label} reads a width keyed off its sortKey`).toBe(col.sortKey)
    expect(Object.keys(widths), `${col.label} has a declared width`).toContain(col.sortKey)
  })
  // ...and every declared width belongs to a column, so the summed table width stays honest.
  Object.keys(widths)
    .filter(key => !ignored.includes(key))
    .forEach(key => expect(cols.map(c => c.sortKey), `${key} is consumed by a column`).toContain(key))
}

function expectFitsLabel(cols: Header[], widths: Record<string, number>, fontPx: number, padding: number) {
  expect(cols.length).toBeGreaterThan(0)
  cols.forEach(col => {
    const needed = minHeaderWidth(col.label, fontPx, padding)
    expect(widths[col.sortKey], `"${col.label}" needs ${needed}px to render in full`)
      .toBeGreaterThanOrEqual(needed)
  })
}

describe('LP Records grid (LP Master screen)', () => {
  const src = source('../screens/LPMaster/index.tsx')
  // The LP table reads `widths`; the facility picker above it reads `facWidths`.
  const cols = headers(src, 'widths')
  const widths = widthMap(src, /useColumnResize\('lp-master-v\d+',\s*\{([^{}]*)\}/)

  it('keys every column width by its sort key', () => expectKeyedBySortKey(cols, widths))
  it('gives every header room for its label', () => expectFitsLabel(cols, widths, DENSE_FONT_PX, DENSE_PADDING))
})

describe('Facility picker grid (LP Master screen)', () => {
  const src = source('../screens/LPMaster/index.tsx')
  const cols = headers(src, 'facWidths')
  // `edit` is a button column with no header, so it is exempt from the "consumed by a column" half.
  const widths = widthMap(src, /const FAC_COL_WIDTHS = \{([^{}]*)\}/)

  it('keys every column width by its sort key', () => expectKeyedBySortKey(cols, widths, ['edit']))
  it('gives every header room for its label', () => expectFitsLabel(cols, widths, DENSE_FONT_PX, DENSE_PADDING))
})

describe('LP Master records grid', () => {
  const src = source('../screens/LPMasterRecords/index.tsx')
  const cols = headers(src, 'widths')
  const widths = widthMap(src, /useColumnResize\('lp-master-records-v\d+',\s*\{([^{}]*)\}/)

  it('keys every column width by its sort key', () => expectKeyedBySortKey(cols, widths))
  it('gives every header room for its label', () => expectFitsLabel(cols, widths, DENSE_FONT_PX, DENSE_PADDING))
})

describe('Shadow BB results grid', () => {
  const src = source('../screens/ShadowBB/index.tsx')
  const cols = headers(src, 'w')
  const widths = widthMap(src, /const SHADOW_RESULTS_INITIAL_WIDTHS: ColWidths = \{([^{}]*)\}/)

  it('keys every column width by its sort key', () => expectKeyedBySortKey(cols, widths))
  it('gives every header room for its label', () => expectFitsLabel(cols, widths, DENSE_FONT_PX, DENSE_PADDING))
})

describe('Run Shadow BB grid', () => {
  const src = source('../screens/RunShadowBB/index.tsx')
  const cols = headers(src, 'w')
  const widths = widthMap(src, /const SHADOW_BB_INITIAL_WIDTHS: ColWidths = \{([^{}]*)\}/)

  it('keys every column width by its sort key', () => expectKeyedBySortKey(cols, widths))
  it('gives every header room for its label', () => expectFitsLabel(cols, widths, DENSE_FONT_PX, DENSE_PADDING))
})

describe('Audit trail grid', () => {
  const src = source('../screens/AuditTrail/index.tsx')
  const cols = headers(src, 'widths')
  const widths = widthMap(src, /const AUDIT_TRAIL_INITIAL_WIDTHS: ColWidths = \{([^{}]*)\}/)

  it('keys every column width by its sort key', () => expectKeyedBySortKey(cols, widths))
  it('gives every header room for its label', () => expectFitsLabel(cols, widths, TABLE_FONT_PX, TABLE_PADDING))
})

describe('Extraction preview grid', () => {
  // Columns are built from CANONICAL_GRID_META rather than written out as JSX, so the label is the
  // entry's own `label` where it overrides the canonical field name, and the canonical name itself
  // otherwise. Widths are px on a plain `.data-table`.
  // Bounded at the literal's closing brace — DETAIL_FIELD_DEFS below it has the same entry shape
  // but carries no widths.
  const src = source('../screens/ExtractionPreview/index.tsx')
  const start = src.indexOf('const CANONICAL_GRID_META')
  const block = src.slice(start, src.indexOf('\n}\n', start))
  const entries = [...block.matchAll(/^ {2}("[^"]+"|'[^']+'|\w+):\s*\{(.+)\},$/gm)]

  it('gives every header room for its label', () => {
    expect(entries.length).toBeGreaterThan(30)
    entries.forEach(([, key, body]) => {
      const canonical = key.replace(/^["']|["']$/g, '')
      const label = body.match(/label:\s*'([^']*)'/)?.[1] ?? canonical
      const width = Number(body.match(/width:\s*(\d+)/)?.[1])
      const needed = minHeaderWidth(label, TABLE_FONT_PX, TABLE_PADDING)
      expect(width, `"${label}" needs ${needed}px to render in full`).toBeGreaterThanOrEqual(needed)
    })
  })
})

describe('Match queue grid', () => {
  // Three of the columns take a percentage share of whatever the fixed ones leave, so the header
  // that has to fit is the longest of them at the table's narrowest — NAME_COLS * MIN_NAME_COL_PX,
  // divided by the declared shares.
  const src = source('../screens/MatchQueue/index.tsx')
  const cols = headers(src, 'fixedW')
  const fixed = widthMap(src, /useColumnResize\('match-queue-fixed-v\d+',\s*\{([^{}]*)\}/)
  const shares = widthMap(src, /useColumnResize\('match-queue-flex-v\d+',\s*\{([^{}]*)\}/)
  const nameCols = Number(src.match(/const NAME_COLS = (\d+)/)![1])
  const minNameCol = Number(src.match(/const MIN_NAME_COL_PX = (\d+)/)![1])

  it('gives every bounded-content header room for its label', () => {
    expectFitsLabel(cols, fixed, TABLE_FONT_PX, TABLE_PADDING)
  })

  it('gives every name header room for its label at the table floor', () => {
    const floor = nameCols * minNameCol
    const labels: Record<string, string> = {
      agentName: 'Agent LPRecord Name',
      masterName: 'Matched LP Master Record',
      ultimateParent: 'Ultimate Parent (To Be Applied)',
    }
    expect(Object.keys(shares).sort()).toEqual(Object.keys(labels).sort())
    Object.entries(shares).forEach(([key, share]) => {
      const label = labels[key]
      expect(src, `"${label}" is still the ${key} header`).toContain(`>${label}<`)
      const needed = minHeaderWidth(label, TABLE_FONT_PX, TABLE_PADDING)
      expect(Math.floor(floor * share / 100), `"${label}" needs ${needed}px at the table floor`)
        .toBeGreaterThanOrEqual(needed)
    })
  })
})

describe('Dashboard facility grid', () => {
  // Percentage shares of the table width, floored at DASHBOARD_MIN_TABLE_PX — below that the
  // wrapper scrolls rather than squeezing the headers. `.dashboard-screen` overrides the side
  // padding to 12px each side.
  const DASHBOARD_PADDING = 24
  const src = source('../screens/Dashboard/index.tsx')
  const shares = widthMap(src, /const DASHBOARD_INITIAL_WIDTHS = \{([^{}]*)\}/)
  const floor = Number(src.match(/const DASHBOARD_MIN_TABLE_PX = (\d+)/)![1])
  const labels = Object.fromEntries(
    [...src.matchAll(/key:\s*'(\w+)',\s*[\s\S]{0,40}?label:\s*'([^']+)'/g)].map(m => [m[1], m[2]]),
  )

  it('shares out the full table width', () => {
    expect(Object.values(shares).reduce((sum, s) => sum + s, 0)).toBe(100)
  })

  it('gives every header room for its label at the table floor', () => {
    expect(Object.keys(shares).length).toBeGreaterThan(0)
    Object.entries(shares).forEach(([key, share]) => {
      const label = labels[key]
      expect(label, `${key} has a column label`).toBeDefined()
      const needed = minHeaderWidth(label, TABLE_FONT_PX, DASHBOARD_PADDING)
      expect(Math.floor(floor * share / 100), `"${label}" needs ${needed}px at the table floor`)
        .toBeGreaterThanOrEqual(needed)
    })
  })
})
