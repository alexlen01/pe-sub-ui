import { useState, useEffect, useRef, startTransition } from 'react'
import { usePagination, PAGE_SIZE_OPTS } from '../../hooks/usePagination'
import { useApp } from '../../context/AppContext'
import StepBar from '../../components/ui/StepBar'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Tag from '../../components/ui/Tag'
import Modal from '../../components/ui/Modal'
import { getExtractedLPs, getExtractionFieldMap, getDocRecognition, getUnrecognizedColumns, getAllCanonicalFields, type DocRecognitionRow, type UnrecognizedColumn } from '../../services/extractionService'
import { getTemplateProfiles, getTemplateProfile, detectTemplate, buildDocRecognition, type MappedColumn } from '../../services/templateService'
import { api } from '../../services/api'
import { WIZARD_STEPS } from '../../config/wizardConfig'

type FieldMapRow = Awaited<ReturnType<typeof getExtractionFieldMap>>[0]
type CanonicalField = Awaited<ReturnType<typeof getAllCanonicalFields>>[0]

// Extracted Agent-BB row after BB-field enrichment. All cells render as display strings;
// the engine supplies them per the canonical LP_FIELDS keys below.
interface ExtractedRow {
  id: number
  name: string
  transferee?: boolean
  agentClass?: string
  commit?: string
  uncalled?: string
  pctCalledFmt?: string
  aum?: string
  nav?: string
  sp?: string
  moodys?: string
  fitch?: string
  agentRate?: string
  agentConc?: string
  agentBBFmt?: string
  pctBBFmt?: string
}
type UnrecogRow = UnrecognizedColumn & { suggestedCanonical: string; dismissed: boolean }

// Order mirrors the Extracted LP Data table columns. `extracted` is the join key
// into the canonical field map; `label` (when present) is the display override.
// Transferee is intentionally not a field here — it is surfaced as a marker next
// to the investor name (see LPDetailPanel header and the table's name cell).
// `canonical` (optional) overrides the field-map lookup — used for derived fields
// such as % Called, which is computed from extracted columns rather than matched
// from a source column, yet still maps to a canonical LP Master field.
const LP_FIELDS: { key: string; extracted: string; label?: string; canonical?: string }[] = [
  { key: 'name',       extracted: 'Investor Name (Agent Records)'                                    },
  { key: 'parent',     extracted: 'Parent / Sponsor'                                                 },
  { key: 'agentClass', extracted: 'LP Classification', label: 'Agent LP Classification'                                                },
  { key: 'commit',     extracted: 'Commitment (USD)',       label: 'Original Commitment'             },
  { key: 'uncalled',   extracted: 'Uncalled Capital (USD)', label: 'Unfunded Capital Commitment'     },
  { key: 'pctCalledFmt', extracted: '% Called', label: '% Called (derived)', canonical: 'Uncalled Data - % of LP Called' },
  { key: 'aum',        extracted: 'AUM'                                                              },
  { key: 'nav',        extracted: 'NAV',                    label: 'Net Assets (range)'              },
  { key: 'sp',         extracted: 'S&P'                                                              },
  { key: 'moodys',     extracted: "Moody's"                                                          },
  { key: 'fitch',      extracted: 'Fitch'                                                            },
  { key: 'agentRate',  extracted: 'Advance Rate'                                                     },
  { key: 'agentConc',  extracted: 'Concentration Limit'                                              },
  { key: 'agentBBFmt', extracted: 'Borrowing Base Contribution'                                      },
  { key: 'pctBBFmt',   extracted: '% of Borrowing Base'                                              },
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
  Bank: { background: '#e8f0fb',         color: 'var(--blue)',  fontWeight: 600      },
  User: { background: 'var(--amber-lt)', color: 'var(--amber)', fontWeight: 600      },
}

// Extracted LP Data header cells wrap onto two lines (the global `.data-table th`
// rule forces nowrap, so each th overrides it inline via HDR).
const HDR: React.CSSProperties = { whiteSpace: 'normal', verticalAlign: 'middle', lineHeight: 1.25 }

// Sum of explicit <th> widths (240+92+100+104+72+64+78+48+60+54+80+96+86+74=1248)
// + 12px gap + 360px detail panel.
const SIDE_BY_SIDE_MIN = 1620

function LPDetailPanel({
  row, onClose, fieldMap, overlay = false,
}: {
  row: ExtractedRow
  onClose: () => void
  fieldMap: FieldMapRow[]
  overlay?: boolean
}) {
  return (
    <div
      className={overlay ? 'lp-detail-overlay' : undefined}
      style={overlay ? undefined : {
        width: 360, flexShrink: 0,
        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        display: 'flex', flexDirection: 'column', background: 'var(--card)',
      }}
    >
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>Row #{row.id} — Field Detail</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{row.name}{row.transferee ? <TransfereeMark /> : null}</div>
        </div>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--muted)', lineHeight: 1, padding: 2 }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {LP_FIELDS.map(({ key, extracted, label, canonical }, i) => {
            const mapping = fieldMap.find(m => m.extracted === extracted)
            const canonicalField = canonical ?? mapping?.canonical
            const value = (row as unknown as Record<string, unknown>)[key] as string | undefined
            return (
              <div key={key} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--card)' : 'var(--tbl)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', fontFamily: 'monospace' }}>{label ?? extracted}</div>
                    {canonicalField && <div style={{ fontSize: 10, color: 'var(--blue)', marginTop: 2 }}>→ {canonicalField}</div>}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: !value ? 'var(--muted)' : 'var(--navy)', whiteSpace: 'nowrap' }}>{value || '—'}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const CollapseBtn = ({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) => (
  <button onClick={onToggle} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: 'var(--muted)', cursor: 'pointer' }}>
    {collapsed ? '▸ Show' : '▾ Hide'}
  </button>
)

export default function ExtractionPreview() {
  const { navigate, toast, activeSubmission, activeSubmissionId, abortSubmission } = useApp()
  const [extracted,      setExtracted]    = useState<ExtractedRow[]>([])
  const [fieldMap,       setFieldMap]     = useState<FieldMapRow[]>([])
  const [docRec,         setDocRec]       = useState<DocRecognitionRow[]>([])
  const [canonicals,     setCanonicals]   = useState<CanonicalField[]>([])
  const [confirmed,      setConfirmed]    = useState(false)
  const [abortOpen,      setAbortOpen]    = useState(false)
  const [selectedLPId,   setSelectedLPId] = useState<number | null>(null)
  const [docCollapsed,   setDocCollapsed] = useState(false)
  const [mapCollapsed,   setMapCollapsed] = useState(false)
  const [loadError,      setLoadError]    = useState<string | null>(null)
  const [remapping,      setRemapping]    = useState<Set<string>>(new Set())
  const [containerWidth, setContainerWidth] = useState(Infinity)
  const [unrecog,        setUnrecog]      = useState<UnrecogRow[]>([])
  const [profileId,      setProfileId]    = useState<string>(
    () => detectTemplate({ facility: activeSubmission ?? undefined }).id
  )

  const layoutRef = useRef<HTMLDivElement>(null)

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
    } catch (e) {
      setLoadError(String(e))
    }
  }

  useEffect(() => {
    if (activeSubmissionId == null) {
      setLoadError('No active submission — please start from the upload step.')
      return
    }
    setLoadError(null)
    loadData(activeSubmissionId)
  }, [activeSubmissionId])

  useEffect(() => {
    const el = layoutRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { page, setPage, totalPages, pageItems, from, to, pageSize, setPageSize } = usePagination(extracted)

  const selectedLP    = selectedLPId ? extracted.find(r => r.id === selectedLPId) ?? null : null
  const activeUnrecog = unrecog.filter(c => !c.dismissed)
  const useOverlay    = containerWidth < SIDE_BY_SIDE_MIN

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
      {loadError && <div style={{ margin: '8px 16px 0', padding: '10px 14px', background: '#fff0f0', color: 'var(--red)', borderRadius: 6, fontSize: 12 }}>API error — {loadError}</div>}
      <StepBar steps={WIZARD_STEPS} current={2} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 40px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        <Card
          title="Document Recognition"
          subtitle={`Borrowing-base tables identified by the extraction engine · ${profile.fund}`}
          action={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Format</label>
              <select
                value={profileId}
                onChange={e => setProfileId(e.target.value)}
                title="Recognised Agent BB format"
                style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', background: 'var(--card)', color: 'var(--text)' }}
              >
                {getTemplateProfiles().map(p => <option key={p.id} value={p.id}>{p.fund}</option>)}
              </select>
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

            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Column headers ({colsMatched}/{displayCols.length} mapped to canonical LP fields)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {displayCols.map(({ header, mapping }) => (
                  <span
                    key={header}
                    title={mapping ? `→ ${mapping.group} › ${mapping.canonical}` : 'No canonical mapping — routes to “Unmatched — action required”'}
                    style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 10, fontFamily: 'monospace',
                      border: `1px solid ${mapping ? 'var(--blue)' : 'var(--red)'}`,
                      background: mapping ? '#e8f0fb' : '#fff5f5',
                      color: mapping ? 'var(--blue)' : 'var(--red)',
                    }}
                  >
                    {header}{mapping ? '' : ' ⚠'}
                  </span>
                ))}
              </div>
            </div>

            {profile.legend && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  Legend — cell formatting captured as LP flags
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <tbody>
                    {profile.legend.map(({ style, meaning }) => (
                      <tr key={style}>
                        <td style={{ padding: '4px 10px', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap', width: 150 }}>{style}</td>
                        <td style={{ padding: '4px 10px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>{meaning}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>✓ Matched</div>
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
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', margin: '12px 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>⚠ Unmatched — action required</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ background: '#fff5f5' }}>{['Extracted Column','Reason','Map To',''].map(h => <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--red)', borderBottom: '1px solid var(--border)', fontSize: 11 }}>{h}</th>)}</tr></thead>
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

        {/* LP data table + detail panel — layout switches based on available width */}
        <div
          ref={layoutRef}
          style={useOverlay ? undefined : { display: 'flex', gap: 12, alignItems: 'flex-start' }}
        >
          <Card
            title={`Extracted LP Data — ${extracted.length} Records`}
            subtitle={
              selectedLP
                ? useOverlay
                  ? `Row #${selectedLP.id} selected — click × to close detail`
                  : `Row #${selectedLP.id} selected`
                : 'Click any row to review extracted fields'
            }
            style={useOverlay ? undefined : { flex: 1, minWidth: 0 }}
            action={<div style={{ display: 'flex', gap: 8 }}><Button variant="danger" size="sm" onClick={() => setAbortOpen(true)}>Abort Submission</Button><Button size="sm" onClick={handleConfirm} disabled={confirmed}>{confirmed ? 'Running matching...' : 'Confirm & Run LP Matching'}</Button></div>}
          >
            {/* position:relative here anchors the overlay to the table rows, not the footer */}
            <div style={{ position: 'relative' }}>
              <table className="data-table" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th style={{ ...HDR, width: 240 }}>Investor Name</th>
                    <th style={{ ...HDR, width: 142 }}>LP Classification</th>
                    <th style={{ ...HDR, width: 100, textAlign: 'right' }}>Commitment (USD)</th>
                    <th style={{ ...HDR, width: 120, textAlign: 'right' }}>Uncalled Capital (USD)</th>
                    <th style={{ ...HDR, width: 72, textAlign: 'right' }}>% Called</th>
                    <th style={{ ...HDR, width: 54, textAlign: 'right' }}>AUM</th>
                    <th style={{ ...HDR, width: 78, textAlign: 'right' }}>NAV</th>
                    <th style={{ ...HDR, width: 48, textAlign: 'center' }}>S&P</th>
                    <th style={{ ...HDR, width: 60, textAlign: 'center' }}>Moody's</th>
                    <th style={{ ...HDR, width: 70, textAlign: 'right' }}>Advance Rate</th>
                    <th style={{ ...HDR, width: 86, textAlign: 'right' }}>Concentration Limit</th>
                    <th style={{ ...HDR, width: 86, textAlign: 'right' }}>Borrowing Base</th>
                    <th style={{ ...HDR, width: 74, textAlign: 'right', paddingRight: 20 }}>% of BB</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map(r => (
                    <tr key={r.id} onClick={() => setSelectedLPId(prev => prev === r.id ? null : r.id)} style={{ cursor: 'pointer', background: selectedLPId === r.id ? 'var(--blue-lt)' : undefined }}>
                      <td><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} title={r.transferee ? `${r.name} (transferee)` : r.name}>{r.name}{r.transferee ? <TransfereeMark /> : null}</div></td>
                      <td style={{ fontSize: 11, color: 'var(--muted)' }}>{r.agentClass}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>{r.commit}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>{r.uncalled}</td>
                      <td style={{ textAlign: 'right', fontSize: 11, color: !r.pctCalledFmt ? 'var(--muted)' : undefined }}>{r.pctCalledFmt || '—'}</td>
                      <td style={{ textAlign: 'right', fontSize: 11, color: !r.aum ? 'var(--muted)' : undefined }}>{r.aum || '—'}</td>
                      <td style={{ textAlign: 'right', fontSize: 11, color: !r.nav ? 'var(--muted)' : undefined }}>{r.nav || '—'}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, fontSize: 11, color: r.sp ? 'var(--navy)' : 'var(--muted)' }}>{r.sp || '—'}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, fontSize: 11, color: r.moodys ? 'var(--navy)' : 'var(--muted)' }}>{r.moodys || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: !r.agentRate ? 'var(--muted)' : r.agentRate === '0%' ? 'var(--red)' : 'var(--text)' }}>{r.agentRate || '—'}</td>
                      <td style={{ textAlign: 'right', fontSize: 11 }}>{r.agentConc}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: !r.agentBBFmt ? 'var(--muted)' : undefined }}>{r.agentBBFmt || '—'}</td>
                      <td style={{ textAlign: 'right', fontSize: 11, paddingRight: 20, color: !r.pctBBFmt ? 'var(--muted)' : undefined }}>{r.pctBBFmt || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {useOverlay && selectedLP && (
                <LPDetailPanel
                  row={selectedLP}
                  onClose={() => setSelectedLPId(null)}
                  fieldMap={fieldMap}
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

          {!useOverlay && (
            selectedLP ? (
              <LPDetailPanel row={selectedLP} onClose={() => setSelectedLPId(null)} fieldMap={fieldMap} />
            ) : (
              <div style={{ width: 360, flexShrink: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--tbl)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24, color: 'var(--muted)', textAlign: 'center' }}>
                <div style={{ fontSize: 22, opacity: 0.35 }}>☰</div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>Row Detail</div>
                <div style={{ fontSize: 11, lineHeight: 1.5 }}>Click any row to see extracted field values and their canonical mappings.</div>
              </div>
            )
          )}
        </div>

      </div>
    </div>

    <Modal open={abortOpen} onClose={() => setAbortOpen(false)} title="Abort Submission?" subtitle="This will permanently remove the submission from history."
      footer={<><Button variant="secondary" onClick={() => setAbortOpen(false)}>Keep Working</Button><Button variant="danger" onClick={handleAbort}>Abort Submission</Button></>}>
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>Aborting at this stage is safe — no LP records have been added or updated yet. If you need to reprocess this Agent BB, upload it again.</div>
    </Modal>
    </>
  )
}
