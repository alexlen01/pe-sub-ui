// Generates public/Agent-BB-Sample-May-2026.xlsx
// Imports EXTRACTED_LPS so the file matches the Review Extraction screen exactly.
// Run: npx tsx scripts/generate-agent-bb.ts

import { EXTRACTED_LPS } from '../src/data/extractionData'
import xlsx              from 'xlsx'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { mkdirSync }     from 'fs'

const __dir = dirname(fileURLToPath(import.meta.url))
const OUT   = join(__dir, '../public/Agent-BB-Sample-May-2026.xlsx')
mkdirSync(join(__dir, '../public'), { recursive: true })

function parseMoney(s: string | undefined | null): number | null {
  if (!s || s === 'N/E' || s === 'N/A') return null
  const m = String(s).match(/\$?([\d,]+)/)
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : null
}

const totalAgentBB = EXTRACTED_LPS.reduce((sum, lp) => {
  const u = parseMoney(lp.uncalled) ?? 0
  const r = parseFloat(lp.agentRate) / 100 || 0
  return sum + u * r
}, 0)

const totalCommit   = EXTRACTED_LPS.reduce((s, lp) => s + (parseMoney(lp.commit)   ?? 0), 0)
const totalUncalled = EXTRACTED_LPS.reduce((s, lp) => s + (parseMoney(lp.uncalled) ?? 0), 0)

const COLS = [
  'Investor Name (Agent Records)',
  'LP Classification',
  'Commitment (USD)',
  'Uncalled Capital (USD)',
  'AUM',
  'S&P',
  "Moody's",
  'Advance Rate',
  'Concentration Limit',
  '% Called',
  '% of Borrowing Base',
]

const dataRows = EXTRACTED_LPS.map(lp => {
  const commit    = parseMoney(lp.commit)
  const uncalled  = parseMoney(lp.uncalled)
  const called    = commit != null && uncalled != null ? commit - uncalled : null
  const pctCalled = commit && called != null ? called / commit : null
  const advRate   = parseFloat(lp.agentRate) / 100 || null
  const agentBB   = advRate && uncalled ? uncalled * advRate : null
  const pctOfBB   = agentBB && totalAgentBB ? agentBB / totalAgentBB : null
  return [lp.name, lp.agentClass, commit, uncalled, lp.aum, lp.sp, lp.moodys, lp.agentRate, lp.agentConc, pctCalled, pctOfBB]
})

const totalsRow = [
  `Total — ${EXTRACTED_LPS.length} LPs`, '', totalCommit, totalUncalled,
  '', '', '', '', '', null, totalAgentBB > 0 ? 1.0 : null,
]

const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

const headerBlock = [
  ['PE Sub Platform — Sample Agent Borrowing Base', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', '', '', ''],
  ['Facility',   '(select in Upload screen)',  '', '', 'Agent Bank',  '(select in Upload screen)', '', '', '', '', ''],
  ['As Of Date', today,                        '', '', 'Prepared By', 'Agent Bank Prime Services', '', '', '', '', ''],
  ['Currency',   'USD',                        '', '', 'File Date',   today,                       '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', '', '', ''],
]

const sheetData = [...headerBlock, COLS, ...dataRows, totalsRow]

const ws = xlsx.utils.aoa_to_sheet(sheetData)

const dataStart = headerBlock.length + 1
const dataEnd   = dataStart + dataRows.length

for (let r = dataStart; r <= dataEnd; r++) {
  const addr = (col: number) => xlsx.utils.encode_cell({ r, c: col })
  for (const c of [2, 3]) {
    const cell = ws[addr(c)]
    if (cell && typeof cell.v === 'number') cell.z = '$#,##0'
  }
  for (const c of [9, 10]) {
    const cell = ws[addr(c)]
    if (cell && typeof cell.v === 'number') cell.z = '0.00%'
  }
}

ws['!cols'] = [
  { wch: 44 }, { wch: 24 }, { wch: 18 }, { wch: 20 }, { wch: 10 },
  { wch:  6 }, { wch:  9 }, { wch: 13 }, { wch: 19 }, { wch: 10 }, { wch: 19 },
]
ws['!freeze'] = { xSplit: 0, ySplit: 7 }

const wb = xlsx.utils.book_new()
xlsx.utils.book_append_sheet(wb, ws, 'Borrowing Base')
xlsx.writeFile(wb, OUT)

console.log(`Written: ${OUT}`)
console.log(`  ${dataRows.length} LP rows + 1 totals row`)
console.log(`  Total Commitment : $${totalCommit.toLocaleString()}`)
console.log(`  Total Uncalled   : $${totalUncalled.toLocaleString()}`)
console.log(`  Total Agent BB   : $${Math.round(totalAgentBB).toLocaleString()}`)
