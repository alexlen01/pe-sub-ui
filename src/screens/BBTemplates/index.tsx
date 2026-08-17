import React, { useEffect, useMemo, useRef, useState } from 'react'
import Card    from '../../components/ui/Card'
import Button  from '../../components/ui/Button'
import InfoTip from '../../components/ui/InfoTip'
import Modal   from '../../components/ui/Modal'
import { useApp } from '../../context/AppContext'
import { useColumnResize, type ColWidths } from '../../hooks/useColumnResize'
import { usePagination, PAGE_SIZE_OPTS } from '../../hooks/usePagination'
import { SortableHeader, useSortableRows } from '../../hooks/useTableSort'
import { api } from '../../services/api'
import type { BbTemplate, BbTemplateInput, BbTemplateTabInput, TemplateLegendRule } from '../../services/api'
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

// Percentage shares, summing to 100, so the table always fills the card at any viewport width
// instead of underfilling it or forcing a horizontal scroll. Resizing redistributes the share.
// Each share is at or above the width its header label needs under .bb-template-table's 10px
// padding, so no column ellipsis-truncates at its default size; the slack left over goes to the
// three free-text columns, whose values are the only ones that outrun their labels.
const BB_TEMPLATE_INITIAL_WIDTHS: ColWidths = {
  templateId:   12,
  agent:        13,
  cls:           7,
  tabs:          5,
  tabLabel:     16,
  summaryRows:   9,
  summaryRange:  7,
  headerRow:     9,
  headerCount:   8,
  groups:        25,
}

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
  {
    label: 'Editing and removing',
    desc: 'Click any row to open its definition for editing. Delete Template sits in the footer of that form.',
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
  summaryRowRange:        string
  titleRow:               string
  titleText:              string
  detectKeys:             string   // comma-separated
  legend:                 TemplateLegendRule[]
  notes:                  string   // one note per line
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
    summaryRowsAboveHeader: '0', summaryRowRange: '', titleRow: '', titleText: '',
    detectKeys: '', legend: [], notes: '',
    tabSheetName: '', tabHeaderRowIndex: '', tabHeaderRowSpan: '1',
    tabSkipKeywords: DEFAULT_SKIP_KEYWORDS.join(','), tabColumns: '',
    groups: [],
  }
}

// Exported for the round-trip guard in bbTemplateRoundTrip.test.ts: PUT /api/bb-templates/{id}
// replaces the whole record, so anything these two drop is erased on save.
export function fromTemplate(t: BbTemplate): FormState {
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
    summaryRowRange:        t.summaryRowRange ?? '',
    titleRow:               t.titleRow != null ? String(t.titleRow) : '',
    titleText:              t.titleText ?? '',
    detectKeys:             t.detectKeys.join(', '),
    legend:                 t.legend.map(l => ({ style: l.style, meaning: l.meaning })),
    notes:                  t.notes.join('\n'),
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

// Notes are free text that may itself contain commas, so the textarea is line-delimited.
function splitLines(raw: string): string[] {
  return raw.split('\n').map(s => s.trim()).filter(Boolean)
}

export function toRequest(f: FormState): BbTemplateInput {
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
    summaryRowRange:        f.summaryRowRange.trim() || null,
    titleRow:               f.titleRow ? parseInt(f.titleRow) : null,
    titleText:              f.titleText.trim() || null,
    detectKeys:             splitList(f.detectKeys),
    legend:                 f.legend.filter(l => l.style.trim() || l.meaning.trim()),
    notes:                  splitLines(f.notes),
    tabs:                   [tab],
  }
}

// ── Template form modal ───────────────────────────────────────────────────────

function TemplateFormModal({
  open, title, initial, onClose, onSave, onDelete,
}: {
  open:      boolean
  title:     string
  initial:   FormState
  onClose:   () => void
  onSave:    (f: FormState) => Promise<void>
  onDelete?: () => Promise<void>
}) {
  const [form,    setForm]    = useState<FormState>(initial)
  const [error,   setError]   = useState('')
  const [busy,    setBusy]    = useState(false)
  const [confirm, setConfirm] = useState(false)

  useEffect(() => { if (open) { setForm(initial); setError(''); setBusy(false); setConfirm(false) } }, [open])

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

  const addLegend = () => setForm(prev => ({ ...prev, legend: [...prev.legend, { style: '', meaning: '' }] }))
  const removeLegend = (i: number) => setForm(prev => ({ ...prev, legend: prev.legend.filter((_, j) => j !== i) }))
  const setLegend = (i: number, key: keyof TemplateLegendRule, val: string) =>
    setForm(prev => ({
      ...prev,
      legend: prev.legend.map((l, j) => j === i ? { ...l, [key]: val } : l),
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

  const handleDelete = async () => {
    if (!onDelete) return
    setBusy(true)
    setError('')
    try {
      await onDelete()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
      setConfirm(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      // 38% wider than the 520px .modal-box default — the tab/group structure fields need the
      // room. The stylesheet's max-width: 92vw still caps this on narrow viewports.
      width={718}
      subtitle="Define the workbook structure the extraction engine uses to parse this Agent BB format."
      footer={confirm ? (
        <>
          <span style={{ marginRight: 'auto', fontSize: 11, color: 'var(--danger)', fontWeight: 600, lineHeight: 1.4 }}>
            Delete this template permanently, including its tab and group definitions?
          </span>
          <Button variant="secondary" onClick={() => setConfirm(false)} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} disabled={busy}>{busy ? 'Removing…' : 'Yes, Remove'}</Button>
        </>
      ) : (
        <>
          {onDelete && (
            <Button variant="danger" onClick={() => setConfirm(true)} disabled={busy} style={{ marginRight: 'auto' }}>
              Delete Template
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy}>{busy ? 'Saving…' : 'Save Template'}</Button>
        </>
      )}
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
                <span style={label}>Title Row</span>
                <input type="number" min={1} style={inp()} value={form.titleRow} onChange={e => set('titleRow', e.target.value)} placeholder="—" />
              </div>
              <div style={field()}>
                <span style={label}>Title Text</span>
                <input style={inp()} value={form.titleText} onChange={e => set('titleText', e.target.value)} placeholder="anchor text on the title row (e.g. Deal Name:)" />
              </div>
            </div>

            <div style={row}>
              <div style={field('110px')}>
                <span style={label}>Summary Rows</span>
                <input type="number" min={0} style={inp()} value={form.summaryRowsAboveHeader} onChange={e => set('summaryRowsAboveHeader', e.target.value)} />
              </div>
              <div style={field('140px')}>
                <span style={label}>Summary Row Range</span>
                <input style={inp()} value={form.summaryRowRange} onChange={e => set('summaryRowRange', e.target.value)} placeholder="e.g. 1-7" />
              </div>
            </div>

            <div style={row}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', paddingBottom: 2, flexWrap: 'wrap' }}>
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

        {/* ── Cell Colour Legend ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 4, marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Cell Colour Legend
            </span>
            <Button size="sm" variant="secondary" onClick={addLegend}>+ Add Rule</Button>
          </div>

          {form.legend.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
              No legend rules. Add one per colour or style the workbook uses to encode LP-level meaning.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {form.legend.map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    style={inp('190px')}
                    placeholder="Style (e.g. yellow fill)"
                    value={l.style}
                    onChange={e => setLegend(i, 'style', e.target.value)}
                  />
                  <input
                    style={inp()}
                    placeholder="Meaning (what the style encodes)"
                    value={l.meaning}
                    onChange={e => setLegend(i, 'meaning', e.target.value)}
                  />
                  <button
                    onClick={() => removeLegend(i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                    title="Remove rule"
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Notes ── */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border)', paddingBottom: 4, marginBottom: 10 }}>
            Notes
          </div>
          <textarea
            style={{ ...inp(), minHeight: 76, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="One note per line — extraction caveats, format quirks, provenance."
          />
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            One note per line. Notes are stored with the template and shown here only.
          </div>
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

// The API sends an absent range as "" rather than null, so emptiness is a trim check, not `?? `.
function summaryRangeLabel(t: BbTemplate): string {
  return t.summaryRowRange?.trim() ? t.summaryRowRange.trim() : '—'
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

  const [templates,  setTemplates]  = useState<BbTemplate[]>([])
  const [loading,    setLoading]    = useState(true)
  const [loadError,  setLoadError]  = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<BbTemplate | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const mutationDisabled = loadError != null

  // Sort accessors mirror what each cell renders, so the ordering matches what the analyst reads.
  // The numeric columns (Summary Rows, Header Row, Columns, Groups) return null wherever the cell
  // shows "—", which compareSortValues groups together at one end rather than scattering zeros
  // through the run. Summary Row Range is free text sent as "" when absent, so it trims to null.
  const sortColumns = useMemo(() => [
    { key: 'templateId', getValue: (t: BbTemplate) => t.templateSlug ?? t.templateName },
    { key: 'agent',      getValue: (t: BbTemplate) => t.agentName ?? t.templateName },
    { key: 'cls',        getValue: (t: BbTemplate) => t.templateClass },
    { key: 'tabs',       getValue: (t: BbTemplate) => workbookTabsLabel(t) },
    { key: 'tabLabel',   getValue: (t: BbTemplate) => tabLabel(t) },
    { key: 'summaryRows',  getValue: (t: BbTemplate) => t.summaryRowsAboveHeader || null },
    { key: 'summaryRange', getValue: (t: BbTemplate) => t.summaryRowRange?.trim() || null },
    { key: 'headerRow',  getValue: (t: BbTemplate) => primaryLpGrid(t)?.headerRowIndex ?? t.headerRowIndex ?? null },
    { key: 'headerCount', getValue: (t: BbTemplate) => headerCount(t) || null },
    { key: 'groups',     getValue: (t: BbTemplate) => groupCount(t) || null },
  ], [])
  const { sort, sortedRows, requestSort } = useSortableRows(templates, sortColumns)
  const { page, setPage, totalPages, total, pageItems, from, to, pageSize, setPageSize } = usePagination(sortedRows)
  // Key versioned: useColumnResize merges stored widths over these defaults, so anyone who already
  // dragged a column would otherwise keep the old, wider sizing forever.
  const { widths, onResizeStart, tableWidth } = useColumnResize('bb-templates-v2', BB_TEMPLATE_INITIAL_WIDTHS, '%')
  const pct = (w: number) => `${w}%`

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
    if (!editTarget) return
    const target = editTarget
    try {
      await api.bbTemplates.remove(target.id)
      setTemplates(prev => prev.filter(t => t.id !== target.id))
      toast(`Template "${target.templateName}" removed.`)
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
        subtitle="One row per Agent BB workbook format variant registered for extraction. Click a row to edit it."
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
            No templates registered. Use “↑ Upload Template” to import a BB template workbook, or “+ Add Template” to define one manually.
          </div>
        ) : (
          <>
            <div className="data-table-wrap" style={{ padding: '0 0 4px', scrollbarGutter: 'stable' }}>
              {/* table-layout: fixed — the resize handles set each column's width explicitly, so the
                  browser must honour those widths rather than re-fitting columns to their content. */}
              <table className="data-table bb-template-table" style={{ fontSize: 11, tableLayout: 'fixed', width: tableWidth }}>
                <thead>
                  <tr>
                    <SortableHeader sortKey="templateId"   sort={sort} onSort={requestSort} style={{ width: pct(widths.templateId) }} onResizeStart={onResizeStart}>Template ID</SortableHeader>
                    <SortableHeader sortKey="agent"        sort={sort} onSort={requestSort} style={{ width: pct(widths.agent) }}      onResizeStart={onResizeStart}>Agent / Fund</SortableHeader>
                    <SortableHeader sortKey="cls"          sort={sort} onSort={requestSort} style={{ width: pct(widths.cls) }}        onResizeStart={onResizeStart}>Class</SortableHeader>
                    <SortableHeader sortKey="tabs"         sort={sort} onSort={requestSort} style={{ width: pct(widths.tabs) }}       onResizeStart={onResizeStart}>Workbook Tabs</SortableHeader>
                    <SortableHeader sortKey="tabLabel"     sort={sort} onSort={requestSort} style={{ width: pct(widths.tabLabel) }}   onResizeStart={onResizeStart}>Sheet Name</SortableHeader>
                    <SortableHeader sortKey="summaryRows"  sort={sort} onSort={requestSort} style={{ width: pct(widths.summaryRows) }} onResizeStart={onResizeStart}>Summary Rows</SortableHeader>
                    <SortableHeader sortKey="summaryRange" sort={sort} onSort={requestSort} style={{ width: pct(widths.summaryRange) }} onResizeStart={onResizeStart}>Summary Row Range</SortableHeader>
                    <SortableHeader sortKey="headerRow"    sort={sort} onSort={requestSort} style={{ width: pct(widths.headerRow) }}  onResizeStart={onResizeStart}>Header Row</SortableHeader>
                    <SortableHeader sortKey="headerCount"  sort={sort} onSort={requestSort} style={{ width: pct(widths.headerCount) }} onResizeStart={onResizeStart}>Columns</SortableHeader>
                    <SortableHeader sortKey="groups"       sort={sort} onSort={requestSort} style={{ width: pct(widths.groups) }}      onResizeStart={onResizeStart}>Groups</SortableHeader>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map(t => {
                    const groups = groupCount(t)
                    return (
                      <tr
                        key={t.id}
                        className={editTarget?.id === t.id ? 'data-table-row-selected' : undefined}
                        style={{ cursor: mutationDisabled ? 'default' : 'pointer' }}
                        title={mutationDisabled ? undefined : 'Click to edit this template'}
                        onClick={() => { if (!mutationDisabled) setEditTarget(t) }}
                      >
                        <td style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <strong style={{ fontFamily: 'monospace' }}>{t.templateSlug ?? t.templateName}</strong>
                        </td>
                        <td style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.agentName ?? t.templateName}</td>
                        <td><ClassBadge cls={t.templateClass} /></td>
                        <td>{workbookTabsLabel(t)}</td>
                        <td title={tabLabel(t)} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{tabLabel(t)}</td>
                        <td style={{ fontFamily: 'monospace' }}>{t.summaryRowsAboveHeader || '—'}</td>
                        <td style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summaryRangeLabel(t)}</td>
                        <td style={{ fontFamily: 'monospace' }}>{headerRowLabel(t)}</td>
                        <td>{headerCount(t) || '—'}</td>
                        <td style={{ color: groups > 0 ? 'var(--navy)' : 'var(--muted)', fontWeight: groups > 0 ? 600 : 400 }}>
                          {groups || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="tbl-footer">
              <span>Showing {from}–{to} of {total} templates</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {total > 15 && (
                  <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)', color: 'var(--muted)' }}>
                    {PAGE_SIZE_OPTS.map(n => <option key={n} value={n}>{n} / page</option>)}
                  </select>
                )}
                {totalPages > 1 && (
                  <>
                    <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>‹ Prev</Button>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>Page {page} of {totalPages}</span>
                    <Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next ›</Button>
                  </>
                )}
              </div>
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

      {/* Edit modal — opened by clicking a registry row; Delete lives in its footer */}
      {editTarget && (
        <TemplateFormModal
          open={editTarget != null}
          title={`Edit Template — ${editTarget.templateName}`}
          initial={fromTemplate(editTarget)}
          onClose={() => setEditTarget(null)}
          onSave={handleEdit}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
