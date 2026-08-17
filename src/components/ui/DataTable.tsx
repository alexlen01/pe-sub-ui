import { useState, useEffect, useMemo, type ReactNode } from 'react'
import Button from './Button'
import { SortableHeader, useSortableRows, type SortValue } from '../../hooks/useTableSort'
import { useColumnResize, type ColWidths } from '../../hooks/useColumnResize'
import { PAGE_SIZE_OPTS } from '../../hooks/usePagination'

export interface Column<T> {
  key: string
  label: string
  align?: string
  style?: React.CSSProperties
  render?: (row: T) => ReactNode
  sortValue?: (row: T) => SortValue
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
  resizableStorageKey?: string
  initialWidths?: ColWidths
  keyboardNavigation?: boolean
  tableLayout?: 'fixed' | 'auto'
  widthUnit?: 'px' | '%'
  /**
   * Pixel floor for the whole table, for `widthUnit="%"` tables. A share-based column shrinks with
   * its container, so on a narrow window every header ends up narrower than its own label and gets
   * ellipsis-truncated. Below this width the wrapper scrolls horizontally instead. It has to be an
   * inline style rather than a CSS rule, because the table's own width/minWidth are inline.
   */
  minTableWidth?: number
  /** Rows per page before the user picks another size from the footer select. */
  initialPageSize?: number
}

export default function DataTable<T>({ columns, rows, onRowClick, footer, selectedRow, resizableStorageKey, initialWidths, keyboardNavigation = false, tableLayout = 'fixed', widthUnit = 'px', minTableWidth, initialPageSize = 15 }: DataTableProps<T>) {
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const resizeInitial = useMemo(() => initialWidths ?? {}, [initialWidths])
  const { widths, onResizeStart, tableWidth } = useColumnResize(resizableStorageKey ?? 'data-table', resizeInitial, widthUnit)
  const resizable = Boolean(resizableStorageKey && initialWidths)
  const sortColumns = useMemo(() => columns.map(col => ({
    key: col.key,
    getValue: (row: T) => col.sortValue ? col.sortValue(row) : (row as Record<string, SortValue>)[col.key],
  })), [columns])
  const { sort, sortedRows, requestSort } = useSortableRows(rows, sortColumns)

  useEffect(() => { setPage(1) }, [sortedRows])
  useEffect(() => { setPage(1) }, [pageSize])

  useEffect(() => {
    if (!keyboardNavigation || !onRowClick) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const target = e.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName))) return
      if (sortedRows.length === 0) return

      e.preventDefault()
      const current = selectedRow ? sortedRows.indexOf(selectedRow) : -1
      const next =
        e.key === 'ArrowDown'
          ? Math.min(sortedRows.length - 1, current < 0 ? 0 : current + 1)
          : Math.max(0, current < 0 ? sortedRows.length - 1 : current - 1)
      onRowClick(sortedRows[next])
      setPage(Math.floor(next / pageSize) + 1)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [keyboardNavigation, onRowClick, pageSize, selectedRow, sortedRows])

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize))
  const p     = Math.min(page, totalPages)
  const start = (p - 1) * pageSize
  const pageRows = sortedRows.slice(start, start + pageSize)
  const from = sortedRows.length === 0 ? 0 : start + 1
  const to   = Math.min(start + pageSize, sortedRows.length)

  const getColumnStyle = (col: Column<T>) => {
    const width = resizable ? (widths[col.key] ?? resizeInitial[col.key]) : undefined
    const widthValue = typeof width === 'number' ? `${width}%` : width
    return {
      ...col.style,
      ...(widthValue != null ? { width: widthValue, minWidth: widthValue, maxWidth: widthValue, boxSizing: 'border-box' as const } : {}),
    }
  }

  return (
    <div className="data-table-wrap">
      <table className="data-table" style={{ tableLayout, ...(resizable ? { width: tableWidth, minWidth: tableWidth } : {}), ...(minTableWidth != null ? { minWidth: minTableWidth } : {}) }}>
        <thead>
          <tr>
            {columns.map(col => (
              <SortableHeader
                key={col.key}
                sortKey={col.key}
                sort={sort}
                onSort={requestSort}
                className={col.align === 'right' ? 'num' : ''}
                style={getColumnStyle(col)}
                onResizeStart={resizable ? onResizeStart : undefined}
              >
                {col.label}
              </SortableHeader>
            ))}
          </tr>
        </thead>
        <tbody>
          {pageRows.map((row, i) => (
            <tr
              key={((row as { id?: string | number }).id) ?? i}
              className={selectedRow === row ? 'data-table-row-selected' : undefined}
              onClick={() => onRowClick?.(row)}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
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
        {footer ?? <span>{sortedRows.length === 0 ? 'No results' : `Showing ${from}–${to} of ${sortedRows.length}`}</span>}
        {sortedRows.length > 15 && (
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
