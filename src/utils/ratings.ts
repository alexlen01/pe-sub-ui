export type RatingParts = {
  sp?: string | null
  mdy?: string | null
  moodys?: string | null
  fitch?: string | null
}

function cleanRating(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim()
  return trimmed || '—'
}

export function formatCombinedRatings(parts: RatingParts, includeFitch = true): string {
  const mdy = parts.mdy ?? parts.moodys
  const values = [cleanRating(parts.sp), cleanRating(mdy)]
  if (includeFitch) values.push(cleanRating(parts.fitch))
  return values.join('/')
}

export function hasAnyRating(parts: RatingParts, includeFitch = true): boolean {
  return Boolean(
    parts.sp?.trim()
    || (parts.mdy ?? parts.moodys)?.trim()
    || (includeFitch && parts.fitch?.trim())
  )
}
