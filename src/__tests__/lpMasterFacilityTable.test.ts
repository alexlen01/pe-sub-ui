// @ts-expect-error This browser tsconfig omits Node typings; Vitest supplies the Node runtime.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { formatFullDate } from '../services/facilityService'

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8')

const lpMaster = () => source('../screens/LPMaster/index.tsx')

// The facility picker is a table, not a tile grid. Without jsdom this suite cannot render, so the
// guards are on the two things that silently rot: the resize-key contract (a mismatch resizes a
// phantom column, which is invisible until someone drags a header) and the Last BB Run column's
// position. Deliberately no assertions on JSX formatting.
describe('LP Master facility table', () => {
  // `fac` + an uppercase segment — the facility table's own keys, never the LP table's
  // lowercase `sortKey="facility"` column.
  const facSortKeys = () => [...lpMaster().matchAll(/sortKey="(fac[A-Z][A-Za-z]*)"/g)].map(m => m[1])

  it('keys every column width by its sort key', () => {
    // SortableHeader hands its *sortKey* to onResizeStart, so a width keyed anything else is
    // written under a name no column reads back — the drag then grows the table instead of the
    // column. Every facility sort key must therefore own an entry in FAC_COL_WIDTHS.
    const widthsBlock = lpMaster().match(/const FAC_COL_WIDTHS = \{([\s\S]*?)\}/)
    expect(widthsBlock).not.toBeNull()
    const widthKeys = [...widthsBlock![1].matchAll(/(\w+):\s*\d+/g)].map(m => m[1])

    const keys = facSortKeys()
    expect(keys.length).toBeGreaterThan(0)
    keys.forEach(key => expect(widthKeys).toContain(key))
    // Every declared width is consumed by a column, so the summed table width stays honest.
    widthKeys.filter(k => k !== 'edit').forEach(key => expect(keys).toContain(key))
  })

  it('puts Last BB Run in the final column', () => {
    const keys = facSortKeys()
    expect(keys.at(-1)).toBe('facLastRun')
    expect(lpMaster()).toContain('onResizeStart={onFacResizeStart}>Last BB Run</SortableHeader>')
  })

  it('puts the two UBS participation columns directly after Loan Amount', () => {
    const keys = facSortKeys()
    expect(keys.slice(keys.indexOf('facLoanAmount'), keys.indexOf('facLoanAmount') + 3))
      .toEqual(['facLoanAmount', 'facUbsParticipation', 'facUbsRate'])
    expect(lpMaster()).toContain('onResizeStart={onFacResizeStart}>UBS Participation</SortableHeader>')
    expect(lpMaster()).toContain('onResizeStart={onFacResizeStart}>UBS Participation Rate</SortableHeader>')
    // Both read the row fields getFacilities already derives — no second derivation in the screen.
    expect(lpMaster()).toContain('<td className="num">{f.ubsParticipation}</td>')
    expect(lpMaster()).toContain('<td className="num">{f.ubsParticipationRate}</td>')
  })

  it('fills the card width, with the summed column widths only as the floor', () => {
    expect(lpMaster()).toContain("minWidth: facVisibleWidth, width: '100%'")
  })

  it('renders Last BB Run as a date, not a relative age', () => {
    // The column is specified as a date; formatLastRun's "2d ago" form is kept only on hover.
    expect(lpMaster()).toContain('formatFullDate(f.lastRunAt)')
    expect(formatFullDate('2026-07-17T15:30:00')).toBe('Jul 17, 2026')
    expect(formatFullDate(null)).toBe('—')
  })

  it('sorts dates and counts on their underlying values', () => {
    const src = lpMaster()
    // Display strings would sort "Jun 1, 2026" alphabetically and "$2.5B" as text.
    expect(src).toContain("key: 'facMaturity',    getValue: (f: FacilityRow) => toISODate(f.maturityDate)")
    expect(src).toContain("key: 'facLastRun',     getValue: (f: FacilityRow) => f.lastRunAt ?? null")
    expect(src).toContain("key: 'facLps',         getValue: (f: FacilityRow) => f.lps ?? null")
    // "$500.0M" vs "$1.2B" sorts as text; the rate's "—" placeholder sorts as absent, not as a value.
    expect(src).toContain("key: 'facUbsParticipation', getValue: (f: FacilityRow) => parseMoneyToNumber(f.ubsParticipation)")
    expect(src).toContain("key: 'facUbsRate',     getValue: (f: FacilityRow) => percentToNumber(f.ubsParticipationRate)")
  })

  it('accents the Last BB Run date in bold blue', () => {
    const src = lpMaster()
    expect(src).toContain("const LAST_RUN_BLUE = '#2e5f91'")
    expect(src).toContain("<span style={{ fontWeight: 700, color: LAST_RUN_BLUE }}>{formatFullDate(f.lastRunAt)}</span>")
  })
})
