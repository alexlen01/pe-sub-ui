import type { MatchingConfig, MatchingThresholds } from '../services/api'

function suffixRe(config: MatchingConfig): RegExp | null {
  const suffixes = config.legalSuffixes.filter(s => s.strip).map(s => s.abbr.replace('.', '\\.'))
  return suffixes.length ? new RegExp(`\\b(${suffixes.join('|')})\\b`, 'gi') : null
}

export function normaliseName(name: string, config: MatchingConfig): string {
  let s = name.toLowerCase().replace(/[.,\-()]/g, ' ').replace(/\s+/g, ' ').trim()
  const re = suffixRe(config)
  if (re) s = s.replace(re, '').replace(/\s+/g, ' ').trim()
  // Retirement-suffix normalisation (Solution Design §6.2 step 6). Punctuation is already stripped,
  // so the dotted "Ret. Sys." forms arrive here as "ret sys"; fold to the canonical spelling.
  s = s.replace(/\bret\s+sys(?:tem)?\b/g, 'retirement system').replace(/\bret\b/g, 'retirement')
  config.knownAbbreviations.forEach(({ token, expansion }) => {
    s = s.replace(new RegExp(`\\b${token}\\b`, 'gi'), expansion.toLowerCase())
  })
  Object.entries(config.abbrevRegexMap ?? {}).forEach(([pat, full]) => {
    s = s.replace(new RegExp(`\\b${pat}\\b`, 'gi'), (full as string).toLowerCase())
  })
  return s.replace(/\s+/g, ' ').trim()
}

function jaro(a: string, b: string): number {
  if (a === b) return 1
  const maxDist = Math.max(Math.floor(Math.max(a.length, b.length) / 2) - 1, 0)
  const aHit = new Array<boolean>(a.length).fill(false)
  const bHit = new Array<boolean>(b.length).fill(false)
  let matches = 0
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - maxDist), hi = Math.min(b.length, i + maxDist + 1)
    for (let j = lo; j < hi; j++) {
      if (bHit[j] || a[i] !== b[j]) continue
      aHit[i] = bHit[j] = true; matches++; break
    }
  }
  if (!matches) return 0
  let trans = 0, k = 0
  for (let i = 0; i < a.length; i++) {
    if (!aHit[i]) continue
    while (!bHit[k]) k++
    if (a[i] !== b[k]) trans++
    k++
  }
  return (matches / a.length + matches / b.length + (matches - trans / 2) / matches) / 3
}

export function jwSim(a: string, b: string): number {
  const j = jaro(a, b)
  let pfx = 0
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) { if (a[i] === b[i]) pfx++; else break }
  return Math.round((j + pfx * 0.1 * (1 - j)) * 100)
}

export function levSim(a: string, b: string): number {
  if (!a.length && !b.length) return 100
  if (!a.length || !b.length) return 0
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0),
  )
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return Math.round((1 - dp[a.length][b.length] / Math.max(a.length, b.length)) * 100)
}

export function combineScores(jw: number, lev: number, thresholds: MatchingThresholds): number {
  return Math.round(jw * thresholds.jwWeight + lev * thresholds.levWeight)
}

export function matchScore(agentName: string, masterName: string, config: MatchingConfig): number {
  const na = normaliseName(agentName, config)
  const nb = normaliseName(masterName, config)
  return combineScores(jwSim(na, nb), levSim(na, nb), config.thresholds)
}
