import { useState, useMemo, useEffect } from 'react'
import { usePagination, PAGE_SIZE_OPTS } from '../../hooks/usePagination'
import { SortableHeader, useSortableRows } from '../../hooks/useTableSort'
import { useColumnResize, type ColWidths } from '../../hooks/useColumnResize'
import { useApp }  from '../../context/AppContext'
import Button       from '../../components/ui/Button'
import Tag          from '../../components/ui/Tag'
import { getAuditLog } from '../../services/facilityService'
import { getAuditConfig, type AuditConfig } from '../../services/configService'
import type { AuditRow } from '../../services/facilityService'

const AUDIT_TRAIL_INITIAL_WIDTHS: ColWidths = {
  ts: 150,
  event: 160,
  detail: 520,
  facility: 260,
  user: 220,
  ip: 120,
}

const ellipsisCell = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

export default function AuditTrail() {
  const { toast } = useApp()
  const [auditLog,   setAuditLog]   = useState<AuditRow[]>([])
  const [search,     setSearch]     = useState('')
  const [evtFilter,  setEvtFilter]  = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [loadError,  setLoadError]  = useState<string | null>(null)
  const [auditCfg,   setAuditCfg]   = useState<AuditConfig | null>(null)

  useEffect(() => {
    setLoadError(null)
    const load = () => getAuditLog().then(setAuditLog).catch(e => setLoadError(String(e)))
    load()
    const interval = setInterval(load, 10_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    getAuditConfig()
      .then(setAuditCfg)
      .catch(e => setLoadError(String(e)))
  }, [])

  const rows = useMemo(() => {
    const q = search.toLowerCase()
    return auditLog.filter(r => {
      const matchQ   = !q || r.detail.toLowerCase().includes(q) || r.facility.toLowerCase().includes(q)
      const matchEvt = !evtFilter  || r.event === evtFilter
      const matchUsr = !userFilter || r.userId === userFilter
      return matchQ && matchEvt && matchUsr
    })
  }, [auditLog, search, evtFilter, userFilter])

  const users = Array.from(new Map(auditLog
    .filter(r => r.userId)
    .map(r => [r.userId, r.user])).entries())
  const sortColumns = useMemo(() => [
    { key: 'ts', getValue: (r: AuditRow) => r.ts },
    { key: 'event', getValue: (r: AuditRow) => r.event },
    { key: 'detail', getValue: (r: AuditRow) => r.detail },
    { key: 'facility', getValue: (r: AuditRow) => r.facility },
    { key: 'user', getValue: (r: AuditRow) => r.user },
    { key: 'ip', getValue: (r: AuditRow) => r.ip },
  ], [])
  const { sort, sortedRows, requestSort } = useSortableRows(rows, sortColumns)
  const { page, setPage, totalPages, total, pageItems, from, to, pageSize, setPageSize } = usePagination(sortedRows)
  const { widths, onResizeStart, tableWidth } = useColumnResize('audit-trail', AUDIT_TRAIL_INITIAL_WIDTHS)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--topbar-h))' }}>
      {loadError && <div style={{ padding: '10px 16px', background: '#fff0f0', color: 'var(--danger)', fontSize: 12 }}>API error — {loadError}</div>}
      <div className="filter-bar">
        <input type="text" placeholder="Search event detail, facility..." style={{ width: 280 }} value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ width: 180 }} value={evtFilter} onChange={e => setEvtFilter(e.target.value)}>
          {(auditCfg?.EVENT_TYPES ?? []).map(o => <option key={o} value={o}>{o || 'Event Type: All'}</option>)}
        </select>
        <select style={{ width: 160 }} value={userFilter} onChange={e => setUserFilter(e.target.value)}>
          <option value="">User: All</option>
          {users.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <label className="form-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>From</label>
          <input type="date" defaultValue={auditCfg?.DEFAULT_DATE_FROM ?? ''} style={{ width: 140 }} />
          <label className="form-label" style={{ marginBottom: 0, marginLeft: 6, whiteSpace: 'nowrap' }}>To</label>
          <input type="date" defaultValue={auditCfg?.DEFAULT_DATE_TO ?? ''} style={{ width: 140 }} />
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setEvtFilter(''); setUserFilter('') }}>Clear</Button>
        <Button variant="secondary" size="sm" onClick={() => toast('Audit log exported to Excel.')}>↓ Export</Button>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>{rows.length} of {auditLog.length} events</span>
      </div>
      <div className="data-table-wrap" style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table" style={{ tableLayout: 'fixed', width: tableWidth }}>
          <thead>
            <tr>
              <SortableHeader sortKey="ts" sort={sort} onSort={requestSort} style={{ width: widths.ts }} onResizeStart={onResizeStart}>Timestamp</SortableHeader>
              <SortableHeader sortKey="event" sort={sort} onSort={requestSort} style={{ width: widths.event }} onResizeStart={onResizeStart}>Event Type</SortableHeader>
              <SortableHeader sortKey="detail" sort={sort} onSort={requestSort} style={{ width: widths.detail }} onResizeStart={onResizeStart}>Detail</SortableHeader>
              <SortableHeader sortKey="facility" sort={sort} onSort={requestSort} style={{ width: widths.facility }} onResizeStart={onResizeStart}>Facility</SortableHeader>
              <SortableHeader sortKey="user" sort={sort} onSort={requestSort} style={{ width: widths.user }} onResizeStart={onResizeStart}>User</SortableHeader>
              <SortableHeader sortKey="ip" sort={sort} onSort={requestSort} style={{ width: widths.ip }} onResizeStart={onResizeStart}>IP Address</SortableHeader>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((r, i) => (
              <tr key={i}>
                <td title={r.ts} style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', fontSize: 11, ...ellipsisCell }}>{r.ts}</td>
                <td title={r.event} style={ellipsisCell}><Tag variant={auditCfg?.EVENT_TYPE_VARIANT[r.event] ?? ''}>{r.event}</Tag></td>
                <td title={r.detail} style={{ fontSize: 12, ...ellipsisCell }}>{r.detail}</td>
                <td title={r.facility} style={{ color: 'var(--muted)', fontSize: 12, ...ellipsisCell }}>{r.facility}</td>
                <td title={r.user} style={{ fontWeight: 600, fontSize: 12, ...ellipsisCell }}>{r.user}</td>
                <td title={r.ip} style={{ color: 'var(--muted)', fontSize: 11, fontVariantNumeric: 'tabular-nums', ...ellipsisCell }}>{r.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 12 }}>No events match the current filters.</div>}
        <div className="tbl-footer">
          <span>Showing {from}–{to} of {rows.length} events · Retention: {auditCfg?.AUDIT_RETENTION_LABEL ?? '—'}</span>
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
      </div>
    </div>
  )
}
