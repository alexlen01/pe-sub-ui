import { parseM } from './bbCalculationService'
import { exportXlsx, type XlsxSheet } from './reportService'
import type { LpMasterRecord } from './api'
import type { FacilityRow } from './facilityService'
import type { LPRecord } from '../types/lp'

/**
 * Excel exports of the two record stores: `lp_records` (per-facility outcomes) and `lp_master`
 * (the curated bank-wide profiles that feed them).
 *
 * Both dump the **whole** store, not the filtered page — the point is a copy of the table, so
 * screen filters and pagination are deliberately ignored by the callers.
 *
 * Value contract: the API hands money and ratings over as display strings ("$4,200,000,000",
 * "7.5%") and rates/ratios as fractions, so strings pass through verbatim. Absent values are left
 * as empty cells rather than "—", so a column of numbers stays numeric.
 *
 * The two exports differ on how they write a fraction, and deliberately so. The **LP Master** export
 * is a copy of a table for reading, so it scales each fraction into a percent number under a "(%)"
 * header — a spreadsheet can sum and pivot that, which it cannot do with "90%" text. The **LP
 * records** export is a reproduction of the LP DB Export, which is fed back into the ingest
 * pipeline, so it keeps fractions and matches that file's headers exactly (see below).
 */

type ExportRow = Record<string, string | number>

/** Fraction (0.9) → percent number (90), to one decimal. Empty when absent. */
function pct(fraction: number | null | undefined): number | '' {
  if (fraction == null || !Number.isFinite(fraction)) return ''
  return Math.round(fraction * 1000) / 10
}

/**
 * A rate or share kept as a FRACTION (0.9), for the columns of the LP DB Export, whose headers
 * carry no "(%)" marker. Rounded to six places purely to keep float noise (0.30000000000000004)
 * out of the sheet. Empty when absent.
 */
function frac(fraction: number | null | undefined): number | '' {
  if (fraction == null || !Number.isFinite(fraction)) return ''
  return Math.round(fraction * 1e6) / 1e6
}

/** The API sends unset strings as '' (never null); keep that, but drop the display dash. */
function text(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim()
  return trimmed === '—' ? '' : trimmed
}

const yesNo = (value: boolean | null | undefined): string => (value ? 'Yes' : 'No')

/** Which measure a row's LP Size is expressed in — the table's own Size Measure column. */
function sizeMeasure(record: Pick<LPRecord, 'aum' | 'nav' | 'pensionAssets'>): string {
  if (text(record.aum)) return 'AUM'
  if (text(record.nav)) return 'NAV'
  if (text(record.pensionAssets)) return 'Assets'
  return ''
}

function lpSize(record: Pick<LPRecord, 'aum' | 'nav' | 'pensionAssets'>): string {
  return text(record.aum) || text(record.nav) || text(record.pensionAssets)
}

/**
 * LP Size as a number of BILLIONS — the unit the LP DB Export's "LP Size ($ Bil)" column carries.
 *
 * The store holds the size as a display string ("$16.5B", "$500B", or raw dollars), so this reduces
 * it back to the export's unit via `parseM` (which returns $millions and already copes with all
 * three spellings). Empty when the record carries no size, so the cell stays blank rather than
 * becoming a misleading 0.
 */
function lpSizeBil(record: Pick<LPRecord, 'aum' | 'nav' | 'pensionAssets'>): number | '' {
  const size = lpSize(record)
  if (!size) return ''
  const millions = parseM(size)
  if (!Number.isFinite(millions) || millions === 0) return ''
  return Math.round((millions / 1000) * 1000) / 1000
}

/**
 * The facility columns an LP record cannot carry itself — the export names each row's facility the
 * way the LP DB Export does (account, fund name, BB date).
 */
export type ExportFacility = Pick<FacilityRow, 'name' | 'accountNumber' | 'collateralDate'>

/**
 * The 30 columns of the LP DB Export (2026-08-18 format), in source order, so a workbook exported
 * here re-ingests through `pe-sub-jobs/scripts/lp_db_extract.py` as a feed.
 *
 * Headers are written **exactly as the real export spells them**, because that is what makes the
 * round-trip work. Two deliberate departures, both of which the extract's `_norm()` matcher accepts
 * as equivalent:
 *   - `Institutional vs HNW` — the source file misspells this "Insitutional"; reproducing a typo in
 *     a file an analyst opens is not worth the literalism.
 *   - `LP Size ($ Bil)` is written flat; the source has a line break inside that one cell.
 *
 * Value shapes also follow the export rather than this file's usual spreadsheet convention: rates
 * and shares go out as **fractions** (0.9), not as percent numbers under a "(%)" header. The export
 * carries fractions, and its headers have no "(%)" marker to justify scaling — writing 90 under a
 * plain "UBS Advance Rate" header would be read as 9000%. It also removes a real ambiguity on the
 * way back in: the extract decides percent-vs-fraction from the value, so a 1% share written as the
 * number `1` would be indistinguishable from 100%, whereas 0.01 is unambiguous.
 *
 * `Agent Excess Concentration` / `UBS Excess Concentration` are computed columns that the export now
 * carries, so they are included here — unlike rank, eligibility, delta and the shadow-BB outcome,
 * which remain out of this file and belong to the Shadow BB export.
 *
 * Not present, because the 2026-08-18 format dropped them: High Quality, Investor Type,
 * Region / Location, AUM / NAV / Pension Assets (superseded by LP Size + its criteria) and Funded
 * Ratio.
 */
export function buildLpRecordExportRows(
  records: LPRecord[],
  facilityById: Map<number, ExportFacility>,
): ExportRow[] {
  return records.map(r => {
    const facility = r.facilityId != null ? facilityById.get(r.facilityId) : undefined
    return {
      // ── LP DB Export columns, in source order ───────────────────────────────────────────────
      'AccountID':                   text(facility?.accountNumber),      // 1
      'FndName':                     text(facility?.name),               // 2
      'Investor Name':               text(r.investorName),               // 3
      'Parent':                      text(r.parent),                     // 4
      'SPV':                         yesNo(r.spv),                       // 5
      'UBS LP Classification':       text(r.ubsLpCategory),              // 6
      'Institutional vs HNW':        text(r.institutionalOrHnw),         // 7  (source misspells it)
      'Investment Grade?':           yesNo(r.investmentGrade),           // 8
      'Agent LP Classification':     text(r.agentLpCategory),            // 9
      'S&P':                         text(r.spRating),                   // 10
      "Moody's":                     text(r.moodysRating),               // 11
      'Fitch':                       text(r.fitchRating),                // 12
      'LP Size ($ Bil)':             lpSizeBil(r),                       // 13
      'LP Size Criteria':            sizeMeasure(r),                     // 14
      'Capital Commitments':         text(r.capitalCommitment),          // 15
      'Uncalled Capital':            text(r.uncalledCapital),            // 16
      'UBS Advance Rate':            frac(r.ubsAdvanceRate),             // 17
      'Agent Advance Rate':          frac(r.agentAdvanceRate),           // 18
      'Agent Concentration Limit':   text(r.agentConcentrationLimit),    // 19
      'UBS Concentration Limit':     text(r.ubsConcentrationLimit),      // 20
      '% of Capital Commitments':    frac(r.pctOfFundCommitments),       // 21
      'Called Capital':              text(r.calledCapital),              // 22
      '% of Uncalled Capital':       frac(r.pctOfFundUncalled),          // 23
      '% of LP Called':              frac(r.pctLpCalled),                // 24
      'Agent Excess Concentration':  text(r.agentExcessConcentration),   // 25
      'UBS Excess Concentration':    text(r.ubsExcessConcentration),     // 26
      'Agent Borrowing Base':        text(r.agentBorrowingBase),         // 27
      'UBS Borrowing Base':          text(r.ubsBorrowingBase),           // 28
      'Notes':                       text(r.notes),                      // 29
      'BBDate':                      text(facility?.collateralDate),     // 30 — last column
    }
  })
}

export function buildLpMasterExportRows(records: LpMasterRecord[]): ExportRow[] {
  return records.map(r => ({
    'LP Master ID':                    r.id,
    'Investor Name':                   text(r.investorName),
    // A row whose parent is its own name means "no parent" in the feed, so it exports blank.
    'Parent':                          text(r.parent) === text(r.investorName) ? '' : text(r.parent),
    'Parent ID':                       r.parentId ?? '',
    'Ultimate Parent':                 text(r.ultimateParent),
    'Ultimate Entity':                 yesNo(r.isUltimateParent),
    'Children':                        r.childCount,
    'SPV':                             yesNo(r.spv),
    'Region / Location':               text(r.regionLocation),
    'Investor Type':                   text(r.investorType),
    'Institutional vs HNW':            text(r.institutionalOrHnw),
    'UBS LP Classification':           text(r.ubsLpCategory),
    'Investment Grade':                yesNo(r.investmentGrade),
    'High Quality':                    yesNo(r.highQuality),
    'S&P':                             text(r.spRating),
    "Moody's":                         text(r.moodysRating),
    'Fitch':                           text(r.fitchRating),
    'LP Size':                         lpSize(r),
    'Size Measure':                    sizeMeasure(r),
    'Funded Ratio (%)':                pct(r.fundingRatio),
    'UBS Default Advance Rate (%)':    pct(r.ubsDefaultAdvanceRate),
    'UBS Default Concentration Limit': text(r.ubsDefaultConcentrationLimit),
    'Notes':                           text(r.notes),
  }))
}

/** Timestamped so repeated exports land side by side instead of overwriting each other. */
export function exportFileName(prefix: string, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
    + `-${pad(now.getHours())}${pad(now.getMinutes())}`
  return `${prefix}-${stamp}.xlsx`
}

export function exportLpRecords(records: LPRecord[], facilityById: Map<number, ExportFacility>): void {
  const sheet: XlsxSheet = { name: 'LP Records', rows: buildLpRecordExportRows(records, facilityById) }
  exportXlsx(exportFileName('lp-records'), [sheet])
}

export function exportLpMasterRecords(records: LpMasterRecord[]): void {
  const sheet: XlsxSheet = { name: 'LP Master', rows: buildLpMasterExportRows(records) }
  exportXlsx(exportFileName('lp-master-records'), [sheet])
}
