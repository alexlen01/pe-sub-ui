import { useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'

export type SortDirection = 'asc' | 'desc'
export type SortValue = string | number | boolean | Date | null | undefined

export interface SortSpec {
  key: string
  direction: SortDirection
}

export interface SortColumn<T> {
  key: string
  getValue: (row: T) => SortValue
}

interface SortableHeaderProps {
  sortKey: string
  sort: SortSpec | null
  onSort: (key: string) => void
  children: ReactNode
  className?: string
  style?: CSSProperties
  title?: string
  onResizeStart?: (col: string, e: MouseEvent) => void
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function parseFormattedNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed || !/[0-9]/.test(trimmed)) return null
  if (/[a-z]/i.test(trimmed.replace(/[kmbt]/gi, ''))) return null

  const negative = trimmed.includes('–') || trimmed.includes('-') || /^\(.*\)$/.test(trimmed)
  const cleaned = trimmed.replace(/[,$%\s()–-]/g, '')
  const match = cleaned.match(/^(\d+(?:\.\d+)?)([KMBT])?$/i)
  if (!match) return null

  const multiplier = { K: 1e3, M: 1e6, B: 1e9, T: 1e12, '': 1 }[match[2]?.toUpperCase() ?? ''] ?? 1
  const parsed = parseFloat(match[1]) * multiplier
  return negative ? -parsed : parsed
}

function normalize(value: SortValue): string | number | boolean | null {
  if (value == null || value === '') return null
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number' || typeof value === 'boolean') return value
  const formatted = parseFormattedNumber(value)
  return formatted ?? value.toLowerCase()
}

export function compareSortValues(a: SortValue, b: SortValue): number {
  const av = normalize(a)
  const bv = normalize(b)
  if (av == null && bv == null) return 0
  if (av == null) return 1
  if (bv == null) return -1
  if (typeof av === 'number' && typeof bv === 'number') return av - bv
  if (typeof av === 'boolean' && typeof bv === 'boolean') return Number(av) - Number(bv)
  return collator.compare(String(av), String(bv))
}

export function sortRows<T>(rows: T[], columns: SortColumn<T>[], sort: SortSpec | null): T[] {
  if (!sort) return rows
  const column = columns.find(c => c.key === sort.key)
  if (!column) return rows
  const direction = sort.direction === 'asc' ? 1 : -1
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const result = compareSortValues(column.getValue(a.row), column.getValue(b.row))
      return result === 0 ? a.index - b.index : result * direction
    })
    .map(({ row }) => row)
}

export function useSortableRows<T>(
  rows: T[],
  columns: SortColumn<T>[],
  initialSort: SortSpec | null = null,
) {
  const [sort, setSort] = useState<SortSpec | null>(initialSort)
  const sortedRows = useMemo(() => sortRows(rows, columns, sort), [rows, columns, sort])

  const requestSort = (key: string) => {
    setSort(prev => {
      if (prev?.key !== key) return { key, direction: 'asc' }
      if (prev.direction === 'asc') return { key, direction: 'desc' }
      return null
    })
  }

  return { sort, setSort, sortedRows, requestSort }
}

export function SortableHeader({ sortKey, sort, onSort, children, className, style, title, onResizeStart }: SortableHeaderProps) {
  const active = sort?.key === sortKey
  const ariaSort = active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
  return (
    <th
      className={['sortable-th', active ? 'sortable-th-active' : '', className ?? ''].filter(Boolean).join(' ')}
      style={{ position: 'relative', ...style }}
      // A narrow column now ellipsis-truncates its label, so fall back to the label itself as the
      // hover tooltip — otherwise a clipped header has no way to reveal its full text.
      title={title ?? (typeof children === 'string' ? children : undefined)}
      aria-sort={ariaSort}
      tabIndex={0}
      onClick={() => onSort(sortKey)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSort(sortKey)
        }
      }}
    >
      <span className="sortable-th-label">
        <span>{children}</span>
        <span className="sortable-th-indicator">{active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}</span>
      </span>
      {onResizeStart && (
        <span
          className="col-resize-handle"
          onMouseDown={e => { e.stopPropagation(); onResizeStart(sortKey, e) }}
          onClick={e => e.stopPropagation()}
        />
      )}
    </th>
  )
}
