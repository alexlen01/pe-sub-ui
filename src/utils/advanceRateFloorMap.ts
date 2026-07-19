export function advanceRateGroupLabel(raw: string | number | undefined | null): string {
  const rate = typeof raw === 'number'
    ? raw
    : parseFloat(String(raw ?? '').replace('%', '').trim())

  if (rate >= 90) return '90%'
  if (rate >= 75 && rate < 90) return '75%'
  if (rate >= 65 && rate < 75) return '65%'
  if (rate >= 50 && rate < 65) return '50%'
  return '0%'
}
