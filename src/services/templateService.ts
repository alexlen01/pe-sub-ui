// Template recognition: identifies which Agent-BB format a submission is.
// Template profiles and field-alias mappings are fetched from the backend
// (/api/bb-templates and /api/field-mapping/alias-groups) and cached
// in module-level variables after the first call to initTemplateService().

// ── Backend API response types ────────────────────────────────────────────────

interface BbGroupApi {
  id: number
  groupSort: number
  headerText: string
  classification: string
}

interface BbTabApi {
  id: number
  tabRole: string
  tabSort: number
  sheetName: string
  sleeveName: string | null
  headerRowIndex: number | null
  headerRowSpan: number
  skipRowKeywords: string[]
  columns: string[]
  groups: BbGroupApi[]
}

interface BbTemplateApi {
  id: number
  templateSlug: string | null
  templateName: string
  agentName: string | null
  templateClass: string
  sheetName: string
  headerRowIndex: number | null
  autoLearned: boolean
  trancheCount: number
  hasGroupingRows: boolean
  hasColorFlags: boolean
  autoDiscoverTabs: boolean
  summaryRowsAboveHeader: number
  summaryRowRange: string | null
  titleRow: number | null
  titleText: string | null
  detectKeys: string[]
  legend: TemplateLegendRule[]
  notes: string[]
  createdAt: string
  updatedAt: string
  tabs: BbTabApi[]
}

interface AliasApi { id: number; text: string; tier: string; bank: string | null }
interface FieldApi { id: number; canonical: string; lpMasterField: string; disambiguation: string | null; aliases: AliasApi[] }
interface AliasGroupApi { group: string; fields: FieldApi[] }

// ── UI-facing types ──────────────────────────────────────────────────────────

export interface TemplateLegendRule {
  style: string
  meaning: string
}

export interface TemplateProfile {
  id: string
  fund: string
  workbook: { tabs: 'single' | 'multiple'; tabLabel: string }
  title: { row: number; text: string }
  summaryRows: string | null
  headerRow: number | string
  groupHeaders: string[]
  columns: string[]
  legend: TemplateLegendRule[] | null
  notes: string[]
  detectKeys?: string[]
}

export interface DocRecognitionRow {
  label: string
  value: string
  wide?: boolean
}

export interface ColumnMapping {
  canonical: string
  group: string
  tier: string
  confidence?: number
}

export interface MappedColumn {
  header: string
  mapping: ColumnMapping | null
}

// ── Module-level cache ────────────────────────────────────────────────────────

const CACHE_TTL_MS = 25 * 60 * 1000   // 25 minutes — matches backend Caffeine TTL

let _templates: TemplateProfile[] = []
let _aliasGroups: AliasGroupApi[] = []
let _initPromise: Promise<void> | null = null
let _cacheExpiry: number | null = null

const EMPTY_PROFILE: TemplateProfile = {
  id: '', fund: '', workbook: { tabs: 'single', tabLabel: '' },
  title: { row: 1, text: '' }, summaryRows: null, headerRow: 1,
  groupHeaders: [], columns: [], legend: null, notes: [],
}

function detectKeysForTemplate(dto: BbTemplateApi): string[] {
  const keys = [...dto.detectKeys]
  const name = normalize(`${dto.templateName} ${dto.templateSlug ?? ''}`)
  if (name.includes('audax')) {
    for (const key of ['audax', 'audax fund vii', 'agent bb audax']) {
      if (!keys.some(k => normalize(k) === key)) keys.push(key)
    }
  }
  return keys
}

function adaptTemplate(dto: BbTemplateApi): TemplateProfile {
  const mainTab = dto.tabs.find(t => t.tabSort === 1) ?? dto.tabs[0]
  const isMulti = dto.autoDiscoverTabs || dto.trancheCount > 1 || dto.tabs.length > 1
  const tabLabel = mainTab?.sheetName ?? dto.sheetName
  const hRow = mainTab?.headerRowIndex ?? dto.headerRowIndex ?? 1
  const span = mainTab?.headerRowSpan ?? 1
  const headerRow: number | string = span > 1 ? `${hRow}-${hRow + span - 1}` : hRow
  const groupHeaders = [...(mainTab?.groups ?? [])]
    .sort((a, b) => a.groupSort - b.groupSort)
    .map(g => g.headerText)
  const summaryRows = dto.summaryRowRange
    ?? (dto.summaryRowsAboveHeader > 0 ? `1-${dto.summaryRowsAboveHeader}` : null)
  const legend: TemplateLegendRule[] | null = dto.legend.length > 0 ? dto.legend : null

  return {
    id: String(dto.id),
    fund: dto.templateName,
    workbook: { tabs: isMulti ? 'multiple' : 'single', tabLabel },
    title: { row: dto.titleRow ?? 1, text: normalize(dto.templateName).includes('audax') ? 'Deal Name:' : (dto.titleText ?? dto.templateName) },
    summaryRows,
    headerRow,
    groupHeaders,
    columns: mainTab?.columns ?? [],
    legend,
    notes: dto.notes,
    detectKeys: detectKeysForTemplate(dto),
  }
}

export async function initTemplateService(): Promise<void> {
  // Evict expired cache so the next call re-fetches from the API.
  if (_cacheExpiry !== null && Date.now() > _cacheExpiry) {
    _templates = []
    _aliasGroups = []
    _initPromise = null
    _cacheExpiry = null
  }
  if (_initPromise) return _initPromise
  _initPromise = (async () => {
    const [templateData, aliasData] = await Promise.all([
      fetch('/api/bb-templates').then(r => r.json() as Promise<BbTemplateApi[]>),
      fetch('/api/field-mapping/alias-groups').then(r => r.json() as Promise<AliasGroupApi[]>),
    ])
    _templates = templateData.map(adaptTemplate)
    _aliasGroups = aliasData
    _cacheExpiry = Date.now() + CACHE_TTL_MS
  })()
  return _initPromise
}

/**
 * Force-evict the template cache and re-fetch immediately.
 * Call this after any mutation in the BB Template registry so the Upload
 * dropdown reflects the latest names without waiting for TTL expiry.
 */
export async function refreshTemplateService(): Promise<void> {
  _templates = []
  _aliasGroups = []
  _initPromise = null
  _cacheExpiry = null
  return initTemplateService()
}

// Exposed only for test teardown — do not call in production code.
export function _resetForTesting(): void {
  _templates = []
  _aliasGroups = []
  _initPromise = null
  _cacheExpiry = null
}

// ── Sync accessors (safe to call after initTemplateService resolves) ───────────

export function getTemplateProfiles(): TemplateProfile[] {
  return _templates
}

export function getTemplateProfile(id: string): TemplateProfile | null {
  return _templates.find(p => p.id === id) ?? null
}

// ── Jaro-Winkler alias matching ───────────────────────────────────────────────

function normalize(s: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1
  if (!a || !b) return 0
  const matchWindow = Math.max(Math.floor(Math.max(a.length, b.length) / 2) - 1, 0)
  const matchedA = new Array<boolean>(a.length).fill(false)
  const matchedB = new Array<boolean>(b.length).fill(false)
  let matches = 0
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - matchWindow)
    const hi = Math.min(i + matchWindow, b.length - 1)
    for (let j = lo; j <= hi; j++) {
      if (!matchedB[j] && a[i] === b[j]) {
        matchedA[i] = true
        matchedB[j] = true
        matches++
        break
      }
    }
  }
  if (matches === 0) return 0
  let transpositions = 0
  let k = 0
  for (let i = 0; i < a.length; i++) {
    if (!matchedA[i]) continue
    while (!matchedB[k]) k++
    if (a[i] !== b[k]) transpositions++
    k++
  }
  const jaro = ((matches / a.length) + (matches / b.length) + ((matches - Math.floor(transpositions / 2)) / matches)) / 3
  let prefix = 0
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++
    else break
  }
  return jaro + prefix * 0.1 * (1 - jaro)
}

function hasPercentSignal(value: string): boolean {
  const normalized = normalize(value)
  return value.includes('%') || /\b(percent|percentage|pct)\b/.test(normalized)
}

function isPercentField(canonical: string, aliases: string[]): boolean {
  return hasPercentSignal(canonical) || aliases.some(hasPercentSignal)
}

export function resolveColumn(header: string): ColumnMapping | null {
  const target = normalize(header)
  if (!target) return null
  const headerHasPercentSignal = hasPercentSignal(header)
  let best: ColumnMapping | null = null
  let bestScore = 0
  for (const grp of _aliasGroups) {
    for (const field of grp.fields) {
      if (!headerHasPercentSignal && isPercentField(field.canonical, field.aliases.map(a => a.text))) continue
      for (const alias of field.aliases) {
        const a = normalize(alias.text)
        const exact = target === a
        const contains = a.includes(' ') && target.includes(a)
        if (exact || contains) {
          return { canonical: field.canonical, group: grp.group, tier: alias.tier ?? 'Core', confidence: 1 }
        }
        const score = jaroWinkler(target, a)
        if (score > bestScore) {
          bestScore = score
          best = { canonical: field.canonical, group: grp.group, tier: alias.tier ?? 'Core', confidence: score }
        }
      }
    }
  }
  return bestScore >= 0.900 ? best : null
}

export function mapColumns(profile: TemplateProfile | null): MappedColumn[] {
  if (!profile) return []
  return profile.columns.map(header => ({ header, mapping: resolveColumn(header) }))
}

export function findDetectedTemplate(meta: { fileName?: string; facility?: string; fund?: string }): TemplateProfile | null {
  const hay = normalize(`${meta.fileName ?? ''} ${meta.facility ?? ''} ${meta.fund ?? ''}`)
  return _templates.find(p => {
    const fund = normalize(p.fund)
    const title = normalize(p.title.text)
    const keys = (p.detectKeys ?? []).map(normalize)
    return (fund.length > 0 && hay.includes(fund))
        || (title.length > 0 && hay.includes(title))
        || keys.some(k => k.length > 0 && hay.includes(k))
  }) ?? null
}

export function detectTemplate(meta: { fileName?: string; facility?: string; fund?: string }): TemplateProfile {
  return findDetectedTemplate(meta) ?? _templates[0] ?? EMPTY_PROFILE
}

export function buildDocRecognition(
  profile: TemplateProfile,
  opts: { fileName?: string; columnsMatched?: number; columnsTotal?: number } = {},
): DocRecognitionRow[] {
  const tabs = profile.workbook.tabs === 'single'
    ? `Single tab · "${profile.workbook.tabLabel}"`
    : `Multiple tabs · one "${profile.workbook.tabLabel}" tab per borrower/sleeve`
  const headerRow = String(profile.headerRow).includes('-')
    ? `Rows ${profile.headerRow} (stacked — joined before matching)`
    : `Row ${profile.headerRow}`
  const grouping = profile.groupHeaders.length > 0
    ? `${profile.groupHeaders.length} LPRecord-category sections (subtotal row excluded per section)`
    : 'Flat list — no LPRecord-category sections'
  const matched = opts.columnsMatched ?? mapColumns(profile).filter(c => c.mapping).length
  const total   = opts.columnsTotal ?? profile.columns.length

  return [
    { label: 'Document',          value: opts.fileName || '—' },
    { label: 'Recognized format', value: profile.fund, wide: true },
    { label: 'Workbook',          value: tabs, wide: true },
    { label: 'Title anchor',      value: `Row ${profile.title.row} · "${profile.title.text}"`, wide: true },
    { label: 'Column header row', value: headerRow },
    { label: 'Summary block',     value: profile.summaryRows ? `Rows ${profile.summaryRows} (skipped)` : 'None' },
    { label: 'LP grouping',       value: grouping, wide: true },
    { label: 'Columns matched',   value: `${matched} of ${total} mapped to canonical LP fields` },
    { label: 'Legend',            value: profile.legend ? `${profile.legend.length} cell-format rules` : 'None' },
  ]
}
