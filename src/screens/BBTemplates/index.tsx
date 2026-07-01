import React, { useEffect, useRef, useState } from 'react'
import Card    from '../../components/ui/Card'
import Button  from '../../components/ui/Button'
import InfoTip from '../../components/ui/InfoTip'
import Modal   from '../../components/ui/Modal'
import { useApp } from '../../context/AppContext'
import { api } from '../../services/api'
import type { BbTemplate, BbTemplateInput, BbTemplateTabInput } from '../../services/api'
import { refreshTemplateService } from '../../services/templateService'

// ── Constants ─────────────────────────────────────────────────────────────────

const CLASS_OPTIONS = [
  { value: 'A', label: 'A — Full BB Schedule (group-header classification)' },
  { value: 'B', label: 'B — per-row Investor Type column' },
  { value: 'C', label: 'C — Simplified Callable Capital' },
]

const LP_CLASSIFICATIONS = [
  'Rated Included',
  'Non-Rated Included',
  'Designated Institutional',
  'Designated PWM',
  'Ineligible Investors',
  'Included',
]

const DEFAULT_SKIP_KEYWORDS = ['Total', 'Subtotal', 'Sub-Total', 'Grand Total', 'Sum', 'Net Total']

const SAMPLE_TEMPLATE_LINKS = [
  ['KKR Ascendant', '/samples/bb-templates/BB-Template-Import-kkr-ascendant.xlsx'],
  ['GS Blue Owl', '/samples/bb-templates/BB-Template-Import-gs-blue-owl.xlsx'],
  ['Audax VII', '/samples/bb-templates/BB-Template-Import-audax-vii.xlsx'],
  ['CCP VII Lev', '/samples/bb-templates/BB-Template-Import-ccp-vii-lev.xlsx'],
  ['Carlyle CP VII', '/samples/bb-templates/BB-Template-Import-cp-vii.xlsx'],
  ['AEP VII', '/samples/bb-templates/BB-Template-Import-aep-vii.xlsx'],
  ['Petershill IV', '/samples/bb-templates/BB-Template-Import-petershill-iv.xlsx'],
] as const

const BB_TEMPLATE_TIP_ITEMS = [
  {
    label: 'What a template stores',
    desc: 'A template describes one Agent BB workbook layout: tabs, header rows, column names, skip rows, and LP category group sections.',
  },
  {
    label: 'How extraction uses it',
    desc: 'When a submission is reviewed, the API matches workbook signals to this registry so LP rows and columns can be read consistently.',
  },
  {
    label: 'When to add one',
    desc: 'Add or upload a template when an agent bank sends a new workbook format or changes the tab/header structure materially.',
  },
]

// ── Styles ────────────────────────────────────────────────────────────────────

const inp = (w?: number | string): React.CSSProperties => ({
  width: w ?? '100%', border: '1px solid var(--border)', borderRadius: 4,
  padding: '4px 8px', fontSize: 12,
})
const label: React.CSSProperties = {
  fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
  marginBottom: 3, display: 'block',
}
const field = (w?: string): React.CSSProperties => ({
  display: 'flex', flexDirection: 'column', flex: w ? `0 0 ${w}` : '1',
})
const row: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-end' }

const detailHeading: React.CSSProperties = {
  fontWeight: 700, color: 'var(--navy)', marginBottom: 8, fontSize: 11,
  textTransform: 'uppercase', letterSpacing: '0.04em',
}
const detailSubHeading: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
  letterSpacing: '0.04em', marginBottom: 4,
}
const chip: React.CSSProperties = {
  background: 'var(--hover)', border: '1px solid var(--border)', borderRadius: 10,
  padding: '1px 8px', fontSize: 10, fontFamily: 'monospace',
}

// ── Form state ────────────────────────────────────────────────────────────────

interface GroupRow { groupSort: number; headerText: string; classification: string }

interface FormState {
  templateSlug:           string
  templateName:           string
  agentName:              string
  templateClass:          string
  sheetName:              string
  headerRowIndex:         string
  autoLearned:            boolean
  trancheCount:           string
  hasGroupingRows:        boolean
  hasColorFlags:          boolean
  autoDiscoverTabs:       boolean
  summaryRowsAboveHeader: string
  detectKeys:             string   // comma-separated
  // single LP_GRID tab
  tabSheetName:       string
  tabHeaderRowIndex:  string
  tabHeaderRowSpan:   string
  tabSkipKeywords:    string
  tabColumns:         string       // comma-separated
  groups:             GroupRow[]
}

function emptyForm(): FormState {
  return {
    templateSlug: '', templateName: '', agentName: '', templateClass: 'A', sheetName: '', headerRowIndex: '',
    autoLearned: false, trancheCount: '1', hasGroupingRows: false, hasColorFlags: false, autoDiscoverTabs: false,
    summaryRowsAboveHeader: '0', detectKeys: '',
    tabSheetName: '', tabHeaderRowIndex: '', tabHeaderRowSpan: '1',
    tabSkipKeywords: DEFAULT_SKIP_KEYWORDS.join(','), tabColumns: '',
    groups: [],
  }
}

function fromTemplate(t: BbTemplate): FormState {
  const lpGrid = t.tabs.find(tb => tb.tabRole === 'LP_GRID')
  return {
    templateSlug:           t.templateSlug ?? '',
    templateName:           t.templateName,
    agentName:              t.agentName ?? '',
    templateClass:          t.templateClass,
    sheetName:              t.sheetName ?? '',
    headerRowIndex:         t.headerRowIndex != null ? String(t.headerRowIndex) : '',
    autoLearned:            t.autoLearned,
    trancheCount:           String(t.trancheCount),
    hasGroupingRows:        t.hasGroupingRows,
    hasColorFlags:          t.hasColorFlags,
    autoDiscoverTabs:       t.autoDiscoverTabs,
    summaryRowsAboveHeader: String(t.summaryRowsAboveHeader),
    detectKeys:             t.detectKeys.join(', '),
    tabSheetName:       lpGrid?.sheetName ?? '',
    tabHeaderRowIndex:  lpGrid?.headerRowIndex != null ? String(lpGrid.headerRowIndex) : '',
    tabHeaderRowSpan:   String(lpGrid?.headerRowSpan ?? 1),
    tabSkipKeywords:    lpGrid?.skipRowKeywords?.join(',') ?? '',
    tabColumns:         lpGrid?.columns?.join(', ') ?? '',
    groups:             (lpGrid?.groups ?? []).map(g => ({ groupSort: g.groupSort, headerText: g.headerText, classification: g.classification })),
  }
}

function splitList(raw: string): string[] {
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

function toRequest(f: FormState): BbTemplateInput {
  const tab: BbTemplateTabInput = {
    tabRole:        'LP_GRID',
    tabSort:        1,
    sheetName:      f.tabSheetName.trim() || null,
    sleeveName:     null,
    headerRowIndex: f.tabHeaderRowIndex ? parseInt(f.tabHeaderRowIndex) : null,
    headerRowSpan:  parseInt(f.tabHeaderRowSpan) || 1,
    skipRowKeywords: splitList(f.tabSkipKeywords),
    columns:        splitList(f.tabColumns),
    groups: f.groups.map(g => ({ groupSort: g.groupSort, headerText: g.headerText, classification: g.classification })),
  }

  return {
    templateSlug:           f.templateSlug.trim() || null,
    templateName:           f.templateName.trim(),
    agentName:              f.agentName.trim() || null,
    templateClass:          f.templateClass,
    sheetName:              f.sheetName.trim() || null,
    headerRowIndex:         f.headerRowIndex ? parseInt(f.headerRowIndex) : null,
    autoLearned:            f.autoLearned,
    trancheCount:           parseInt(f.trancheCount) || 1,
    hasGroupingRows:        f.hasGroupingRows,
    hasColorFlags:          f.hasColorFlags,
    autoDiscoverTabs:       f.autoDiscoverTabs,
    summaryRowsAboveHeader: parseInt(f.summaryRowsAboveHeader) || 0,
    summaryRowRange:        null,
    titleRow:               null,
    titleText:              null,
    detectKeys:             splitList(f.detectKeys),
    legend:                 [],
    notes:                  [],
    tabs:                   [tab],
  }
}

// ── Template form modal ───────────────────────────────────────────────────────

function TemplateFormModal({
  open, title, initial, onClose, onSave,
}: {
  open:    boolean
  title:   string
  initial: FormState
  onClose: () => void
  onSave:  (f: FormState) => Promise<void>
}) {
  const [form,  setForm]  = useState<FormState>(initial)
  const [error, setError] = useState('')
  const [busy,  setBusy]  = useState(false)

  useEffect(() => { if (open) { setForm(initial); setError(''); setBusy(false) } }, [open])

  const set = (key: keyof FormState, val: unknown) =>
    setForm(prev => ({ ...prev, [key]: val }))

  const addGroup = () => setForm(prev => ({
    ...prev,
    groups: [...prev.groups, { groupSort: prev.groups.length + 1, headerText: '', classification: LP_CLASSIFICATIONS[0] }],
  }))
  const removeGroup = (i: number) => setForm(prev => ({
    ...prev,
    groups: prev.groups.filter((_, j) => j !== i).map((g, j) => ({ ...g, groupSort: j + 1 })),
  }))
  const setGroup = (i: number, key: keyof GroupRow, val: string | number) =>
    setForm(prev => ({
      ...prev,
      groups: prev.groups.map((g, j) => j === i ? { ...g, [key]: val } : g),
    }))

  const handleSave = async () => {
    if (!form.templateName.trim()) { setError('Template Name is required.'); return }
    setBusy(true)
    setError('')
    try {
      await onSave(form)
      onClose()
    } catch (e) {
      setError(String(e))
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle="Define the workbook structure the extraction engine uses to parse this Agent BB format."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy}>{busy ? 'Saving…' : 'Save Template'}</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: 4 }}>

        {/* ── Template Metadata ── */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border)', paddingBottom: 4, marginBottom: 12 }}>
            Template Metadata
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={row}>
              <div style={field()}>
                <span style={label}>Template Name *</span>
                <input style={inp()} value={form.templateName} onChange={e => set('templateName', e.target.value)} placeholder="Template ID (e.g. agent-fund-slug)" />
              </div>
              <div style={field('110px')}>
                <span style={label}>Class</span>
                <select style={inp()} value={form.templateClass} onChange={e => set('templateClass', e.target.value)}>
                  {CLASS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.value}</option>)}
                </select>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: -6 }}>
              {CLASS_OPTIONS.find(o => o.value === form.templateClass)?.label}
            </div>

            <div style={row}>
              <div style={field()}>
                <span style={label}>Template ID (slug)</span>
                <input style={inp()} value={form.templateSlug} onChange={e => set('templateSlug', e.target.value)} placeholder="e.g. agent-fund-slug (auto-versioned if taken)" />
              </div>
              <div style={field()}>
                <span style={label}>Agent Bank</span>
                <input style={inp()} value={form.agentName} onChange={e => set('agentName', e.target.value)} placeholder="agent bank name" />
              </div>
            </div>

            <div style={field()}>
              <span style={label}>Detect Keys (comma-separated)</span>
              <input style={inp()} value={form.detectKeys} onChange={e => set('detectKeys', e.target.value)} placeholder="filename / fund keywords used for recognition" />
            </div>

            <div style={row}>
              <div style={field()}>
                <span style={label}>Default Sheet Name</span>
                <input style={inp()} value={form.sheetName} onChange={e => set('sheetName', e.target.value)} placeholder="e.g. Borrowing Base" />
              </div>
              <div style={field('110px')}>
                <span style={label}>Header Row</span>
                <input type="number" min={1} style={inp()} value={form.headerRowIndex} onChange={e => set('headerRowIndex', e.target.value)} placeholder="—" />
              </div>
              <div style={field('80px')}>
                <span style={label}>Tranches</span>
                <input type="number" min={1} max={9} style={inp()} value={form.trancheCount} onChange={e => set('trancheCount', e.target.value)} />
              </div>
            </div>

            <div style={row}>
              <div style={field('110px')}>
                <span style={label}>Summary Rows</span>
                <input type="number" min={0} style={inp()} value={form.summaryRowsAboveHeader} onChange={e => set('summaryRowsAboveHeader', e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', paddingBottom: 2 }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.hasGroupingRows} onChange={e => set('hasGroupingRows', e.target.checked)} />
                  Group Header Rows
                </label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.hasColorFlags} onChange={e => set('hasColorFlags', e.target.checked)} />
                  Cell Colour Flags
                </label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.autoLearned} onChange={e => set('autoLearned', e.target.checked)} />
                  Auto-Learned
                </label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.autoDiscoverTabs} onChange={e => set('autoDiscoverTabs', e.target.checked)} />
                  Auto-Discover Tabs
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* ── LP_GRID Tab ── */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border)', paddingBottom: 4, marginBottom: 12 }}>
            LP Grid Tab (LP_GRID)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={row}>
              <div style={field()}>
                <span style={label}>Sheet Name</span>
                <input style={inp()} value={form.tabSheetName} onChange={e => set('tabSheetName', e.target.value)} placeholder="e.g. Borrowing Base" />
              </div>
              <div style={field('110px')}>
                <span style={label}>Header Row</span>
                <input type="number" min={1} style={inp()} value={form.tabHeaderRowIndex} onChange={e => set('tabHeaderRowIndex', e.target.value)} placeholder="—" />
              </div>
              <div style={field('90px')}>
                <span style={label}>Header Span</span>
                <input type="number" min={1} max={5} style={inp()} value={form.tabHeaderRowSpan} onChange={e => set('tabHeaderRowSpan', e.target.value)} />
              </div>
            </div>
            <div style={field()}>
              <span style={label}>Skip Row Keywords (comma-separated)</span>
              <input style={inp()} value={form.tabSkipKeywords} onChange={e => set('tabSkipKeywords', e.target.value)} />
            </div>
            <div style={field()}>
              <span style={label}>Expected Columns (comma-separated, in order)</span>
              <input style={inp()} value={form.tabColumns} onChange={e => set('tabColumns', e.target.value)} placeholder="Investor, Commitment, Unfunded Commitment, …" />
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>For multi-tab workbooks (e.g. multiple tranches), configure via Excel Upload — this form creates one LP_GRID tab.</div>
          </div>
        </div>

        {/* ── LP Category Groups ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 4, marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              LP Category Group Sections
            </span>
            <Button size="sm" variant="secondary" onClick={addGroup}>+ Add Group</Button>
          </div>

          {form.groups.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
              No group sections — Class B/C or flat-list Class A templates. Add groups for Class A templates with section-header rows.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {form.groups.map((g, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 18, textAlign: 'right' }}>{g.groupSort}</span>
                  <input
                    style={inp()}
                    placeholder="Section header text (verbatim from workbook)"
                    value={g.headerText}
                    onChange={e => setGroup(i, 'headerText', e.target.value)}
                  />
                  <select
                    style={{ ...inp('190px') }}
                    value={g.classification}
                    onChange={e => setGroup(i, 'classification', e.target.value)}
                  >
                    {LP_CLASSIFICATIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button
                    onClick={() => removeGroup(i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                    title="Remove group"
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: '8px 12px', background: 'var(--danger-lt)', color: 'var(--danger)', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── Delete confirm modal ───────────────────────────────────────────────────────

function DeleteModal({ template, onClose, onConfirm }: {
  template: BbTemplate | null
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState('')
  useEffect(() => {
    if (template) {
      setBusy(false)
      setErr('')
    }
  }, [template?.id])
  const confirm = async () => {
    setErr('')
    setBusy(true)
    try {
      await onConfirm()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  return (
    <Modal
      open={template != null}
      onClose={onClose}
      title="Remove BB Template?"
      subtitle={template?.templateName ?? ''}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={confirm} disabled={busy}>{busy ? 'Removing…' : 'Remove Template'}</Button>
        </>
      }
    >
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
        This will permanently delete the template definition for <strong>{template?.templateName}</strong> (Class {template?.templateClass}), including all tab and group section definitions. Existing submissions that matched against this template are not affected.
      </div>
      {err && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--danger)' }}>{err}</div>}
    </Modal>
  )
}

function lpGridTabs(t: BbTemplate) {
  return t.tabs.filter(tab => tab.tabRole === 'LP_GRID')
}

function primaryLpGrid(t: BbTemplate) {
  return lpGridTabs(t)[0]
}

function workbookTabsLabel(t: BbTemplate): string {
  const tabs = lpGridTabs(t)
  if (t.autoDiscoverTabs || tabs.length > 1) return 'multiple'
  return 'single'
}

function tabLabel(t: BbTemplate): string {
  const tabs = lpGridTabs(t)
  if (t.autoDiscoverTabs) return 'Auto-discover'
  if (tabs.length > 1) {
    return tabs.map(tab => tab.sheetName ?? tab.sleeveName).filter(Boolean).join(', ') || 'Multiple LP tabs'
  }
  return tabs[0]?.sheetName ?? t.sheetName ?? '—'
}

function headerRowLabel(t: BbTemplate): string {
  const row = primaryLpGrid(t)?.headerRowIndex ?? t.headerRowIndex
  return row != null ? String(row) : '—'
}

function headerCount(t: BbTemplate): number {
  return primaryLpGrid(t)?.columns.length ?? 0
}

function groupCount(t: BbTemplate): number {
  return lpGridTabs(t).reduce((total, tab) => total + tab.groups.length, 0)
}

function firstNote(t: BbTemplate): string {
  return t.notes.find(n => n.trim()) ?? '—'
}

// ── Class badge ───────────────────────────────────────────────────────────────

function ClassBadge({ cls }: { cls: string }) {
  const colors: Record<string, [string, string]> = {
    A: ['#e3f2fd', '#1565c0'],
    B: ['#e8f5e9', '#2e7d32'],
    C: ['#fff8e1', '#e65100'],
  }
  const [bg, fg] = colors[cls] ?? ['var(--hover)', 'var(--text)']
  return (
    <span style={{ background: bg, color: fg, borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 700 }}>
      Class {cls}
    </span>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function BBTemplates() {
  const { toast, navigate } = useApp()

  const [templates,    setTemplates]    = useState<BbTemplate[]>([])
  const [loading,      setLoading]      = useState(true)
  const [loadError,    setLoadError]    = useState<string | null>(null)
  const [expanded,     setExpanded]     = useState<number | null>(null)
  const [createOpen,   setCreateOpen]   = useState(false)
  const [editTarget,   setEditTarget]   = useState<BbTemplate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BbTemplate | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const mutationDisabled = loadError != null

  const load = () => {
    setLoadError(null)
    api.bbTemplates.list()
      .then(setTemplates)
      .catch(e => setLoadError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCreate = async (form: FormState) => {
    const created = await api.bbTemplates.create(toRequest(form))
    setTemplates(prev => [...prev, created])
    toast(`Template "${created.templateName}" (Class ${created.templateClass}) registered.`)
    refreshTemplateService()
  }

  const handleEdit = async (form: FormState) => {
    if (!editTarget) return
    const updated = await api.bbTemplates.update(editTarget.id, toRequest(form))
    setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t))
    toast(`Template "${updated.templateName}" updated.`)
    refreshTemplateService()
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.bbTemplates.remove(deleteTarget.id)
      setTemplates(prev => prev.filter(t => t.id !== deleteTarget.id))
      toast(`Template "${deleteTarget.templateName}" removed.`)
      refreshTemplateService()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      toast(`Remove failed: ${message}`)
      throw e
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    try {
      const imported = await api.bbTemplates.import(file)
      setTemplates(prev => [...prev, imported])
      toast(`Template "${imported.templateName}" (Class ${imported.templateClass}) imported from Excel.`)
      refreshTemplateService()
    } catch (err) {
      toast(`Import failed: ${String(err)}`)
    } finally {
      setImporting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <div style={{ padding: '40px 24px', color: 'var(--muted)', fontSize: 13 }}>Loading templates…</div>

  return (
    <div style={{ padding: '16px 24px 40px' }}>
      <div style={{ marginBottom: 16 }}>
        <Button variant="ghost" size="sm" onClick={() => navigate('upload')}>← Back to Upload</Button>
      </div>
      {loadError && (
        <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fff0f0', color: 'var(--danger)', borderRadius: 6, fontSize: 12 }}>
          API error — {loadError}
        </div>
      )}

      <Card
        title={`BB Template Registry (${templates.length})`}
        subtitle="One row per Agent BB workbook format variant registered for extraction."
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <InfoTip title="BB Templates" items={BB_TEMPLATE_TIP_ITEMS} width={340} />
            <Button size="sm" variant="secondary" disabled={importing || mutationDisabled} onClick={() => importRef.current?.click()}>
              {importing ? 'Importing…' : '↑ Upload Template'}
            </Button>
            <Button size="sm" disabled={mutationDisabled} onClick={() => setCreateOpen(true)}>+ Add Template</Button>
            <input ref={importRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImport} />
          </div>
        }
      >
        {templates.length === 0 ? (
          <div style={{ padding: '32px 18px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            No templates registered. Use “↑ Upload Template” to import a BB-Template-Import workbook, or “+ Add Template” to define one manually.
          </div>
        ) : (
          <>
            <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', background: 'var(--tbl)', fontSize: 11, color: 'var(--muted)' }}>
              <span style={{ fontWeight: 600, color: 'var(--navy)', marginRight: 8 }}>Sample templates:</span>
              {SAMPLE_TEMPLATE_LINKS.map(([label, href], i) => (
                <React.Fragment key={href}>
                  {i > 0 && <span style={{ margin: '0 6px', color: 'var(--border)' }}>|</span>}
                  <a href={href} download style={{ color: 'var(--red)', fontWeight: 600, textDecoration: 'none' }}>{label}</a>
                </React.Fragment>
              ))}
            </div>
            <div className="data-table-wrap" style={{ padding: '0 0 4px', scrollbarGutter: 'stable' }}>
              <table className="data-table" style={{ fontSize: 11, tableLayout: 'fixed', minWidth: 1120 }}>
                <colgroup>
                  <col style={{ width: 150 }} />
                  <col style={{ width: 160 }} />
                  <col style={{ width: 70 }} />
                  <col style={{ width: 95 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 70 }} />
                  <col style={{ width: 80 }} />
                  <col />
                  <col style={{ width: 150 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Template ID</th>
                    <th>Agent / Fund</th>
                    <th>Class</th>
                    <th>Workbook Tabs</th>
                    <th>Tab Label</th>
                    <th>Header Row</th>
                    <th style={{ textAlign: 'right' }}># Hdrs</th>
                    <th style={{ textAlign: 'right' }}>Groups</th>
                    <th>Notes</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {templates.map(t => {
                    const isOpen = expanded === t.id
                    const groups = groupCount(t)
                    return (
                      <React.Fragment key={t.id}>
                        <tr
                          className={isOpen ? 'data-table-row-selected' : undefined}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setExpanded(prev => prev === t.id ? null : t.id)}
                        >
                          <td style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <span style={{ marginRight: 6, fontSize: 10, color: 'var(--muted)', userSelect: 'none' }}>
                              {isOpen ? '▾' : '▸'}
                            </span>
                            <strong style={{ fontFamily: 'monospace' }}>{t.templateSlug ?? t.templateName}</strong>
                          </td>
                          <td style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.agentName ?? t.templateName}</td>
                          <td><ClassBadge cls={t.templateClass} /></td>
                          <td>{workbookTabsLabel(t)}</td>
                          <td style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{tabLabel(t)}</td>
                          <td style={{ fontFamily: 'monospace' }}>{headerRowLabel(t)}</td>
                          <td style={{ textAlign: 'right' }}>{headerCount(t) || '—'}</td>
                          <td style={{ textAlign: 'right', color: groups > 0 ? 'var(--navy)' : 'var(--muted)', fontWeight: groups > 0 ? 600 : 400 }}>
                            {groups || '—'}
                          </td>
                          <td style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {firstNote(t)}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                              <Button size="sm" variant="secondary" disabled={mutationDisabled} onClick={() => setEditTarget(t)}>Edit</Button>
                              <Button size="sm" variant="danger" disabled={mutationDisabled} onClick={() => setDeleteTarget(t)}>Delete</Button>
                            </div>
                          </td>
                        </tr>

                        {isOpen && (
                          <tr>
                            <td colSpan={10} style={{ background: 'var(--hover)', padding: '10px 24px 14px 36px', borderBottom: '1px solid var(--border)' }}>
                              <TemplateDetail template={t} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* Create modal */}
      <TemplateFormModal
        open={createOpen}
        title="Add BB Template"
        initial={emptyForm()}
        onClose={() => setCreateOpen(false)}
        onSave={handleCreate}
      />

      {/* Edit modal */}
      {editTarget && (
        <TemplateFormModal
          open={editTarget != null}
          title={`Edit Template — ${editTarget.templateName}`}
          initial={fromTemplate(editTarget)}
          onClose={() => setEditTarget(null)}
          onSave={handleEdit}
        />
      )}

      {/* Delete modal */}
      <DeleteModal
        template={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  )
}

// ── Expanded row detail panel ─────────────────────────────────────────────────

function TemplateDetail({ template }: { template: BbTemplate }) {
  const summary = template.summaryRowRange
    ?? (template.summaryRowsAboveHeader > 0 ? `1-${template.summaryRowsAboveHeader}` : '—')
  const recognition: ReadonlyArray<readonly [string, string]> = [
    ['Template ID',  template.templateSlug ?? '—'],
    ['Agent Bank',   template.agentName ?? '—'],
    ['Title',        template.titleText ? `Row ${template.titleRow ?? '?'} · "${template.titleText}"` : '—'],
    ['Auto-Discover', template.autoDiscoverTabs ? 'Yes' : 'No'],
    ['Summary Rows', summary],
  ]
  const flags: ReadonlyArray<readonly [string, boolean | number]> = [
    ['Has Grouping Rows', template.hasGroupingRows],
    ['Has Colour Flags',  template.hasColorFlags],
    ['Auto-Learned',      template.autoLearned],
    ['Tranche Count',     template.trancheCount],
  ]
  return (
    <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', fontSize: 12 }}>

      {/* Recognition */}
      <div>
        <div style={detailHeading}>Recognition</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '3px 14px' }}>
          {recognition.map(([k, v]) => (
            <React.Fragment key={k}>
              <span style={{ color: 'var(--muted)' }}>{k}</span>
              <span style={{ fontWeight: 600 }}>{v}</span>
            </React.Fragment>
          ))}
        </div>
        {template.detectKeys.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={detailSubHeading}>Detect Keys</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 240 }}>
              {template.detectKeys.map(k => <span key={k} style={chip}>{k}</span>)}
            </div>
          </div>
        )}
      </div>

      {/* Flags */}
      <div>
        <div style={detailHeading}>Flags</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '3px 14px' }}>
          {flags.map(([k, v]) => (
            <React.Fragment key={k}>
              <span style={{ color: 'var(--muted)' }}>{k}</span>
              <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                {typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Tabs */}
      {template.tabs.map(tab => (
        <div key={tab.id}>
          <div style={detailHeading}>{tab.tabRole} Tab{tab.sleeveName ? ` · ${tab.sleeveName}` : ''}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '3px 14px', marginBottom: 8 }}>
            {([
              ['Sheet',       tab.sheetName ?? '—'],
              ['Header Row',  tab.headerRowIndex ?? '—'],
              ['Header Span', tab.headerRowSpan],
            ] as ReadonlyArray<readonly [string, string | number]>).map(([k, v]) => (
              <React.Fragment key={k}>
                <span style={{ color: 'var(--muted)' }}>{k}</span>
                <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{String(v)}</span>
              </React.Fragment>
            ))}
          </div>

          {tab.columns.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={detailSubHeading}>Columns Extracted ({tab.columns.length})</div>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                {tab.columns.map((c, i) => <li key={`${c}-${i}`} style={{ fontSize: 11, padding: '1px 0' }}>{c}</li>)}
              </ol>
            </div>
          )}

          {tab.groups.length > 0 && (
            <div>
              <div style={detailSubHeading}>LP Category Groups</div>
              {tab.groups.map(g => (
                <div key={g.id} style={{ display: 'flex', gap: 8, fontSize: 11, padding: '2px 0' }}>
                  <span style={{ color: 'var(--muted)', minWidth: 16, textAlign: 'right' }}>{g.groupSort}.</span>
                  <span style={{ flex: 1 }}>{g.headerText}</span>
                  <span style={{ color: 'var(--red)', fontWeight: 600 }}>{g.classification}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Legend */}
      {template.legend.length > 0 && (
        <div>
          <div style={detailHeading}>Cell Format Legend</div>
          {template.legend.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11, padding: '2px 0' }}>
              <span style={{ fontWeight: 600, minWidth: 90 }}>{l.style}</span>
              <span style={{ color: 'var(--muted)' }}>{l.meaning}</span>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      {template.notes.length > 0 && (
        <div style={{ maxWidth: 320 }}>
          <div style={detailHeading}>Notes</div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {template.notes.map((n, i) => <li key={i} style={{ fontSize: 11, padding: '1px 0', color: 'var(--muted)' }}>{n}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
