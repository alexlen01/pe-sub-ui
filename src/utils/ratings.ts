export type RatingParts = {
  spRating?: string | null
  moodysRating?: string | null
  fitchRating?: string | null
}

function cleanRating(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim()
  return trimmed || '—'
}

export function formatCombinedRatings(parts: RatingParts, includeFitch = true): string {
  const values = [cleanRating(parts.spRating), cleanRating(parts.moodysRating)]
  if (includeFitch) values.push(cleanRating(parts.fitchRating))
  return values.join('/')
}

export function hasAnyRating(parts: RatingParts, includeFitch = true): boolean {
  return Boolean(
    parts.spRating?.trim()
    || parts.moodysRating?.trim()
    || (includeFitch && parts.fitchRating?.trim())
  )
}
