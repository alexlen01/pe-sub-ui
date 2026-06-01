import { useState, useMemo, useEffect } from 'react'
import { usePagination, PAGE_SIZE_OPTS } from '../../hooks/usePagination'
import { useApp }  from '../../context/AppContext'
import Button       from '../../components/ui/Button'
import Tag          from '../../components/ui/Tag'
import { getAuditLog } from '../../services/facilityService'
import { EVENT_TYPES, EVENT_TYPE_VARIANT, AUDIT_RETENTION_LABEL, DEFAULT_DATE_FROM, DEFAULT_DATE_TO } from '../../config/auditConfig'
import type { AuditRow } from '../../services/facilityService'

export default function AuditTrail() {
  const { toast } = useApp()
  const [auditLog,   setAuditLog]   = useState<AuditRow[]>([])
  const [search,     setSearch]     = useState('')
  const [evtFilter,  setEvtFilter]  = useState('')
  const [userFilter, setUserFilter] = useState('')

  useEffect(() => {
    const load = () => getAuditLog().then(setAuditLog)
    load()
    const interval = setInterval(load, 10_000)
    return () => clearInterval(interval)
  }, [])

  const rows = useMemo(() => {
    const q = search.toLowerCase()
    return auditLog.filter(r => {
      const matchQ   = !q || r.detail.toLowerCase().includes(q) || r.facility.toLowerCase().includes(q)
      const matchEvt = !evtFilter  || r.event === evtFilter
      const matchUsr = !userFilter || r.user  === userFilter
      return matchQ && matchEvt && matchUsr
    })
  }, [auditLog, search, evtFilter, userFilter])

  const users = [...new Set(auditLog.map(r => r.user).filter(Boolean))]
  const { page, setPage, totalPages, pageItems, from, to, pageSize, setPageSize } = usePagination(rows)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--topbar-h))' }}>
      <div className="filter-bar">
        <input type="text" placeholder="Search event detail, facility..." style={{ width: 280 }} value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ width: 180 }} value={evtFilter} onChange={e => setEvtFilter(e.target.value)}>
          {EVENT_TYPES.map(o => <option key={o} value={o}>{o || 'Event Type: All'}</option>)}
        </select>
        <select style={{ width: 160 }} value={userFilter} onChange={e => setUserFilter(e.target.value)}>
          <option value="">User: All</option>
          {users.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <label className="form-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>From</label>
          <input type="date" defaultValue={DEFAULT_DATE_FROM} style={{ width: 140 }} />
          <label className="form-label" style={{ marginBottom: 0, marginLeft: 6, whiteSpace: 'nowrap' }}>To</label>
          <input type="date" defaultValue={DEFAULT_DATE_TO} style={{ width: 140 }} />
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setEvtFilter(''); setUserFilter('') }}>Clear</Button>
        <Button variant="secondary" size="sm" onClick={() => toast('Audit log exported to Excel.')}>↓ Export</Button>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>{rows.length} of {auditLog.length} events</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 140 }}>Timestamp</th>
              <th style={{ width: 150 }}>Event Type</th>
              <th>Detail</th>
              <th style={{ width: 180 }}>Facility</th>
              <th style={{ width: 100 }}>User</th>
              <th style={{ width: 100 }}>IP Address</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((r, i) => (
              <tr key={i}>
                <td style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>{r.ts}</td>
                <td><Tag variant={EVENT_TYPE_VARIANT[r.event] ?? ''}>{r.event}</Tag></td>
                <td style={{ fontSize: 12 }}>{r.detail}</td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>{r.facility}</td>
                <td style={{ fontWeight: 600, fontSize: 12 }}>{r.user}</td>
                <td style={{ color: 'var(--muted)', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{r.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 12 }}>No events match the current filters.</div>}
        <div className="tbl-footer">
          <span>Showing {from}–{to} of {rows.length} events · Retention: {AUDIT_RETENTION_LABEL}</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)', color: 'var(--muted)' }}>
              {PAGE_SIZE_OPTS.map(n => <option key={n} value={n}>{n} / page</option>)}
            </select>
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
