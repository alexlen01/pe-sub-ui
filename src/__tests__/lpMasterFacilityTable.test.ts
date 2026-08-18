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

  it('puts UBS Participation directly after Loan Amount, with no rate column', () => {
    const keys = facSortKeys()
    expect(keys.slice(keys.indexOf('facLoanAmount'), keys.indexOf('facLoanAmount') + 2))
      .toEqual(['facLoanAmount', 'facUbsParticipation'])
    expect(lpMaster()).toContain('onResizeStart={onFacResizeStart}>UBS Participation</SortableHeader>')
    // Reads the row field getFacilities already derives — no second derivation in the screen.
    expect(lpMaster()).toContain('<td className="num">{f.ubsParticipation}</td>')
    // The rate is an edit-overlay field only; it was dropped from the table.
    expect(lpMaster()).not.toContain('UBS Participation Rate</SortableHeader>')
    expect(lpMaster()).not.toContain('<td className="num">{f.ubsParticipationRate}</td>')
  })

  it('draws the facility name cell as a folder tab, not a hyperlink', () => {
    // The row opens the edit overlay, so the name cell has to advertise its own target. It does
    // that as a folder tab, never a link underline. The tab must stay a nested span: .data-table
    // sets border-collapse: collapse, under which a td ignores border-radius outright.
    const src = lpMaster()
    expect(src).toContain('<span className="folder-tab">{f.name}</span>')
    expect(src).toContain('className="drill-cell folder-tab-wrap"')
    expect(src).not.toContain("textDecoration: 'underline'")
    const css = source('../index.css')
    expect(css).toContain('.folder-tab {')
    // The lip hangs off the wrapper, so the cell must carry both classes to get one.
    expect(css).toContain('.folder-tab-wrap::before {')
  })

  it('keeps the open facility wearing a highlighted tab on the LP records screen', () => {
    // Same tab, held lit: the folder you clicked in the picker is the folder you are inside.
    const src = lpMaster()
    expect(src).toContain('<span className="folder-tab folder-tab-open" title={facFilter.name}>{facFilter.name}</span>')
    // "All Facilities" is no single folder — it must stay plain text.
    expect(src).toContain(">All Facilities</span>")
    const css = source('../index.css')
    expect(css).toContain('.folder-tab-open {')
    // The open tab is a label, not a drill target.
    expect(css).toContain('.folder-tab-open::after { content: none; }')
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
    // "$500.0M" vs "$1.2B" sorts as text, so participation sorts on the parsed dollar amount.
    expect(src).toContain("key: 'facUbsParticipation', getValue: (f: FacilityRow) => parseMoneyToNumber(f.ubsParticipation)")
  })

  it('accents the Last BB Run date in bold blue', () => {
    const src = lpMaster()
    expect(src).toContain("const LAST_RUN_BLUE = '#2e5f91'")
    expect(src).toContain("<span style={{ fontWeight: 700, color: LAST_RUN_BLUE }}>{formatFullDate(f.lastRunAt)}</span>")
  })
})
