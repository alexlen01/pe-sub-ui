import { useState, useEffect, startTransition } from 'react'
import { usePagination, PAGE_SIZE_OPTS } from '../../hooks/usePagination'
import { useApp } from '../../context/AppContext'
import StepBar from '../../components/ui/StepBar'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Tag from '../../components/ui/Tag'
import Modal from '../../components/ui/Modal'
import { getExtractedLPs, getExtractionFieldMap, getDocRecognition, getUnrecognizedColumns, getAllCanonicalFields, type DocRecognitionRow, type UnrecognizedColumn } from '../../services/extractionService'
import { getTemplateProfiles, getTemplateProfile, detectTemplate, findDetectedTemplate, buildDocRecognition, type MappedColumn } from '../../services/templateService'
import { api } from '../../services/api'
import { WIZARD_STEPS } from '../../config/wizardConfig'
import { formatCombinedRatings, hasAnyRating } from '../../utils/ratings'

type FieldMapRow = Awaited<ReturnType<typeof getExtractionFieldMap>>[0]
type CanonicalField = Awaited<ReturnType<typeof getAllCanonicalFields>>[0]

// Extracted Agent-BB row after BB-field enrichment. All cells render as display strings.
interface ExtractedRow {
  id: number
  name: string
  parent?: string
  transferee?: boolean
  agentClass?: string
  commit?: string
  uncalled?: string
  pctCalledFmt?: string
  pctUnfundedFmt?: string
  pctEligibleUnfundedFmt?: string
  aum?: string
  nav?: string
  lpSize?: string
  lpSizeBil?: string | number
  lpSizeCriteria?: string
  sizeMetricType?: string
  sizeValueTier?: string | number
  ratings?: string
  sp?: string
  moodys?: string
  fitch?: string
  agentRate?: string
  agentConc?: string
  excessConcFmt?: string
  eligibleCommitmentFmt?: string
  agentBBFmt?: string
  pctBBFmt?: string
}
type UnrecogRow = UnrecognizedColumn & { suggestedCanonical: string; dismissed: boolean }

type ExtractedGridColumn = {
  key: keyof ExtractedRow
  header: string
  canonical: string
  width: number
  align?: React.CSSProperties['textAlign']
  money?: boolean
  rating?: boolean
  strong?: boolean
}

type LPField = {
  key: keyof ExtractedRow
  extracted: string
  label?: string
  canonical?: string
  money?: boolean
}

const PETERSHILL_GRID_COLUMNS: ExtractedGridColumn[] = [
  { key: 'name',                     header: 'Deal Investor Name',                 canonical: 'Investor Name',                         width: 255 },
  { key: 'agentClass',               header: 'LP Classification',                  canonical: 'LP Category',                           width: 142 },
  { key: 'ratings',                  header: 'Ratings',                            canonical: 'Ratings',                              width: 112, align: 'left', rating: true },
  { key: 'sizeValueTier',            header: 'LP Size ($ Bil)',                    canonical: 'LP Size',                              width: 96,  align: 'right' },
  { key: 'sizeMetricType',           header: 'LP Size Criteria',                   canonical: 'Criteria',                             width: 72,  align: 'left' },
  { key: 'commit',                   header: 'Original Commitment',                canonical: 'Capital Commitments',                  width: 126, align: 'right', money: true },
  { key: 'uncalled',                 header: 'Unfunded Capital Commitment',        canonical: 'Uncalled Capital',                     width: 138, align: 'right', money: true },
  { key: 'agentConc',                header: 'Concentration Limit',                canonical: 'Concentration Limit',                  width: 108, align: 'right' },
  { key: 'excessConcFmt',            header: 'Excess Concentration',               canonical: 'Excess Concentration',                 width: 126, align: 'right', money: true },
  { key: 'eligibleCommitmentFmt',    header: 'Eligible Commitment',                canonical: 'Eligible Commitment',                  width: 126, align: 'right', money: true },
  { key: 'agentRate',                header: 'Advance Rate',                       canonical: 'Advance Rate',                         width: 84,  align: 'right', strong: true },
  { key: 'agentBBFmt',               header: 'Borrowing Base Contribution',        canonical: 'Borrowing Base',                       width: 136, align: 'right', money: true },
]

const DETAIL_FIELD_DEFS: Record<string, Omit<LPField, 'extracted' | 'canonical' | 'label'>> = {
  'Investor Name':              { key: 'name' },
  'LP Category':                { key: 'agentClass' },
  Transferee:                   { key: 'transferee' },
  'Parent / Sponsor':           { key: 'parent' },
  'Capital Commitments':        { key: 'commit', money: true },
  'Uncalled Capital':           { key: 'uncalled', money: true },
  '% of Uncalled Capital':      { key: 'pctUnfundedFmt' },
  '% of LP Called':             { key: 'pctCalledFmt' },
  AUM:                          { key: 'aum' },
  NAV:                          { key: 'nav' },
  'LP Size':                    { key: 'lpSize' },
  'Size Metric Type':           { key: 'sizeMetricType' },
  'Size Value / Tier':          { key: 'sizeValueTier' },
  'Advance Rate':               { key: 'agentRate' },
  'Eligible Commitment':        { key: 'eligibleCommitmentFmt', money: true },
  '% of Eligible Uncalled':     { key: 'pctEligibleUnfundedFmt' },
  '% of Borrowing Base':        { key: 'pctBBFmt' },
  'Borrowing Base':             { key: 'agentBBFmt', money: true },
  'Concentration Limit':        { key: 'agentConc' },
  'Excess Concentration':       { key: 'excessConcFmt', money: true },
  'S&P Rating':                 { key: 'sp' },
  "Moody's Rating":             { key: 'moodys' },
  'Fitch Rating':               { key: 'fitch' },
}

const EXTRACTED_TO_CANONICAL: Record<string, string> = {
  'Investor Name (Agent Records)': 'Investor Name',
  'Deal Investor Name': 'Investor Name',
  'LP Classification': 'LP Category',
  'Commitment (USD)': 'Capital Commitments',
  'Original Commitment': 'Capital Commitments',
  'Uncalled Capital (USD)': 'Uncalled Capital',
  'Unfunded Capital Commitment': 'Uncalled Capital',
  '% Called': '% of LP Called',
  '% of Unfunded Commitment': '% of Uncalled Capital',
  '% of Eligible Unfunded Commitment': '% of Eligible Uncalled',
  'Borrowing Base Contribution': 'Borrowing Base',
  'Investor S&P': 'S&P Rating',
  'S&P': 'S&P Rating',
  'Investor Moody': "Moody's Rating",
  "Moody's": "Moody's Rating",
  'NAV Range (USD)': 'NAV',
  'LP Size': 'LP Size',
  'LP Size ($ Bil)': 'Size Value / Tier',
  'LP Size Criteria': 'Size Metric Type',
  'Size Metric Type': 'Size Metric Type',
  'Size Value / Tier': 'Size Value / Tier',
  Transferee: 'Transferee',
}

function canonicalName(label: string): string {
  return label.split(/\s(?:-|—|›)\s/).pop() ?? label
}

function detailFieldsFromMapping(fieldMap: FieldMapRow[]): LPField[] {
  const seen = new Set<string>()
  return fieldMap.flatMap(m => {
    const canonical = EXTRACTED_TO_CANONICAL[m.extracted] ?? canonicalName(m.canonical)
    if (seen.has(canonical)) return []
    const def = DETAIL_FIELD_DEFS[canonical]
    if (!def) return []
    seen.add(canonical)
    return [{ ...def, extracted: m.extracted, label: canonical, canonical }]
  })
}

const FALLBACK_DETAIL_FIELDS: LPField[] = [
  ...PETERSHILL_GRID_COLUMNS.map(({ key, header, canonical, money }) => ({ key, extracted: header, label: canonical, canonical, money })),
]

// Transferee marker — shown next to the investor name (no dedicated column/field).
const TransfereeMark = () => (
  <sup
    title="Transferee — commitment received via transfer"
    style={{ marginLeft: 3, fontSize: 9, fontWeight: 700, color: 'var(--amber)', cursor: 'help' }}
  >t</sup>
)

const CHIP: Record<string, React.CSSProperties> = {
  Core: { background: 'var(--tbl)',      color: 'var(--muted)', fontStyle: 'italic' },
  Bank: { background: '#e8f0fb',         color: 'var(--red)',  fontWeight: 600      },
  User: { background: 'var(--amber-lt)', color: 'var(--amber)', fontWeight: 600      },
}

// Extracted LP Data header cells wrap onto two lines (the global `.data-table th`
// rule forces nowrap, so each th overrides it inline via HDR).
const HDR: React.CSSProperties = { whiteSpace: 'normal', verticalAlign: 'middle', lineHeight: 1.25 }


function LPDetailPanel({
  row, onClose, onDiscard, fieldMap, overlay = false, compact = false,
}: {
  row: ExtractedRow
  onClose: () => void
  onDiscard: (id: number) => void
  fieldMap: FieldMapRow[]
  overlay?: boolean
  compact?: boolean
}) {
  const lpFields = detailFieldsFromMapping(fieldMap)
  const detailFields = lpFields.length ? lpFields : FALLBACK_DETAIL_FIELDS
  return (
    <div
      className={overlay ? 'lp-detail-overlay extraction-detail-overlay' : undefined}
      style={overlay ? undefined : {
        width: 360, flexShrink: 0,
        alignSelf: 'flex-start',
        position: 'sticky', top: 0,
        maxHeight: 'calc(100vh - 130px)',
        overflow: 'hidden',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        display: 'flex', flexDirection: 'column', background: 'var(--card)',
      }}
    >
      <div style={{ padding: '12px 16px', background: 'var(--navy)', color: '#fff', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>Row #{row.id} — Field Detail</div>
          <div title={row.name} style={{ fontSize: 11, marginTop: 2, opacity: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}{row.transferee ? <TransfereeMark /> : null}</div>
        </div>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: '#fff', lineHeight: 1, padding: 0, opacity: 0.7, flexShrink: 0 }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {detailFields.map(({ key, extracted, label, canonical, money }, i) => {
            const mapping = fieldMap.find(m => m.extracted === extracted)
            const canonicalField = canonical ?? mapping?.canonical
            const value = key === 'lpSize'
              ? lpSizeValue(row)
              : key === 'sizeValueTier'
                ? lpSizeParts(row).size
                : key === 'sizeMetricType'
                  ? lpSizeParts(row).criteria
              : (row as unknown as Record<string, unknown>)[key] as string | undefined
            const displayValue = formatDisplayValue(value, Boolean(money), compact)
            return (
              <div key={key} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--card)' : 'var(--tbl)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', fontFamily: 'monospace' }}>{label ?? extracted}</div>
                    {canonicalField && <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 2 }}>→ {canonicalField}</div>}
                  </div>
                  <div title={displayValue} style={{ flex: '0 1 48%', maxWidth: '48%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right', fontSize: 12, fontWeight: 700, color: !value ? 'var(--muted)' : 'var(--navy)', whiteSpace: 'nowrap' }}>{displayValue}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="danger" size="sm" onClick={() => onDiscard(row.id)}>⊘ Discard Row</Button>
      </div>
    </div>
  )
}

const CollapseBtn = ({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) => (
  <button onClick={onToggle} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: 'var(--muted)', cursor: 'pointer' }}>
    {collapsed ? '▸ Show' : '▾ Hide'}
  </button>
)

function parseCurrencyAmount(val: string | undefined): number | null {
  if (!val) return null
  const raw = val.trim()
  if (!raw.startsWith('$')) return null
  const cleaned = raw.replace(/[$,\s]/g, '')
  const match = cleaned.match(/^\(?(-?\d+(?:\.\d+)?)([BMTK])?\)?$/i)
  if (!match) return null
  const mult: Record<string, number> = { B: 1e9, M: 1e6, T: 1e12, K: 1e3, '': 1 }
  const sign = cleaned.startsWith('(') ? -1 : 1
  return sign * parseFloat(match[1]) * (mult[(match[2] ?? '').toUpperCase()] ?? 1)
}

function toUsdNoCents(val: string | undefined): string {
  const num = parseCurrencyAmount(val)
  if (num == null) return val || '—'
  return num.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

function toMillions(val: string | undefined): string {
  const num = parseCurrencyAmount(val)
  if (num == null) return val || '—'
  const m = num / 1e6
  if (m >= 1000) return `$${parseFloat((m / 1000).toFixed(2))}B`
  if (m >= 100)  return `$${Math.round(m)}M`
  if (m >= 10)   return `$${parseFloat(m.toFixed(1))}M`
  return `$${parseFloat(m.toFixed(2))}M`
}

function formatDisplayValue(value: string | undefined, money: boolean, compact: boolean): string {
  if (!value) return '—'
  if (!money) return String(value)
  return compact ? toMillions(String(value)) : toUsdNoCents(String(value))
}

function cleanSizePart(value: unknown): string {
  return String(value ?? '').trim()
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(parseFloat(value.toFixed(2)))
}

function formatBillions(value: unknown): string {
  const raw = cleanSizePart(value)
  if (!raw) return ''
  if (/^\$/.test(raw)) return raw
  const numeric = raw.match(/^([0-9]+(?:\.[0-9]+)?)$/)
  if (numeric) return `$${trimNumber(Number(numeric[1]))}B`
  const billions = raw.match(/^([0-9]+(?:\.[0-9]+)?)\s*(?:bn|bil|b)$/i)
  if (billions) return `$${trimNumber(Number(billions[1]))}B`
  return raw
}

function normalizeLpSizeCriteria(value: unknown): string {
  const raw = cleanSizePart(value)
  if (!raw) return ''
  if (/\bNAV\b|net asset value/i.test(raw)) return 'NAV'
  if (/\bAUM\b|assets under management/i.test(raw)) return 'AUM'
  if (/asset/i.test(raw)) return 'Assets'
  return raw
}

function splitLPSize(value: unknown): { size: string; criteria: string } {
  const raw = cleanSizePart(value)
  if (!raw) return { size: '', criteria: '' }
  const phrase = raw.match(/assets under management|net asset value|\b(AUM|NAV|Assets?)\b/i)
  const criteria = normalizeLpSizeCriteria(phrase?.[0] ?? '')
  const size = phrase ? raw.replace(phrase[0], '').trim() : raw
  return { size, criteria }
}

function lpSizeParts(row: ExtractedRow): { size: string; criteria: string } {
  const raw = row as unknown as Record<string, unknown>
  const canonicalValue = row.sizeValueTier ?? raw['Size Value / Tier'] ?? raw.sizeValue
  const canonicalMetric = row.sizeMetricType ?? raw['Size Metric Type'] ?? raw.sizeMetric
  if (cleanSizePart(canonicalValue) || cleanSizePart(canonicalMetric)) {
    const valueParts = splitLPSize(canonicalValue)
    return {
      size: formatBillions(valueParts.size),
      criteria: normalizeLpSizeCriteria(canonicalMetric) || valueParts.criteria,
    }
  }

  const fallbackValue = row.lpSizeBil ?? raw['LP Size ($ Bil)'] ?? raw.lpSizeValue
  const fallbackMetric = row.lpSizeCriteria ?? raw['LP Size Criteria']
  if (cleanSizePart(fallbackValue) || cleanSizePart(fallbackMetric)) {
    const valueParts = splitLPSize(fallbackValue)
    return {
      size: formatBillions(valueParts.size),
      criteria: normalizeLpSizeCriteria(fallbackMetric) || valueParts.criteria,
    }
  }

  const legacyParts = splitLPSize(row.lpSize)
  if (legacyParts.size || legacyParts.criteria) {
    return {
      size: formatBillions(legacyParts.size),
      criteria: legacyParts.criteria,
    }
  }

  if (row.nav) return { size: formatBillions(row.nav), criteria: 'NAV' }
  if (row.aum) return { size: formatBillions(row.aum), criteria: 'AUM' }
  return { size: '', criteria: '' }
}

function lpSizeValue(row: ExtractedRow): string {
  const { size, criteria } = lpSizeParts(row)
  return [size, criteria].filter(Boolean).join(' ')
}

function gridValue(row: ExtractedRow, col: ExtractedGridColumn, compact: boolean, includeFitchRating: boolean): string {
  if (col.key === 'ratings') return formatCombinedRatings(row, includeFitchRating)
  if (col.key === 'sizeValueTier') return lpSizeParts(row).size || '—'
  if (col.key === 'sizeMetricType') return lpSizeParts(row).criteria || '—'
  const raw = row[col.key]
  return formatDisplayValue(raw == null ? undefined : String(raw), Boolean(col.money), compact)
}

function gridCellStyle(row: ExtractedRow, col: ExtractedGridColumn, includeFitchRating: boolean): React.CSSProperties {
  const hasValue = col.key === 'ratings'
    ? hasAnyRating(row, includeFitchRating)
    : col.key === 'sizeValueTier'
      ? Boolean(lpSizeParts(row).size)
      : col.key === 'sizeMetricType'
        ? Boolean(lpSizeParts(row).criteria)
      : Boolean(row[col.key])
  return {
    textAlign: col.align,
    fontFamily: col.money ? 'monospace' : undefined,
    fontSize: 11,
    fontWeight: col.rating || col.strong ? 600 : undefined,
    color: !hasValue
      ? 'var(--muted)'
      : col.key === 'agentRate' && row.agentRate === '0%'
        ? 'var(--danger)'
        : col.rating
          ? 'var(--navy)'
          : undefined,
  }
}

export default function ExtractionPreview() {
  const { navigate, toast, activeSubmission, activeSubmissionId, abortSubmission } = useApp()
  const [extracted,      setExtracted]    = useState<ExtractedRow[]>([])
  const [fieldMap,       setFieldMap]     = useState<FieldMapRow[]>([])
  const [docRec,         setDocRec]       = useState<DocRecognitionRow[]>([])
  const [canonicals,     setCanonicals]   = useState<CanonicalField[]>([])
  const [confirmed,      setConfirmed]    = useState(false)
  const [abortOpen,      setAbortOpen]    = useState(false)
  const [discardConfirmId, setDiscardConfirmId] = useState<number | null>(null)
  const [selectedLPId,   setSelectedLPId] = useState<number | null>(null)
  const [docCollapsed,   setDocCollapsed] = useState(false)
  const [mapCollapsed,   setMapCollapsed] = useState(false)
  const [loadError,      setLoadError]    = useState<string | null>(null)
  const [remapping,      setRemapping]    = useState<Set<string>>(new Set())
  const [reextracting,   setReextracting] = useState(false)
  const [containerWidth, setContainerWidth] = useState(0)
  const [unrecog,        setUnrecog]      = useState<UnrecogRow[]>([])
  const detectedProfileId = detectTemplate({ facility: activeSubmission ?? undefined }).id
  const [profileId,      setProfileId]    = useState(detectedProfileId)

  const loadData = async (sid: number) => {
    try {
      const [rows, cf, cols, fm, dr] = await Promise.all([
        getExtractedLPs(sid),
        getAllCanonicalFields(),
        getUnrecognizedColumns(sid),
        getExtractionFieldMap(sid),
        getDocRecognition(sid),
      ])
      setExtracted(rows as unknown as ExtractedRow[])
      setCanonicals(cf)
      setUnrecog(prev => {
        const dismissed = new Set(prev.filter(c => c.dismissed).map(c => c.extracted))
        return cols.map(c => ({
          ...c,
          suggestedCanonical: prev.find(p => p.extracted === c.extracted)?.suggestedCanonical ?? '',
          dismissed: dismissed.has(c.extracted),
        }))
      })
      setFieldMap(fm)
      setDocRec(dr)
      const profileHint = dr.find(r => r.label === 'Forced format')?.value ?? dr.find(r => r.label === 'Format')?.value
      const recognizedProfile = profileHint ? findDetectedTemplate({ fund: profileHint }) : null
      if (recognizedProfile) setProfileId(recognizedProfile.id)
    } catch (e) {
      setLoadError(String(e))
    }
  }

  useEffect(() => {
    if (activeSubmissionId == null) {
      setLoadError('No active submission — please start from the upload step.')
      return
    }
    setProfileId(detectTemplate({ facility: activeSubmission ?? undefined }).id)
    setLoadError(null)
    loadData(activeSubmissionId)
  }, [activeSubmission, activeSubmissionId])

  useEffect(() => {
    const el = document.querySelector('.content') as HTMLElement | null
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { page, setPage, totalPages, pageItems, from, to, pageSize, setPageSize } = usePagination(extracted)

  const selectedLP    = selectedLPId ? extracted.find(r => r.id === selectedLPId) ?? null : null
  const activeUnrecog = unrecog.filter(c => !c.dismissed)
  const compact       = containerWidth < 1500
  const includeFitchRating = fieldMap.some(m => canonicalName(m.canonical) === 'Fitch Rating')

  const profile     = getTemplateProfile(profileId) ?? getTemplateProfiles()[0]

  // The authoritative column set is the actual extraction result — matched fieldMap entries
  // plus columns the engine could not map. This keeps the Document Recognition counts in
  // lock-step with the Canonical Field Mapping card.
  const displayCols: MappedColumn[] = [
    ...fieldMap.map(m => ({ header: m.extracted, mapping: { canonical: m.canonical, group: m.group, tier: m.tier ?? 'Core' } })),
    ...activeUnrecog.map(c => ({ header: c.extracted, mapping: null })),
  ]
  const colsMatched = displayCols.filter(c => c.mapping).length

  // Document Recognition grid mirrors the prototype: file name comes from the live
  // per-document detection; the remaining structural rows are profile-driven, while the
  // column-match counts track the live extraction.
  const docFileName = docRec.find(r => r.label === 'Document')?.value
  const docRows     = buildDocRecognition(profile, { fileName: docFileName, columnsMatched: colsMatched, columnsTotal: displayCols.length })

  useEffect(() => { if (activeUnrecog.length === 0) setMapCollapsed(true) }, [activeUnrecog.length])

  useEffect(() => {
    if (extracted.length === 0) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
      e.preventDefault()
      const pageStart = (page - 1) * pageSize
      const pageEnd = Math.min(pageStart + pageSize - 1, extracted.length - 1)
      const idx = selectedLPId == null ? -1 : extracted.findIndex(r => r.id === selectedLPId)
      const nextIdx = idx === -1
        ? (e.key === 'ArrowDown' ? pageStart : pageEnd)
        : (e.key === 'ArrowDown' ? idx + 1 : idx - 1)
      if (nextIdx < 0 || nextIdx >= extracted.length) return
      setSelectedLPId(extracted[nextIdx].id)
      const nextPage = Math.floor(nextIdx / pageSize) + 1
      if (nextPage !== page) setPage(nextPage)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [extracted, selectedLPId, page, pageSize, setPage])

  const suggestMapping = async (extractedKey: string) => {
    const col = unrecog.find(c => c.extracted === extractedKey)
    if (!col?.suggestedCanonical) return
    if (activeSubmissionId == null) {
      setUnrecog(prev => prev.map(c => c.extracted === extractedKey ? { ...c, dismissed: true } : c))
      toast(`"${extractedKey}" mapped to ${col.suggestedCanonical}.`)
      return
    }
    setRemapping(prev => new Set(prev).add(extractedKey))
    try {
      await api.extraction.remap(activeSubmissionId, extractedKey, col.suggestedCanonical)
      await api.extraction.reextract(activeSubmissionId)
      setUnrecog(prev => prev.map(c => c.extracted === extractedKey ? { ...c, dismissed: true } : c))
      await loadData(activeSubmissionId)
      toast(`"${extractedKey}" mapped → ${col.suggestedCanonical}. LP records updated.`)
    } catch (e) {
      toast(`Remap failed: ${String(e)}`)
    } finally {
      setRemapping(prev => { const s = new Set(prev); s.delete(extractedKey); return s })
    }
  }

  const dismissUnrecog = async (extractedKey: string) => {
    setUnrecog(prev => prev.map(c => c.extracted === extractedKey ? { ...c, dismissed: true } : c))
    toast('Column discarded.')
    if (activeSubmissionId != null) {
      try {
        await api.extraction.reextract(activeSubmissionId)
        await loadData(activeSubmissionId)
      } catch (e) {
        toast(`Re-extraction failed: ${String(e)}`)
      }
    }
  }

  const handleReextract = async () => {
    if (activeSubmissionId == null) {
      toast(`Format set to ${profile.fund}.`)
      return
    }
    setReextracting(true)
    try {
      await api.extraction.reextract(activeSubmissionId, profile.fund)
      setSelectedLPId(null)
      setPage(1)
      await loadData(activeSubmissionId)
      toast(`Re-extracted using ${profile.fund} format.`)
    } catch (e) {
      toast(`Re-extraction failed: ${String(e)}`)
    } finally {
      setReextracting(false)
    }
  }

  const handleDiscard = async () => {
    if (discardConfirmId == null) return
    const id = discardConfirmId
    setDiscardConfirmId(null)
    setExtracted(prev => prev.filter(r => r.id !== id))
    if (selectedLPId === id) setSelectedLPId(null)
    if (activeSubmissionId != null) {
      try {
        await api.extraction.discardRow(activeSubmissionId, id)
      } catch (e) {
        toast(`Discard failed: ${String(e)}`)
        await loadData(activeSubmissionId)
      }
    }
    toast('Row discarded.')
  }

  const handleAbort = async () => {
    if (activeSubmissionId != null) {
      try { await api.submissions.abort(activeSubmissionId) }
      catch (e) { toast(`Abort failed: ${String(e)}`); return }
    } else {
      abortSubmission(activeSubmission ?? '')
    }
    setAbortOpen(false)
    toast('Submission aborted.')
    navigate('upload')
  }

  const handleConfirm = async () => {
    setConfirmed(true)
    if (activeSubmissionId != null) {
      toast('Extraction confirmed. Running LP name matching...')
      try {
        const res = await api.submissions.confirm(activeSubmissionId)
        if (res?.templateSaved) {
          toast(`Template saved for ${res.agentBank} — future submissions will use exact sheet and header row.`)
        }
        startTransition(() => navigate('match-queue'))
      } catch (e) {
        toast(`Confirm failed: ${String(e)}`)
        setConfirmed(false)
      }
    } else {
      toast('Extraction confirmed. Running LP name matching...')
      setTimeout(() => {
        toast(`LP matching complete. ${extracted.length} records sent to match queue.`)
        startTransition(() => navigate('match-queue'))
      }, 2000)
    }
  }

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--topbar-h))' }}>
      {loadError && <div style={{ margin: '8px 16px 0', padding: '10px 14px', background: '#fff0f0', color: 'var(--danger)', borderRadius: 6, fontSize: 12 }}>API error — {loadError}</div>}
      <StepBar steps={WIZARD_STEPS} current={2} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 40px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        <Card
          title="Document Recognition"
          subtitle={`Borrowing-base tables identified by the extraction engine · ${profile.fund}`}
          action={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <label style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Format</label>
              <select
                value={profileId}
                onChange={e => setProfileId(e.target.value)}
                disabled={reextracting}
                title="Override recognized Agent BB format"
                style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', background: 'var(--card)', color: 'var(--text)' }}
              >
                {getTemplateProfiles().map(p => <option key={p.id} value={p.id}>{p.fund}</option>)}
              </select>
              <Button variant="secondary" size="sm" onClick={handleReextract} disabled={reextracting}>
                {reextracting ? 'Re-extracting...' : 'Re-extract'}
              </Button>
              <CollapseBtn collapsed={docCollapsed} onToggle={() => setDocCollapsed(v => !v)} />
            </div>
          }
        >
          {!docCollapsed && (
          <div style={{ padding: '4px 18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px 24px' }}>
              {docRows.map(({ label, value, wide }) => (
                <div key={label} style={{ gridColumn: wide ? 'span 2' : 'span 1' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{value}</div>
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                LP-category sections{profile.groupHeaders.length > 0 ? ` (${profile.groupHeaders.length} · each followed by a subtotal row, excluded)` : ''}
              </div>
              {profile.groupHeaders.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {profile.groupHeaders.map(g => <Tag key={g}>{g}</Tag>)}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                  Flat list — this format does not group LPs into categories.
                </div>
              )}
            </div>

          </div>
          )}
        </Card>

        <Card
          title="Canonical Field Mapping"
          subtitle={`${fieldMap.length} columns matched · ${activeUnrecog.length > 0 ? `${activeUnrecog.length} unmatched — action required` : 'all matched'}`}
          action={<div style={{ display: 'flex', gap: 8 }}><Button variant="secondary" size="sm" onClick={() => navigate('field-mapping')}>⚙ Field Mapping Dictionary</Button><CollapseBtn collapsed={mapCollapsed} onToggle={() => setMapCollapsed(v => !v)} /></div>}
        >
          {!mapCollapsed && (
            <div style={{ padding: '0 18px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', paddingTop: 5, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>✓ Matched</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ background: 'var(--tbl)' }}>{['Extracted Column','Canonical LP Field','Group','Match'].map(h => <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--navy)', borderBottom: '1px solid var(--border)', fontSize: 11 }}>{h}</th>)}</tr></thead>
                <tbody>
                  {fieldMap.map((m, i) => (
                    <tr key={i}>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontFamily: 'monospace', fontWeight: 600, fontSize: 11 }}>{m.extracted}</td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
                        {m.canonical}
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, marginLeft: 5, ...(CHIP[m.tier ?? 'Core'] ?? CHIP.Core) }}>{m.tier ?? 'Core'}</span>
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}><Tag>{m.group}</Tag></td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 11 }}>{m.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!mapCollapsed && activeUnrecog.length > 0 && (
            <div style={{ padding: '0 18px 14px', borderTop: '2px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)', margin: '12px 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>⚠ Unmatched — action required</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ background: '#fff5f5' }}>{['Extracted Column','Reason','Map To',''].map(h => <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--danger)', borderBottom: '1px solid var(--border)', fontSize: 11 }}>{h}</th>)}</tr></thead>
                <tbody>
                  {activeUnrecog.map(col => (
                    <tr key={col.extracted} style={{ background: '#fff8f8' }}>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontFamily: 'monospace', fontWeight: 600, fontSize: 11 }}>{col.extracted}</td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 11 }}>{col.reason}</td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
                        <select value={col.suggestedCanonical} onChange={e => setUnrecog(prev => prev.map(c => c.extracted === col.extracted ? { ...c, suggestedCanonical: e.target.value } : c))} style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}>
                          <option value="">— select mapping —</option>
                          {/* All canonical fields are valid manual targets, including derived
                              ones (Borrowing Base, % of Borrowing Base, Eligible Commitment, …)
                              which the agent reports for display/cross-check. The remap endpoint
                              handles derived targets, so they must not be filtered out here. */}
                          {(canonicals as Array<{ value: string; label: string; extractable?: boolean }>)
                            .map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <Button size="sm" onClick={() => suggestMapping(col.extracted)} disabled={!col.suggestedCanonical || remapping.has(col.extracted)}>{remapping.has(col.extracted) ? 'Mapping...' : 'Map'}</Button>
                          <Button size="sm" variant="secondary" onClick={() => dismissUnrecog(col.extracted)}>Discard</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* LP data table + Field Detail overlay */}
        <div>
          <Card
            title={`Extracted LP Data — ${extracted.length} Records`}
            subtitle={
              selectedLP
                ? `Row #${selectedLP.id} selected`
                : 'Click any row to review extracted fields'
            }
            action={<div style={{ display: 'flex', gap: 8 }}><Button variant="danger" size="sm" onClick={() => setAbortOpen(true)}>Abort Submission</Button><Button size="sm" onClick={handleConfirm} disabled={confirmed}>{confirmed ? 'Running matching...' : 'Confirm & Run LP Matching'}</Button></div>}
          >
            {/* position:relative here anchors the overlay to the table rows, not the footer */}
            <div style={{ position: 'relative' }}>
                <div className="data-table-wrap">
              <table className="data-table" style={{ tableLayout: 'fixed', minWidth: 1554 }}>
                <thead>
                  <tr>
                    {PETERSHILL_GRID_COLUMNS.map(col => (
                      <th key={col.key} style={{ ...HDR, width: col.width, textAlign: col.align }}>{col.canonical}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map(r => (
                    <tr
                      key={r.id}
                      className={selectedLPId === r.id ? 'data-table-row-selected' : undefined}
                      onClick={() => setSelectedLPId(prev => prev === r.id ? null : r.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      {PETERSHILL_GRID_COLUMNS.map(col => (
                        <td key={col.key} style={gridCellStyle(r, col, includeFitchRating)}>
                          {col.key === 'name' ? (
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} title={r.transferee ? `${r.name} (transferee)` : r.name}>
                              {r.name}{r.transferee ? <TransfereeMark /> : null}
                            </div>
                          ) : gridValue(r, col, compact, includeFitchRating)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>

              {selectedLP && (
                <LPDetailPanel
                  row={selectedLP}
                  onClose={() => setSelectedLPId(null)}
                  onDiscard={id => setDiscardConfirmId(id)}
                  fieldMap={fieldMap}
                  compact={compact}
                  overlay
                />
              )}
            </div>

            <div className="tbl-footer">
              <span>Showing {from}–{to} of {extracted.length} · {extracted.filter(r => r.commit && r.uncalled).length} complete · {extracted.filter(r => !r.commit || !r.uncalled).length} with missing fields</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)', color: 'var(--muted)' }}>
                  {PAGE_SIZE_OPTS.map(n => <option key={n} value={n}>{n} / page</option>)}
                </select>
                {totalPages > 1 && (<><Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>‹ Prev</Button><span style={{ fontSize: 11, color: 'var(--muted)' }}>Page {page} of {totalPages}</span><Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next ›</Button></>)}
                <Button size="sm" onClick={handleConfirm} disabled={confirmed}>{confirmed ? 'Running...' : 'Confirm & Run LP Matching'}</Button>
              </div>
            </div>
          </Card>
        </div>

      </div>
    </div>

    <Modal open={discardConfirmId != null} onClose={() => setDiscardConfirmId(null)} title="Discard Row?" subtitle="This extracted LP row will be permanently removed."
      footer={<><Button variant="secondary" onClick={() => setDiscardConfirmId(null)}>Cancel</Button><Button variant="danger" onClick={handleDiscard}>Discard</Button></>}>
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>The row will be deleted before LP matching runs. It will not appear in the Match Queue. To restore it, re-upload the Agent BB.</div>
    </Modal>
    <Modal open={abortOpen} onClose={() => setAbortOpen(false)} title="Abort Submission?" subtitle="This will permanently remove the submission from history."
      footer={<><Button variant="secondary" onClick={() => setAbortOpen(false)}>Keep Working</Button><Button variant="danger" onClick={handleAbort}>Abort Submission</Button></>}>
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>Aborting at this stage is safe — no LP records have been added or updated yet. If you need to reprocess this Agent BB, upload it again.</div>
    </Modal>
    </>
  )
}
