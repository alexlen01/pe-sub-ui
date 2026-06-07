import { LP_DATA } from './lpData'
import { NEW_LP_NAMES } from './matchQueueData'

function agentName(name: string, score: number, rng: () => number): string {
  if (score >= 95) {
    const variants = [
      name.replace(' Corporation', ' Corp.').replace(' Company', ' Co.').replace(' Limited', ' Ltd.').replace(' Management', ' Mgmt').replace(' Investment', ' Inv.'),
      name.replace('& ', '').replace(' and ', ' & '),
      name,
    ]
    return variants[Math.floor(rng() * variants.length)]
  }
  if (score >= 80) {
    return name
      .replace(' Corporation', ' Corp').replace(' Company', ' Co').replace(' Limited', ' Ltd')
      .replace(' Management', ' Mgmt').replace(' Investment', ' Inv').replace(' Pension Plan', ' Pension')
      .replace(' Retirement System', ' Ret. Sys.').replace(' Retirement', ' Ret.')
      .replace('Public Employees', 'Public Emp.').replace("Teachers'", 'Teachers')
  }
  const words = name.split(' ')
  return words.slice(0, Math.max(2, Math.floor(words.length * 0.6))).join(' ')
}

function lpType(lp: (typeof LP_DATA)[0]): string {
  const n = lp.name.toLowerCase()
  if (n.includes('pension') || n.includes('retirement') || n.includes('teachers') || n.includes('retirees')) return 'Pension Fund'
  if (n.includes('authority') || n.includes('norges') || n.includes('mubadala') || n.includes('temasek') || n.includes('gic special') || n.includes('investment corp')) return 'Sovereign Wealth Fund'
  if (n.includes('endowment') || n.includes('university') || n.includes('college') || n.includes('foundation') || n.includes('institute')) return 'Endowment'
  if (n.includes('family') || n.includes('rockefeller') || n.includes('heritage')) return 'Family Office'
  if (n.includes('hamilton lane') || n.includes('pantheon') || n.includes('stepstone') || n.includes('harbourvest')) return 'Fund of Funds'
  if (lp.type === 'HNW') return 'Family Office'
  if (lp.cls === 'Excluded') return 'Investment Consultant'
  return 'Pension Fund'
}

function fmtM(s: string): string {
  const m = (s || '').match(/\$([0-9.]+)([BMTKbmtk]?)/)
  if (!m) return s || ''
  const n = parseFloat(m[1])
  const mult: Record<string, number> = { B: 1e9, M: 1e6, T: 1e12, K: 1e3, '': 1 }
  return '$' + Math.round(n * (mult[m[2].toUpperCase()] ?? 1)).toLocaleString('en-US')
}

function parseShortM(s: string): number {
  const m = (s || '').match(/\$([0-9.]+)([BMTKbmtk]?)/)
  if (!m) return 0
  const n = parseFloat(m[1])
  const mult: Record<string, number> = { B: 1e9, M: 1e6, T: 1e12, K: 1e3, '': 1 }
  return n * (mult[m[2].toUpperCase()] ?? 1)
}

function buildExtractedLPs() {
  let _s = 0xdeadbeef
  const rng = () => { _s = (Math.imul(1664525, _s) + 1013904223) | 0; return (_s >>> 0) / 0x100000000 }
  const result = []
  let id = 1
  const lps = [...LP_DATA]
  for (let i = lps.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [lps[i], lps[j]] = [lps[j], lps[i]] }
  lps.slice(0, 765).forEach((lp, i) => {
    rng()
    let score: number
    if (i < 617) score = 95 + Math.floor(rng() * 5)
    else         score = 80 + Math.floor(rng() * 15)
    const name = agentName(lp.name, score, rng)
    const agentBBRaw = Math.round(parseShortM(lp.uc) * (parseFloat(lp.agentRate) / 100 || 0))
    result.push({ id, name, parent: lp.parent || '', commit: fmtM(lp.capCommit), uncalled: fmtM(lp.uc), aum: lp.aum !== 'N/A' ? lp.aum : '', nav: lp.nav !== 'N/A' ? lp.nav : '', agentClass: lpType(lp), sp: lp.sp === 'NR' ? '' : lp.sp, moodys: lp.mdy === 'NR' ? '' : lp.mdy, fitch: lp.fitch === 'NR' ? '' : lp.fitch, transferee: lp.tf ? 'Y' : '', agentRate: lp.agentRate || '', agentConc: lp.agentConc || '0.0%', agentBBRaw, conf: score })
    id++
  })
  const newCount = Math.min(NEW_LP_NAMES.length, 135)
  for (let i = 0; i < newCount; i++) {
    const score = 35 + Math.floor(rng() * 35)
    result.push({ id, name: NEW_LP_NAMES[i], parent: '', commit: `$${Math.round(50e6 + rng() * 450e6).toLocaleString('en-US')}`, uncalled: `$${Math.round(10e6 + rng() * 90e6).toLocaleString('en-US')}`, aum: '', nav: '', agentClass: 'Institutional Investor', sp: '', moodys: '', fitch: '', transferee: '', agentRate: '', agentConc: '5.0%', agentBBRaw: 0, conf: score })
    id++
  }
  const totalBBRaw = result.reduce((s, r) => s + r.agentBBRaw, 0)
  return result.map(r => ({
    ...r,
    agentBBFmt: r.agentBBRaw ? '$' + r.agentBBRaw.toLocaleString('en-US') : '',
    pctBBFmt:   totalBBRaw && r.agentBBRaw ? (r.agentBBRaw / totalBBRaw * 100).toFixed(2) + '%' : '',
  }))
}

export const EXTRACTED_LPS = buildExtractedLPs()

export const EXTRACTION_FIELD_MAP = [
  { extracted: 'Investor Name (Agent Records)', canonical: 'LP Master - Investor Name',                        group: 'Identity',        note: 'Matched via alias dictionary',              tier: 'Core' },
  { extracted: 'Parent / Sponsor',              canonical: 'Identity & Classification - Parent / Sponsor',    group: 'Identity & Classification', note: 'Secondary identity signal used in LP name matching', tier: 'Core' },
  { extracted: 'Transferee',                    canonical: 'Identity - Transferee',                            group: 'Identity',        note: 'Y where LP received a transferred commitment; blank if not applicable', tier: 'Core' },
  { extracted: 'LP Classification',              canonical: 'Identity & Classification - LP Classification',    group: 'Identity & Classification', note: 'Agent-assigned category; cross-checked vs UBS classification', tier: 'Core' },
  { extracted: 'Commitment (USD)',               canonical: 'Commitment Data - Capital Commitments',            group: 'Commitment Data', note: 'Matched via bank alias (BNY template)',      tier: 'Bank' },
  { extracted: 'Uncalled Capital (USD)',         canonical: 'Uncalled Data - Uncalled Capital',                 group: 'Uncalled Data',   note: 'Matched via bank alias (BNY template)',      tier: 'Bank' },
  { extracted: 'AUM',                            canonical: 'Financial Scale - AUM',                           group: 'Financial Scale', note: 'N/E where not disclosed in document',        tier: 'Core' },
  { extracted: 'NAV',                            canonical: 'Financial Scale - NAV',                           group: 'Financial Scale', note: 'N/E where not disclosed in document',        tier: 'Core' },
  { extracted: 'S&P',                            canonical: 'Ratings - S&P Rating',                            group: 'Ratings',         note: 'Used for LP tier classification',            tier: 'Core' },
  { extracted: "Moody's",                        canonical: "Ratings - Moody's Rating",                        group: 'Ratings',         note: 'Used for LP tier classification',            tier: 'Core' },
  { extracted: 'Fitch',                          canonical: 'Ratings - Fitch Rating',                          group: 'Ratings',         note: 'Used for LP tier classification',            tier: 'Core' },
  { extracted: 'Advance Rate',                   canonical: 'Borrowing Base - Agent Advance Rate',             group: 'Borrowing Base',  note: 'Agent-applied rate; compared to BUSA rate',                                              tier: 'Core' },
  { extracted: 'Borrowing Base Contribution',    canonical: 'Borrowing Base - Agent Borrowing Base',           group: 'Borrowing Base',  note: 'LP uncalled × agent advance rate; agent-calculated; cross-checked vs UBS engine output', tier: 'Core' },
  { extracted: '% of Borrowing Base',            canonical: 'Borrowing Base - % of Borrowing Base',           group: 'Borrowing Base',  note: 'LP BB contribution as % of total facility BB; agent-calculated informational column',    tier: 'Core' },
  { extracted: 'Concentration Limit',            canonical: 'Concentration - Agent Concentration Limit',       group: 'Concentration',   note: 'Per-LP agent limit; compared to UBS limit',                                              tier: 'Core' },
]

export const UNRECOGNIZED_COLUMNS = [
  { extracted: '% Called', reason: 'Derived ratio (Called ÷ Commitment) — computable from extracted fields. No canonical target; discard.' },
]

export const DOC_RECOGNITION = [
  { label: 'Document',          value: 'Agent-BB-Blue-Owl-GP-Stakes-V-May-2026.xlsx' },
  { label: 'Format',            value: 'Excel Workbook (.xlsx)' },
  { label: 'Tables identified', value: '1 borrowing-base table (Sheet: Borrowing Base)' },
  { label: 'Table location',    value: 'Rows 8-907 · Columns A-L' },
  { label: 'Header row',        value: 'Row 7 · 13 columns matched · 1 unmatched' },
  { label: 'LP rows extracted', value: '900' },
]
