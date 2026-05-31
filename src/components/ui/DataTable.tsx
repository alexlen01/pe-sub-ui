import { useState, useEffect, type ReactNode } from 'react'
import Button from './Button'

const PAGE_SIZE_OPTS = [15, 20, 25]

export interface Column<T> {
  key: string
  label: string
  align?: string
  style?: React.CSSProperties
  render?: (row: T) => ReactNode
  neg?: (row: T) => boolean
  zero?: (row: T) => boolean
  bold?: (row: T) => boolean
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  onRowClick?: (row: T) => void
  footer?: ReactNode
  selectedRow?: T | null
}

export default function DataTable<T>({ columns, rows, onRowClick, footer, selectedRow }: DataTableProps<T>) {
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(15)
  useEffect(() => { setPage(1) }, [rows])
  useEffect(() => { setPage(1) }, [pageSize])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const p     = Math.min(page, totalPages)
  const start = (p - 1) * pageSize
  const pageRows = rows.slice(start, start + pageSize)
  const from = rows.length === 0 ? 0 : start + 1
  const to   = Math.min(start + pageSize, rows.length)

  return (
    <div className="data-table-wrap">
      <table className="data-table" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} className={col.align === 'right' ? 'num' : ''} style={col.style}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pageRows.map((row, i) => (
            <tr
              key={((row as { id?: string | number }).id) ?? i}
              onClick={() => onRowClick?.(row)}
              style={{ ...(onRowClick ? { cursor: 'pointer' } : {}), ...(selectedRow === row ? { background: 'var(--blue-lt)' } : {}) }}
            >
              {columns.map(col => {
                const val = col.render ? col.render(row) : (row as Record<string, unknown>)[col.key] as ReactNode
                return (
                  <td key={col.key} className={[col.align === 'right' ? 'num' : '', col.neg?.(row) ? 'neg' : '', col.zero?.(row) ? 'zero' : '', col.bold?.(row) ? 'bold' : ''].filter(Boolean).join(' ')}>
                    {val}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tbl-footer">
        {footer ?? <span>{rows.length === 0 ? 'No results' : `Showing ${from}–${to} of ${rows.length}`}</span>}
        {rows.length > 15 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)', color: 'var(--muted)' }}>
              {PAGE_SIZE_OPTS.map(n => <option key={n} value={n}>{n} / page</option>)}
            </select>
            {totalPages > 1 && (
              <>
                <Button variant="secondary" size="sm" disabled={p === 1} onClick={() => setPage(p - 1)}>‹ Prev</Button>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Page {p} of {totalPages}</span>
                <Button variant="secondary" size="sm" disabled={p === totalPages} onClick={() => setPage(p + 1)}>Next ›</Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
