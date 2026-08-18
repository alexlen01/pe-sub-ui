import { useState, useMemo, useEffect } from 'react'
import { usePagination, PAGE_SIZE_OPTS } from '../../hooks/usePagination'
import { SortableHeader, useSortableRows } from '../../hooks/useTableSort'
import { useColumnResize } from '../../hooks/useColumnResize'
import { formatRegion } from '../../config/regionReference'
import { useApp } from '../../context/AppContext'
import Button from '../../components/ui/Button'
import Card   from '../../components/ui/Card'
import Tag    from '../../components/ui/Tag'
import InfoTip from '../../components/ui/InfoTip'
import DraggablePanel from '../../components/ui/DraggablePanel'
import LPMasterPanel, { type ParentOption } from '../../components/ui/LPMasterPanel'
import { getClassificationConfig, type ClassificationConfig } from '../../services/configService'
import { api, type LpMasterRecord, type LpMasterUpdate } from '../../services/api'
import { exportLpMasterRecords } from '../../services/lpExportService'
import { formatPercentageFraction } from '../../utils/percentage'
import { lpSizeFormat } from '../../utils/lpSize'

/**
 * Every row that sits at or below {@code rootId} in the hierarchy.
 *
 * Used to keep the sponsor picker honest: selecting a descendant as a parent would leave the chain
 * with no ultimate entity, and therefore no credit profile to apply to a matched upload row. The
 * API rejects it too — this just avoids offering the choice.
 */
export function descendantIds(rootId: number, rows: LpMasterRecord[]): Set<number> {
  const childrenOf = new Map<number, number[]>()
  for (const r of rows) {
    if (r.parentId == null) continue
    const siblings = childrenOf.get(r.parentId)
    if (siblings) siblings.push(r.id)
    else childrenOf.set(r.parentId, [r.id])
  }
  const out = new Set<number>([rootId])
  const stack = [rootId]
  while (stack.length > 0) {
    for (const child of childrenOf.get(stack.pop()!) ?? []) {
      if (out.has(child)) continue      // tolerate a cyclic row rather than spinning on it
      out.add(child)
      stack.push(child)
    }
  }
  return out
}

/**
 * The sponsor to display, or '' when the row has none.
 *
 * The LP Master feed writes a record's own name into `parent` to mean "no parent" — most rows carry
 * it. Rendering that as a sponsor would be wrong, and flagging it as an unlinked one doubly so, so
 * it collapses to "no parent" here. A genuinely unresolved sponsor is a different name that matched
 * no record, and that one *is* worth flagging.
 */
export function displayParent(r: Pick<LpMasterRecord, 'parent' | 'investorName'>): string {
  const parent = r.parent.trim()
  return parent === '' || parent === r.investorName.trim() ? '' : parent
}

/** True when a sponsor is named but resolves to no LP Master record — nothing is inherited. */
export function hasUnlinkedSponsor(r: Pick<LpMasterRecord, 'parent' | 'investorName' | 'parentId'>): boolean {
  return displayParent(r) !== '' && r.parentId == null
}

/**
 * True when the row names no sponsor and is therefore its own ultimate parent.
 *
 * Deliberately not `r.isUltimateParent`: the API derives that flag from `parentId`, so a row naming
 * a sponsor that is not yet on file carries `isUltimateParent === true` while still pointing at
 * someone. That row must read as its unresolved sponsor, never as "Self".
 */
export function isOwnUltimateParent(r: Pick<LpMasterRecord, 'parent' | 'investorName'>): boolean {
  return displayParent(r) === ''
}

/** Which measure a row's LP Size is expressed in. '' fields are absent, per the API's contract. */
export function sizeMeasureOf(r: LpMasterRecord): string {
  if (r.aum.trim()) return 'AUM'
  if (r.nav.trim()) return 'NAV'
  if (r.pensionAssets.trim()) return 'Assets'
  return ''
}

export function lpSizeOf(r: LpMasterRecord): string {
  return r.aum.trim() || r.nav.trim() || r.pensionAssets.trim() || ''
}

type HierarchyFilter = '' | 'ultimate' | 'feeder' | 'sponsor'

/**
 * The bank-wide LP Master store.
 *
 * Deliberately a sibling of the LP Records screen rather than a mode of it — same layout, filters
 * and right-docked edit panel, but a different subject. LP Records are per-facility outcomes;
 * these are the curated profiles that *feed* them, which is why the columns stop at the credit
 * profile and add the parent/child hierarchy instead of commitments and borrowing base.
 */
export default function LPMasterRecords() {
  const { toast, navigate, currentUser } = useApp()
  const canEdit = currentUser?.role === 'Analyst' || currentUser?.role === 'Account/Transaction Manager'

  const [rows,      setRows]      = useState<LpMasterRecord[]>([])
  const [classCfg,  setClassCfg]  = useState<ClassificationConfig | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading,   setLoading]   = useState(true)

  const [search,     setSearch]     = useState('')
  const [clsFilter,  setClsFilter]  = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [hierFilter, setHierFilter] = useState<HierarchyFilter>('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const load = () => {
    setLoading(true)
    return api.lpMaster.list()
      .then(r => { setRows(r); setLoadError(null) })
      .catch(e => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])
  useEffect(() => { getClassificationConfig().then(setClassCfg).catch(() => {}) }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return rows.filter(r => {
      // Search only what the table shows, so a hit is always visible in the row it matched.
      const matchQ = !q
        || r.investorName.toLowerCase().includes(q)
        || displayParent(r).toLowerCase().includes(q)
      const matchCls  = !clsFilter  || r.ubsLpCategory === clsFilter
      const matchType = !typeFilter || r.investorType === typeFilter
      const matchHier =
        hierFilter === ''         ? true
        : hierFilter === 'ultimate' ? r.isUltimateParent
        : hierFilter === 'feeder'   ? !r.isUltimateParent
        : r.childCount > 0
      return matchQ && matchCls && matchType && matchHier
    })
  }, [rows, search, clsFilter, typeFilter, hierFilter])

  const clsLegendItems = useMemo(() => {
    if (!classCfg) return []
    return classCfg.CLS_OPTS.filter(Boolean).map(cls => ({
      label: `${cls} - ${classCfg.BUSA_RATE_MAP[cls] ?? ''}`.trim(),
      desc: classCfg.CLS_CRITERIA[cls] ?? '',
    }))
  }, [classCfg])

  const sortColumns = useMemo(() => [
    { key: 'name',           getValue: (r: LpMasterRecord) => r.investorName },
    { key: 'parent',         getValue: (r: LpMasterRecord) => displayParent(r) },
    { key: 'children',       getValue: (r: LpMasterRecord) => r.childCount },
    { key: 'spv',            getValue: (r: LpMasterRecord) => r.spv ? 'Yes' : 'No' },
    { key: 'region',         getValue: (r: LpMasterRecord) => formatRegion(r.regionLocation) },
    { key: 'investorType',   getValue: (r: LpMasterRecord) => r.investorType },
    { key: 'instHnw',        getValue: (r: LpMasterRecord) => r.institutionalOrHnw },
    { key: 'cls',            getValue: (r: LpMasterRecord) => `${r.ubsLpCategory} ${r.investorName}` },
    { key: 'ig',             getValue: (r: LpMasterRecord) => r.investmentGrade ? 'Yes' : 'No' },
    { key: 'sp',             getValue: (r: LpMasterRecord) => r.spRating },
    { key: 'mdy',            getValue: (r: LpMasterRecord) => r.moodysRating },
    { key: 'fitch',          getValue: (r: LpMasterRecord) => r.fitchRating },
    { key: 'lpSize',         getValue: (r: LpMasterRecord) => lpSizeOf(r) },
    { key: 'sizeMeasure',    getValue: (r: LpMasterRecord) => sizeMeasureOf(r) },
    { key: 'fundingRatio',   getValue: (r: LpMasterRecord) => r.fundingRatio ?? null },
    { key: 'advRate',        getValue: (r: LpMasterRecord) => r.ubsDefaultAdvanceRate ?? null },
    { key: 'concLimit',      getValue: (r: LpMasterRecord) => r.ubsDefaultConcentrationLimit },
    { key: 'notes',          getValue: (r: LpMasterRecord) => r.notes },
  ], [])

  const { sort, sortedRows, requestSort } = useSortableRows(filtered, sortColumns, { key: 'name', direction: 'asc' })
  const { page, setPage, totalPages, total, pageItems, from, to, pageSize, setPageSize } = usePagination(sortedRows)
  // Keys are the column's sortKey — `SortableHeader` reports resizes under that name, so a width
  // parked under any other key can never be dragged. Every width is also floored at its own header
  // label's rendered width (11px bold Segoe UI in `.data-table.dense`) plus the 18px side padding
  // and the 13px sort indicator, so no label is ever ellipsis-truncated at the default sizing.
  const { widths, onResizeStart, tableWidth } = useColumnResize('lp-master-records-v2', {
    name: 230, parent: 180, children: 77, spv: 54,
    region: 140, investorType: 140, instHnw: 142, cls: 174, ig: 126,
    sp: 76, mdy: 84, fitch: 76, lpSize: 150, sizeMeasure: 110,
    fundingRatio: 118, advRate: 170, concLimit: 168, notes: 180,
  })

  const selected = selectedId == null ? null : rows.find(r => r.id === selectedId) ?? null

  // The picker offers every row except the selected one and its descendants.
  const parentOptions: ParentOption[] = useMemo(() => {
    const blocked = selected ? descendantIds(selected.id, rows) : new Set<number>()
    return rows
      .map(r => ({ id: r.id, investorName: r.investorName, selectable: !blocked.has(r.id) }))
      .sort((a, b) => a.investorName.localeCompare(b.investorName))
  }, [rows, selected?.id])

  const handleSave = async (id: number, body: LpMasterUpdate) => {
    try {
      const saved = await api.lpMaster.update(id, body)
      // A save can repoint other rows too — adopting pending children, or renaming a sponsor the
      // feeders display — so the list is refetched rather than patched in place.
      await load()
      setSelectedId(saved.id)
      toast(`LP Master record updated — ${saved.investorName}.`)
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : 'Could not save LP Master record — API unavailable.')
    }
  }

  const handleDelete = async (target: LpMasterRecord) => {
    try {
      await api.lpMaster.remove(target.id)
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : 'Could not delete LP Master record — API unavailable.')
      return
    }
    setSelectedId(null)
    await load()
    toast(`LP Master record deleted — ${target.investorName}.`)
  }

  // The whole lp_master store, not the filtered page: this is a copy of the table, and `rows`
  // already holds every record the screen loaded.
  const handleExport = () => {
    exportLpMasterRecords(rows)
    toast(`Exported ${rows.length.toLocaleString()} LP Master records to Excel.`)
  }

  const feederCount = rows.filter(r => !r.isUltimateParent).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--topbar-h))', padding: '16px 24px 24px', overflow: 'hidden' }}>
      <Card style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} bodyStyle={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="filter-bar" style={{ padding: '8px 18px' }}>
          <button
            onClick={() => navigate('lp-master')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 12, fontWeight: 600, padding: '0 4px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            &#x2190; Facilities
          </button>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>LP Master Records</span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>· bank-wide</span>
          <span style={{ color: 'var(--border)' }}>|</span>
          <input
            type="text"
            placeholder="Search LP name, parent…"
            style={{ width: 240 }}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
          <select style={{ width: 160 }} value={clsFilter} onChange={e => { setClsFilter(e.target.value); setPage(1) }}>
            {(classCfg?.CLS_OPTS ?? ['']).map(o => <option key={o} value={o}>{o || 'Classification: All'}</option>)}
          </select>
          <InfoTip title="LP Category" items={clsLegendItems} align="left" width={330} />
          <select style={{ width: 170 }} value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }}>
            <option value="">Investor Type: All</option>
            {(classCfg?.INVESTOR_TYPE_OPTS ?? []).filter(Boolean).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <select style={{ width: 180 }} value={hierFilter} onChange={e => { setHierFilter(e.target.value as HierarchyFilter); setPage(1) }}>
            <option value="">Hierarchy: All</option>
            <option value="ultimate">Ultimate entities</option>
            <option value="feeder">Feeders &amp; SPVs</option>
            <option value="sponsor">Sponsors (has children)</option>
          </select>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            disabled={rows.length === 0}
            title="Downloads every LP Master record, ignoring the filters above"
          >&#x2193; Export</Button>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
            {filtered.length} of {rows.length} LP Master records · {feederCount} feeders
          </span>
        </div>

        {loadError && (
          <div style={{ padding: '10px 18px', background: '#fff0f0', color: 'var(--danger)', fontSize: 12 }}>
            API error — {loadError}
          </div>
        )}

        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ height: '100%', minWidth: 0, overflowY: 'auto' }}>
            <div className="data-table-wrap">
              <table className="data-table dense" style={{ tableLayout: 'fixed', minWidth: tableWidth, width: tableWidth }}>
                <thead>
                  <tr>
                    <SortableHeader sortKey="name"           sort={sort} onSort={requestSort} style={{ width: widths.name }}            onResizeStart={onResizeStart}>Investor Name</SortableHeader>
                    <SortableHeader sortKey="parent"         sort={sort} onSort={requestSort} style={{ width: widths.parent }}          onResizeStart={onResizeStart}>Parent</SortableHeader>
                    <SortableHeader sortKey="children"       sort={sort} onSort={requestSort} className="num" style={{ width: widths.children }} onResizeStart={onResizeStart}>Children</SortableHeader>
                    <SortableHeader sortKey="spv"            sort={sort} onSort={requestSort} style={{ width: widths.spv }}             onResizeStart={onResizeStart}>SPV</SortableHeader>
                    <SortableHeader sortKey="region"         sort={sort} onSort={requestSort} style={{ width: widths.region }}          onResizeStart={onResizeStart}>Region / Location</SortableHeader>
                    <SortableHeader sortKey="investorType"   sort={sort} onSort={requestSort} style={{ width: widths.investorType }}    onResizeStart={onResizeStart}>Investor Type</SortableHeader>
                    <SortableHeader sortKey="instHnw"        sort={sort} onSort={requestSort} style={{ width: widths.instHnw }}         onResizeStart={onResizeStart}>Institutional vs HNW</SortableHeader>
                    <SortableHeader sortKey="cls"            sort={sort} onSort={requestSort} style={{ width: widths.cls }}   onResizeStart={onResizeStart}>UBS LP Classification</SortableHeader>
                    <SortableHeader sortKey="ig"             sort={sort} onSort={requestSort} style={{ width: widths.ig }} onResizeStart={onResizeStart}>Investment Grade</SortableHeader>
                    <SortableHeader sortKey="sp"             sort={sort} onSort={requestSort} style={{ width: widths.sp }}        onResizeStart={onResizeStart}>S&amp;P</SortableHeader>
                    <SortableHeader sortKey="mdy"            sort={sort} onSort={requestSort} style={{ width: widths.mdy }}    onResizeStart={onResizeStart}>Moody's</SortableHeader>
                    <SortableHeader sortKey="fitch"          sort={sort} onSort={requestSort} style={{ width: widths.fitch }}     onResizeStart={onResizeStart}>Fitch</SortableHeader>
                    <SortableHeader sortKey="lpSize"         sort={sort} onSort={requestSort} className="num" style={{ width: widths.lpSize }} onResizeStart={onResizeStart}>LP Size</SortableHeader>
                    <SortableHeader sortKey="sizeMeasure"    sort={sort} onSort={requestSort} style={{ width: widths.sizeMeasure }}     onResizeStart={onResizeStart}>Size Measure</SortableHeader>
                    <SortableHeader sortKey="fundingRatio"   sort={sort} onSort={requestSort} className="num" style={{ width: widths.fundingRatio }} onResizeStart={onResizeStart}>Funded Ratio</SortableHeader>
                    <SortableHeader sortKey="advRate"        sort={sort} onSort={requestSort} className="num" style={{ width: widths.advRate }}   onResizeStart={onResizeStart}>UBS Default Advance Rate</SortableHeader>
                    <SortableHeader sortKey="concLimit"      sort={sort} onSort={requestSort} className="num" style={{ width: widths.concLimit }} onResizeStart={onResizeStart}>UBS Default Conc. Limit</SortableHeader>
                    <SortableHeader sortKey="notes"          sort={sort} onSort={requestSort} style={{ width: widths.notes }}           onResizeStart={onResizeStart}>Notes</SortableHeader>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map(r => {
                    const measure = sizeMeasureOf(r)
                    const size    = lpSizeOf(r)
                    const sponsor = displayParent(r)
                    const ownUltimate = isOwnUltimateParent(r)
                    return (
                      <tr
                        key={r.id}
                        className={selectedId === r.id ? 'data-table-row-selected' : undefined}
                        onClick={() => setSelectedId(prev => prev === r.id ? null : r.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        {/* No SPV badge here — the SPV column already answers it, and a badge inside
                            an ellipsised cell clips to an unreadable fragment on long names. */}
                        <td title={r.investorName} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <strong>{r.investorName}</strong>
                        </td>
                        {/* One Parent column, not two: every chain in the data is a single hop, so a
                            separate "Ultimate Parent" duplicated this exactly. The ⚠ carries the only
                            fact that column added — a sponsor named but not linked, inheriting nothing.
                            No sponsor means the row is its own ultimate parent, so it reads "Self"
                            rather than the table's em dash: on roughly half these rows that dash said
                            "missing data" about a fact the record actually states. Wording matches the
                            panel's Ultimate Parent field. */}
                        <td title={ownUltimate ? 'Self — this is the ultimate entity' : sponsor} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--muted)' }}>
                          {ownUltimate ? <em style={{ opacity: .75 }}>Self</em> : sponsor}
                          {hasUnlinkedSponsor(r) && (
                            <span title="Sponsor is not an LP Master record — nothing is inherited from it" style={{ marginLeft: 4, color: 'var(--amber)', fontWeight: 700 }}>⚠</span>
                          )}
                        </td>
                        <td className="num">{r.childCount > 0 ? r.childCount : '—'}</td>
                        <td>{r.spv ? 'Yes' : 'No'}</td>
                        <td>{formatRegion(r.regionLocation) || '—'}</td>
                        <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.investorType || '—'}</td>
                        <td>{r.institutionalOrHnw || '—'}</td>
                        <td>{r.ubsLpCategory ? <Tag>{r.ubsLpCategory}</Tag> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                        <td>{r.investmentGrade ? 'Yes' : 'No'}</td>
                        <td>{r.spRating || '—'}</td>
                        <td>{r.moodysRating || '—'}</td>
                        <td>{r.fitchRating || '—'}</td>
                        <td className="num">{size ? lpSizeFormat(size) : '—'}</td>
                        <td>{measure || '—'}</td>
                        <td className="num">{r.fundingRatio == null ? '—' : formatPercentageFraction(r.fundingRatio)}</td>
                        <td className="num">{r.ubsDefaultAdvanceRate == null ? '—' : formatPercentageFraction(r.ubsDefaultAdvanceRate)}</td>
                        <td className="num">{r.ubsDefaultConcentrationLimit || '—'}</td>
                        <td title={r.notes} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.notes || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {!loading && rows.length === 0 && !loadError && (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '60px 0', fontSize: 13 }}>
                No LP Master records yet. They arrive from the LP Master ingest feed, and from accepted Shadow BB runs.
              </div>
            )}
            {!loading && rows.length > 0 && filtered.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '60px 0', fontSize: 13 }}>
                No LP Master records match the current filters.
              </div>
            )}

            <div className="tbl-footer">
              <span>Showing {from}–{to} of {filtered.length}</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {total > 15 && (
                  <select
                    value={pageSize}
                    onChange={e => setPageSize(Number(e.target.value))}
                    style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)', color: 'var(--muted)' }}
                  >
                    {PAGE_SIZE_OPTS.map(n => <option key={n} value={n}>{n} / page</option>)}
                  </select>
                )}
                {totalPages > 1 && (
                  <>
                    <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>&#x2039; Prev</Button>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>Page {page} of {totalPages}</span>
                    <Button size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next &#x203A;</Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {selected && (
        <DraggablePanel className="LPRecord-detail-overlay" storageKey="lp-master-records-detail">
          <LPMasterPanel
            record={selected}
            open={!!selected}
            onClose={() => setSelectedId(null)}
            onSave={handleSave}
            onDelete={canEdit ? handleDelete : undefined}
            canEdit={canEdit}
            parentOptions={parentOptions}
          />
        </DraggablePanel>
      )}
    </div>
  )
}
