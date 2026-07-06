export function competitionRank<T>(
  rows: T[],
  keyOf: (row: T, index: number) => string,
  valueOf: (row: T) => number,
  tieBreak: (a: T, b: T) => number = () => 0,
): Record<string, number> {
  const ranked = rows
    .map((row, index) => ({ row, index, key: keyOf(row, index), value: valueOf(row) }))
    .sort((a, b) => {
      const byValue = b.value - a.value
      if (byValue !== 0) return byValue
      const byTieBreak = tieBreak(a.row, b.row)
      return byTieBreak !== 0 ? byTieBreak : a.index - b.index
    })

  const out: Record<string, number> = {}
  let previousValue: number | undefined
  let currentRank = 0
  ranked.forEach((item, index) => {
    if (previousValue === undefined || item.value !== previousValue) {
      currentRank = index + 1
      previousValue = item.value
    }
    out[item.key] = currentRank
  })
  return out
}
