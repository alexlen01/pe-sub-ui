/**
 * Canonical Region / Location reference for LP Master.
 *
 * The LP Master `region_location` column is a single free-text varchar. To keep the
 * borrowing-base and concentration logic reliable while still storing a single field, the
 * Region/Location typeahead resolves every selection to a stable, parseable token:
 *
 *     REGION|COUNTRY|SUB      e.g.  "NAM|US|DE"  (Delaware),  "EMEA|KY|"  (Cayman Islands)
 *
 *   - REGION  — one of the five macro buckets used for aggregate concentration tracking.
 *   - COUNTRY — ISO 3166-1 alpha-2 (two letters, per the form contract).
 *   - SUB     — optional subdivision (US state / CA province) for domestic concentration.
 *
 * Display labels are always DERIVED from this reference — never stored — so a label change can
 * never corrupt the compliance filters that key off REGION/COUNTRY. Helpers are tolerant of
 * legacy free-text values (e.g. "North America") so existing rows keep rendering and classifying
 * correctly before any backfill runs.
 */

export type RegionCode = 'NAM' | 'EMEA' | 'APAC' | 'LATAM' | 'MEA'

export const REGION_LABELS: Record<RegionCode, string> = {
  NAM:   'North America',
  EMEA:  'Europe',
  APAC:  'Asia-Pacific',
  LATAM: 'Latin America',
  MEA:   'Middle East & Africa',
}

export interface RegionEntry {
  /** Macro concentration bucket. */
  region: RegionCode
  /** ISO 3166-1 alpha-2 country code. */
  country: string
  /** Optional subdivision code (US state / CA province). */
  sub?: string
  /** Human-readable display label, derived — never persisted as source of truth. */
  label: string
  /** Extra search terms (nicknames, ISO3, common typos). Label/country/region are always searched. */
  aliases: string[]
  /** PE fund-structure domicile — surfaced as a quick-select at the top of the typeahead. */
  pinned?: boolean
}

/**
 * Canonical entries. Not an exhaustive gazetteer, but a broad curated set covering the five macro
 * regions, the most common LP countries, and the PE fund-structure domiciles. Extend as new LP
 * jurisdictions appear.
 */
export const REGION_ENTRIES: readonly RegionEntry[] = [
  // ── PE fund-structure domiciles (pinned quick-select) ──────────────────────────────────────
  { region: 'EMEA',  country: 'LU', label: 'Luxembourg',                aliases: ['lux', 'lu', 'aifmd', 'sicav'],      pinned: true },
  { region: 'EMEA',  country: 'IE', label: 'Ireland',                   aliases: ['irl', 'dublin', 'aifmd'],           pinned: true },
  { region: 'EMEA',  country: 'GG', label: 'Guernsey',                  aliases: ['channel islands', 'ggy'],           pinned: true },
  { region: 'EMEA',  country: 'JE', label: 'Jersey',                    aliases: ['channel islands', 'jey'],           pinned: true },
  { region: 'EMEA',  country: 'IM', label: 'Isle of Man',               aliases: ['iom', 'manx'],                      pinned: true },
  { region: 'EMEA',  country: 'BM', label: 'Bermuda',                   aliases: ['bmu', 'hamilton', 'exempted'],      pinned: true },

  // ── North America ──────────────────────────────────────────────────────────────────────────
  { region: 'NAM',   country: 'US', label: 'United States',             aliases: ['usa', 'america', 'us'] },
  { region: 'NAM',   country: 'US', sub: 'NY', label: 'New York, US',   aliases: ['new york'] },
  { region: 'NAM',   country: 'US', sub: 'CA', label: 'California, US', aliases: ['california'] },
  { region: 'NAM',   country: 'US', sub: 'TX', label: 'Texas, US',      aliases: ['texas'] },
  { region: 'NAM',   country: 'US', sub: 'MA', label: 'Massachusetts, US', aliases: ['massachusetts'] },
  { region: 'NAM',   country: 'US', sub: 'NYC', label: 'New York City, US', aliases: ['new york city', 'nyc', 'manhattan'] },
  { region: 'NAM',   country: 'US', sub: 'BOS', label: 'Boston, US',    aliases: ['boston', 'greater boston'] },
  { region: 'NAM',   country: 'US', sub: 'LAX', label: 'Los Angeles, US', aliases: ['los angeles', 'la', 'l.a.'] },
  { region: 'NAM',   country: 'US', sub: 'SFO', label: 'San Francisco, US', aliases: ['san francisco', 'sf', 'bay area'] },
  { region: 'NAM',   country: 'US', sub: 'CHI', label: 'Chicago, US',   aliases: ['chicago', 'chicagoland'] },
  { region: 'NAM',   country: 'US', sub: 'HOU', label: 'Houston, US',   aliases: ['houston'] },
  { region: 'NAM',   country: 'US', sub: 'DAL', label: 'Dallas, US',    aliases: ['dallas', 'dfw'] },
  { region: 'NAM',   country: 'US', sub: 'MIA', label: 'Miami, US',     aliases: ['miami', 'south florida'] },
  { region: 'NAM',   country: 'US', sub: 'SEA', label: 'Seattle, US',   aliases: ['seattle', 'seattle metro'] },
  { region: 'NAM',   country: 'US', sub: 'DC', label: 'Washington, DC, US', aliases: ['washington dc', 'dc', 'd.c.', 'district of columbia'] },
  { region: 'NAM',   country: 'US', sub: 'ATL', label: 'Atlanta, US',   aliases: ['atlanta', 'atl'] },
  { region: 'NAM',   country: 'US', sub: 'DEN', label: 'Denver, US',    aliases: ['denver'] },
  { region: 'NAM',   country: 'US', sub: 'SD', label: 'San Diego, US',   aliases: ['san diego'] },
  { region: 'NAM',   country: 'US', sub: 'DE', label: 'Delaware, US',   aliases: ['delaware', 'usa', 'united states'], pinned: true },
  { region: 'NAM',   country: 'US', sub: 'FL', label: 'Florida, US',    aliases: ['florida'] },
  { region: 'NAM',   country: 'US', sub: 'IL', label: 'Illinois, US',   aliases: ['illinois'] },
  { region: 'NAM',   country: 'US', sub: 'PA', label: 'Pennsylvania, US', aliases: ['pennsylvania', 'philadelphia'] },
  { region: 'NAM',   country: 'US', sub: 'WA', label: 'Washington, US',  aliases: ['washington'] },
  { region: 'NAM',   country: 'US', sub: 'CO', label: 'Colorado, US',    aliases: ['colorado'] },
  { region: 'NAM',   country: 'CA', label: 'Canada',                    aliases: ['can'] },
  { region: 'NAM',   country: 'CA', sub: 'ON', label: 'Ontario, CA',    aliases: ['ontario'] },
  { region: 'NAM',   country: 'CA', sub: 'QC', label: 'Quebec, CA',     aliases: ['quebec'] },
  { region: 'NAM',   country: 'CA', sub: 'BC', label: 'British Columbia, CA', aliases: ['british columbia'] },
  { region: 'NAM',   country: 'CA', sub: 'AB', label: 'Alberta, CA',     aliases: ['alberta'] },
  { region: 'NAM',   country: 'CA', sub: 'TOR', label: 'Toronto, CA',   aliases: ['toronto', 'gta', 'greater toronto area'] },
  { region: 'NAM',   country: 'CA', sub: 'VAN', label: 'Vancouver, CA', aliases: ['vancouver', 'metro vancouver'] },
  { region: 'NAM',   country: 'CA', sub: 'MTL', label: 'Montreal, CA',   aliases: ['montreal', 'montréal'] },
  { region: 'NAM',   country: 'CA', sub: 'OTT', label: 'Ottawa, CA',     aliases: ['ottawa'] },
  { region: 'NAM',   country: 'CA', sub: 'CAL', label: 'Calgary, CA',    aliases: ['calgary'] },
  { region: 'NAM',   country: 'CA', sub: 'EDM', label: 'Edmonton, CA',   aliases: ['edmonton'] },
  { region: 'NAM',   country: 'CA', sub: 'WPG', label: 'Winnipeg, CA',   aliases: ['winnipeg'] },
  { region: 'NAM',   country: 'CA', sub: 'YHZ', label: 'Halifax, CA',    aliases: ['halifax'] },
  { region: 'NAM',   country: 'CA', sub: 'VIC', label: 'Victoria, CA',   aliases: ['victoria'] },

  // ── Europe ─────────────────────────────────────────────────────────────────────────────────
  { region: 'EMEA',  country: 'EU', label: 'Europe',                   aliases: ['europe', 'eu'] },
  { region: 'EMEA',  country: 'GB', label: 'United Kingdom',            aliases: ['uk', 'gbr', 'britain', 'england', 'london'] },
  { region: 'EMEA',  country: 'DE', label: 'Germany',                   aliases: ['deu', 'deutschland'] },
  { region: 'EMEA',  country: 'FR', label: 'France',                    aliases: ['fra', 'paris'] },
  { region: 'EMEA',  country: 'NL', label: 'Netherlands',               aliases: ['nld', 'holland'] },
  { region: 'EMEA',  country: 'CH', label: 'Switzerland',               aliases: ['che', 'zurich', 'geneva'] },
  { region: 'EMEA',  country: 'SE', label: 'Sweden',                    aliases: ['swe', 'stockholm'] },
  { region: 'EMEA',  country: 'NO', label: 'Norway',                    aliases: ['nor', 'oslo'] },
  { region: 'EMEA',  country: 'IT', label: 'Italy',                     aliases: ['ita'] },
  { region: 'EMEA',  country: 'ES', label: 'Spain',                     aliases: ['esp'] },
  { region: 'EMEA',  country: 'BE', label: 'Belgium',                   aliases: ['bel', 'brussels'] },
  { region: 'EMEA',  country: 'DK', label: 'Denmark',                   aliases: ['dnk', 'copenhagen'] },
  { region: 'EMEA',  country: 'FI', label: 'Finland',                   aliases: ['fin', 'helsinki'] },
  { region: 'EMEA',  country: 'AT', label: 'Austria',                   aliases: ['aut', 'vienna'] },
  { region: 'EMEA',  country: 'PT', label: 'Portugal',                  aliases: ['prt', 'lisbon'] },
  { region: 'EMEA',  country: 'PL', label: 'Poland',                    aliases: ['pol', 'warsaw'] },
  { region: 'EMEA',  country: 'GR', label: 'Greece',                    aliases: ['grc', 'athens'] },
  { region: 'EMEA',  country: 'CZ', label: 'Czech Republic',            aliases: ['cze', 'prague'] },
  { region: 'EMEA',  country: 'HU', label: 'Hungary',                   aliases: ['hun', 'budapest'] },
  { region: 'EMEA',  country: 'RO', label: 'Romania',                   aliases: ['rou', 'bucharest'] },
  { region: 'EMEA',  country: 'SK', label: 'Slovakia',                  aliases: ['svk', 'bratislava'] },
  { region: 'EMEA',  country: 'SI', label: 'Slovenia',                  aliases: ['svn', 'ljubljana'] },
  { region: 'EMEA',  country: 'IE', sub: 'D', label: 'Dublin, IE',      aliases: ['dublin'] },

  // ── Asia-Pacific ───────────────────────────────────────────────────────────────────────────
  { region: 'APAC',  country: 'JP', label: 'Japan',                     aliases: ['jpn', 'tokyo'] },
  { region: 'APAC',  country: 'CN', label: 'China',                     aliases: ['chn', 'prc'] },
  { region: 'APAC',  country: 'HK', label: 'Hong Kong',                 aliases: ['hkg'] },
  { region: 'APAC',  country: 'SG', label: 'Singapore',                 aliases: ['sgp'] },
  { region: 'APAC',  country: 'AU', label: 'Australia',                 aliases: ['aus', 'sydney'] },
  { region: 'APAC',  country: 'KR', label: 'South Korea',               aliases: ['kor', 'korea', 'seoul'] },
  { region: 'APAC',  country: 'IN', label: 'India',                     aliases: ['ind', 'mumbai'] },
  { region: 'APAC',  country: 'NZ', label: 'New Zealand',               aliases: ['nzl', 'auckland', 'wellington'] },
  { region: 'APAC',  country: 'TW', label: 'Taiwan',                    aliases: ['twn', 'taipei'] },
  { region: 'APAC',  country: 'MY', label: 'Malaysia',                  aliases: ['mys', 'kuala lumpur'] },
  { region: 'APAC',  country: 'TH', label: 'Thailand',                  aliases: ['tha', 'bangkok'] },
  { region: 'APAC',  country: 'ID', label: 'Indonesia',                 aliases: ['idn', 'jakarta'] },
  { region: 'APAC',  country: 'PH', label: 'Philippines',               aliases: ['phl', 'manila'] },

  // ── Latin America ──────────────────────────────────────────────────────────────────────────
  { region: 'LATAM', country: 'BR', label: 'Brazil',                    aliases: ['bra', 'sao paulo'] },
  { region: 'LATAM', country: 'MX', label: 'Mexico',                    aliases: ['mex'] },
  { region: 'LATAM', country: 'BM', label: 'Bermuda',                   aliases: ['bmu'] },
  { region: 'LATAM', country: 'KY', label: 'Cayman Islands',            aliases: ['cayman', 'cym', 'exempted'],        pinned: true },
  { region: 'LATAM', country: 'CL', label: 'Chile',                     aliases: ['chl', 'santiago'] },
  { region: 'LATAM', country: 'CO', label: 'Colombia',                  aliases: ['col', 'bogota'] },
  { region: 'LATAM', country: 'PE', label: 'Peru',                      aliases: ['per', 'lima'] },
  { region: 'LATAM', country: 'AR', label: 'Argentina',                 aliases: ['arg', 'buenos aires'] },
  { region: 'LATAM', country: 'UY', label: 'Uruguay',                   aliases: ['ury', 'montevideo'] },
  { region: 'LATAM', country: 'PA', label: 'Panama',                    aliases: ['pan', 'panama city'] },

  // ── Middle East & Africa ───────────────────────────────────────────────────────────────────
  { region: 'MEA',   country: 'AE', label: 'United Arab Emirates',      aliases: ['uae', 'are', 'dubai', 'abu dhabi'] },
  { region: 'MEA',   country: 'SA', label: 'Saudi Arabia',              aliases: ['sau', 'ksa', 'riyadh'] },
  { region: 'MEA',   country: 'QA', label: 'Qatar',                     aliases: ['qat', 'doha'] },
  { region: 'MEA',   country: 'ZA', label: 'South Africa',              aliases: ['zaf', 'johannesburg'] },
  { region: 'MEA',   country: 'IL', label: 'Israel',                    aliases: ['isr', 'tel aviv'] },
  { region: 'MEA',   country: 'BH', label: 'Bahrain',                   aliases: ['bhr', 'manama'] },
  { region: 'MEA',   country: 'KW', label: 'Kuwait',                    aliases: ['kwt', 'kuwait city'] },
  { region: 'MEA',   country: 'OM', label: 'Oman',                      aliases: ['omn', 'muscat'] },
  { region: 'MEA',   country: 'EG', label: 'Egypt',                     aliases: ['egy', 'cairo'] },
  { region: 'MEA',   country: 'MA', label: 'Morocco',                   aliases: ['mar', 'casablanca', 'rabat'] },
  { region: 'MEA',   country: 'KE', label: 'Kenya',                     aliases: ['ken', 'nairobi'] },
  { region: 'MEA',   country: 'MU', label: 'Mauritius',                 aliases: ['mus', 'port louis'] },
]

/** Build the `REGION|COUNTRY|SUB` token for a canonical entry. */
export function tokenForEntry(e: RegionEntry): string {
  return `${e.region}|${e.country}|${e.sub ?? ''}`
}

const ENTRY_BY_TOKEN = new Map<string, RegionEntry>(
  REGION_ENTRIES.map(e => [tokenForEntry(e), e]),
)

/**
 * Legacy free-text region strings (as historically stored in `region_location`) → region code.
 * Lets `regionOf`/`formatRegion` keep working on un-backfilled rows.
 */
const LEGACY_REGION_MAP: Record<string, RegionCode> = {
  'north america': 'NAM',
  'northamerica': 'NAM',
  'n. america': 'NAM',
  'us': 'NAM',
  'usa': 'NAM',
  'united states': 'NAM',
  'europe': 'EMEA',
  'european union': 'EMEA',
  'eu': 'EMEA',
  'asia-pacific': 'APAC',
  'asia pacific': 'APAC',
  'asia': 'APAC',
  'apac': 'APAC',
  'latin america': 'LATAM',
  'latam': 'LATAM',
  'middle east & africa': 'MEA',
  'middle east and africa': 'MEA',
  'mea': 'MEA',
}

/** True when a stored value is a structured token (contains the `|` delimiter). */
export function isRegionToken(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.includes('|')
}

export interface ParsedRegion {
  region: RegionCode | ''
  country: string
  sub: string
}

/**
 * Parse a stored value into its region/country/sub parts. Accepts a structured token
 * (`NAM|US|DE`) or a legacy free-text string (`North America`), which resolves region-only.
 */
export function parseRegionToken(value: string | null | undefined): ParsedRegion {
  const raw = String(value ?? '').trim()
  if (!raw) return { region: '', country: '', sub: '' }
  if (isRegionToken(raw)) {
    const [region = '', country = '', sub = ''] = raw.split('|')
    const code = (Object.keys(REGION_LABELS) as RegionCode[]).includes(region as RegionCode)
      ? (region as RegionCode)
      : ''
    return { region: code, country: country.trim().toUpperCase(), sub: sub.trim().toUpperCase() }
  }
  return { region: LEGACY_REGION_MAP[raw.toLowerCase()] ?? '', country: '', sub: '' }
}

/** Macro region code for a stored value, or '' when unknown. */
export function regionOf(value: string | null | undefined): RegionCode | '' {
  return parseRegionToken(value).region
}

/**
 * Display label for a stored value. A recognised token yields its canonical entry label; an
 * unrecognised token falls back to a readable composite; a legacy free-text value passes through.
 */
export function formatRegion(value: string | null | undefined): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (!isRegionToken(raw)) return raw
  const entry = ENTRY_BY_TOKEN.get(raw)
  if (entry) return entry.label
  const { region, country, sub } = parseRegionToken(raw)
  const regionName = region ? REGION_LABELS[region] : ''
  return [sub && country ? `${sub}, ${country}` : country, regionName].filter(Boolean).join(' · ') || raw
}

/**
 * Normalise any stored value to a token. A structured token is returned unchanged; a recognised
 * legacy free-text region resolves to a region-only token (`NAM||`); an unmappable value returns
 * '' so a backfill can flag it for analyst review rather than silently inventing a region.
 * Intended for a one-time `region_location` backfill and for on-save normalisation.
 */
export function toRegionToken(value: string | null | undefined): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (isRegionToken(raw)) return raw
  const region = LEGACY_REGION_MAP[raw.toLowerCase()]
  return region ? `${region}||` : ''
}

/** Find the canonical entry for a stored token, if it maps to one. */
export function entryForValue(value: string | null | undefined): RegionEntry | undefined {
  const raw = String(value ?? '').trim()
  return raw ? ENTRY_BY_TOKEN.get(raw) : undefined
}

/**
 * Typeahead search. Matches query against label, ISO2 country, region code/name, sub code, and
 * aliases. Pinned domiciles rank first; then label match; then everything else, alphabetically.
 * An empty query returns the pinned domiciles as the initial suggestion set.
 */
export function searchRegions(query: string, limit = 12): RegionEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return REGION_ENTRIES.filter(e => e.pinned)
  const scored = REGION_ENTRIES
    .map(e => {
      const label = e.label.toLowerCase()
      const haystay = [label, e.country.toLowerCase(), e.region.toLowerCase(),
        REGION_LABELS[e.region].toLowerCase(), (e.sub ?? '').toLowerCase(), ...e.aliases.map(a => a.toLowerCase())]
      if (!haystay.some(h => h.includes(q))) return null
      const score = label.startsWith(q) ? 0 : label.includes(q) ? 1 : e.pinned ? 2 : 3
      return { e, score }
    })
    .filter((x): x is { e: RegionEntry; score: number } => x !== null)
    .sort((a, b) => a.score - b.score || a.e.label.localeCompare(b.e.label))
  return scored.slice(0, limit).map(x => x.e)
}
