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
 * "7.5%") and rates/ratios as fractions, so strings pass through verbatim and every fraction
 * becomes a number in a column headed "(%)" — a spreadsheet can sum and pivot those, which it
 * cannot do with "90%" text. Absent values are left as empty cells rather than "—", so a column
 * of numbers stays numeric.
 */

type ExportRow = Record<string, string | number>

/** Fraction (0.9) → percent number (90), to one decimal. Empty when absent. */
function pct(fraction: number | null | undefined): number | '' {
  if (fraction == null || !Number.isFinite(fraction)) return ''
  return Math.round(fraction * 1000) / 10
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
 * The facility columns an LP record cannot carry itself — the export names each row's facility the
 * way the LP DB Export does (account, fund name, BB date).
 */
export type ExportFacility = Pick<FacilityRow, 'name' | 'accountNumber' | 'collateralDate'>

/**
 * Column order and field set follow the LP DB Export (`lp_db_generate.SRC_COLS`) so the file that
 * comes out lines up with the file the platform was seeded from. Headers are the readable form of
 * each source column (`FndName` → Fund Name, `HQ` → High Quality, `UBSAR` → UBS Advance Rate) and
 * `lp_db_extract.PLATFORM_HEADERS` maps them back, so an exported workbook re-ingests as a feed.
 *
 * Nothing follows `Collateral Date` — the LP DB Export ends at `BBDate`, so the platform's own
 * computed columns (rank, eligibility, excess concentration, delta, the shadow-BB outcome) stay out
 * of this file. They belong to the Shadow BB export, not to the seed schema.
 */
export function buildLpRecordExportRows(
  records: LPRecord[],
  facilityById: Map<number, ExportFacility>,
): ExportRow[] {
  return records.map(r => {
    const facility = r.facilityId != null ? facilityById.get(r.facilityId) : undefined
    return {
      // ── LP DB Export columns, in source order ───────────────────────────────────────────────
      'Account ID':                  text(facility?.accountNumber),   // AccountID
      'Fund Name':                   text(facility?.name),            // FndName
      'Investor Name':               text(r.investorName),            // InvestorName
      'Parent':                      text(r.parent),                  // Parent
      'SPV':                         yesNo(r.spv),                    // SPV
      'Investor Type':               text(r.investorType),            // InvestorType
      'Region / Location':           text(r.regionLocation),          // Region
      'High Quality':                yesNo(r.highQuality),            // HQ
      'Institutional vs HNW':        text(r.institutionalOrHnw),      // InstitutionalHNW
      'Investment Grade':            yesNo(r.investmentGrade),        // InvestmentGrade
      'Agent LP Classification':     text(r.agentLpCategory),         // Classification
      'Notes':                       text(r.notes),                   // Notes
      'S&P':                         text(r.spRating),                // SP
      "Moody's":                     text(r.moodysRating),            // Moodys
      'Fitch':                       text(r.fitchRating),             // Fitch
      'AUM':                         text(r.aum),                     // AUM
      'NAV':                         text(r.nav),                     // NAV
      'Pension Assets':              text(r.pensionAssets),           // PensionAssets
      'Funded Ratio (%)':            pct(r.fundingRatio),             // FundingRatio
      'UBS Advance Rate (%)':        pct(r.ubsAdvanceRate),           // UBSAR
      'Agent Advance Rate (%)':      pct(r.agentAdvanceRate),         // AgentAR
      'Capital Commitments':         text(r.capitalCommitment),       // Commitments
      '% of Commitments':            pct(r.pctOfFundCommitments),     // PercentOfCommitments
      'Called Capital':              text(r.calledCapital),           // Called
      'Uncalled Capital':            text(r.uncalledCapital),         // Uncalled
      '% of Uncalled Capital':       pct(r.pctOfFundUncalled),        // PercentOfUncalled
      '% of LP Called':              pct(r.pctLpCalled),              // CalledPercent
      'Agent Concentration Limit':   text(r.agentConcentrationLimit), // AgentCL
      'UBS Concentration Limit':     text(r.ubsConcentrationLimit),   // UBSCL
      'Agent Borrowing Base':        text(r.agentBorrowingBase),      // AgentBB
      'UBS Borrowing Base':          text(r.ubsBorrowingBase),        // UBSBB
      'Collateral Date':             text(facility?.collateralDate),  // BBDate — last column
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
