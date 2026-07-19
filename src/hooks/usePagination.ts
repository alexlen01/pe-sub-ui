import { useState, useEffect } from 'react'

export const PAGE_SIZE = 15
export const PAGE_SIZE_OPTS = [15, 30, 50, 100, 500]

export function usePagination<T>(items: T[], initialPageSize = PAGE_SIZE) {
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)

  useEffect(() => { setPage(1) }, [items])
  useEffect(() => { setPage(1) }, [pageSize])

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const p          = Math.min(page, totalPages)
  const start      = (p - 1) * pageSize

  return {
    page: p,
    setPage,
    totalPages,
    total: items.length,
    pageItems: items.slice(start, start + pageSize),
    from: items.length === 0 ? 0 : start + 1,
    to:   Math.min(start + pageSize, items.length),
    pageSize,
    setPageSize,
  }
}
