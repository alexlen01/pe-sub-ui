function numericRate(rate?: string): number {
  if (!rate) return Number.NEGATIVE_INFINITY
  const parsed = Number.parseFloat(rate.replace('%', '').trim())
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}

export function sortLpCategoriesByRate(
  categories: string[],
  rateByCategory: Record<string, string> = {},
  configuredOrder: string[] = [],
): string[] {
  const configuredIndex = new Map(configuredOrder.map((category, index) => [category, index]))

  return [...categories].sort((a, b) => {
    const aRate = numericRate(rateByCategory[a])
    const bRate = numericRate(rateByCategory[b])
    if (aRate !== bRate) return bRate - aRate

    const configuredDifference = (configuredIndex.get(a) ?? Number.MAX_SAFE_INTEGER)
      - (configuredIndex.get(b) ?? Number.MAX_SAFE_INTEGER)
    return configuredDifference || a.localeCompare(b, undefined, { sensitivity: 'base' })
  })
}
