// Mock data for field mapping dictionary — must stay in sync with V1_2__seed.sql.
// 29 canonical fields across 7 groups.
// is_derived fields are included so the UI can render them (greyed out / labelled).

export const ALIAS_GROUPS = [
  { group: 'Identity & Classification', fields: [
    {
      id: 1, canonical: 'Investor Name',
      lpMasterField: 'Identity & Classification - Investor Name',
      disambiguation: null, isDerived: false,
      aliases: [
        { id:1,  text:'Investor Name',                tier:'Core', bank:null },
        { id:2,  text:'Investor Name (Agent Records)', tier:'Core', bank:null },
        { id:3,  text:'Investor',                      tier:'Core', bank:null },
        { id:4,  text:'LP Name',                       tier:'Core', bank:null },
        { id:5,  text:'Limited Partner',               tier:'Core', bank:null },
        { id:6,  text:'Fund Investor',                 tier:'Bank', bank:'SVB' },
      ],
    },
    {
      id: 2, canonical: 'LP Classification',
      lpMasterField: 'Identity & Classification - LP Classification',
      disambiguation: "Extract the Agent's own category label as-is", isDerived: false,
      aliases: [
        { id:7,  text:'LP Type',          tier:'Core', bank:null },
        { id:8,  text:'Investor Type',    tier:'Core', bank:null },
        { id:9,  text:'Classification',   tier:'Core', bank:null },
        { id:10, text:'Category',         tier:'Core', bank:null },
        { id:11, text:'Investor Category',tier:'Core', bank:null },
        { id:12, text:'LP Classification',tier:'Core', bank:null },
        { id:13, text:'Entity Type',      tier:'Bank', bank:'BNY' },
        { id:14, text:'Investor Class',   tier:'Bank', bank:'JPM' },
      ],
    },
    {
      id: 3, canonical: 'Transferee',
      lpMasterField: 'Identity & Classification - Transferee',
      disambiguation: 'Y where LP received a transferred commitment; blank otherwise', isDerived: false,
      aliases: [
        { id:15, text:'Transferee',      tier:'Core', bank:null },
        { id:16, text:'Transfer Flag',   tier:'Core', bank:null },
        { id:17, text:'Assignee',        tier:'Core', bank:null },
        { id:18, text:'Assignment Flag', tier:'Core', bank:null },
        { id:19, text:'Transferred LP',  tier:'Core', bank:null },
      ],
    },
    {
      id: 4, canonical: 'Parent / Sponsor',
      lpMasterField: 'Identity & Classification - Parent / Sponsor',
      disambiguation: 'Ultimate parent or sponsoring entity of the LP', isDerived: false,
      aliases: [
        { id:20, text:'Parent / Sponsor',           tier:'Core', bank:null },
        { id:21, text:'Parent',                     tier:'Core', bank:null },
        { id:22, text:'Sponsor',                    tier:'Core', bank:null },
        { id:23, text:'Parent Entity',              tier:'Core', bank:null },
        { id:24, text:'Sponsoring Entity',          tier:'Core', bank:null },
        { id:25, text:'Ultimate Parent',            tier:'Core', bank:null },
        { id:26, text:'Parent Organization',        tier:'Core', bank:null },
        { id:27, text:'Parent / Sponsor / Manager', tier:'Core', bank:null },
        { id:28, text:'Manager',                    tier:'Core', bank:null },
      ],
    },
    {
      id: 5, canonical: 'Eligibility Flag',
      lpMasterField: 'Identity & Classification - Eligibility Flag',
      disambiguation: 'Y/Eligible/Included vs N/Excluded; agent-assigned per-LP; treat as derived — WF template encodes this as a formula column separate from Investor Category',
      isDerived: true,
      aliases: [
        { id:29, text:'Eligibility', tier:'Core', bank:null },
        { id:30, text:'Eligible',    tier:'Bank', bank:'WF' },
      ],
    },
  ]},

  { group: 'Commitment Data', fields: [
    {
      id: 6, canonical: 'Capital Commitments',
      lpMasterField: 'Commitment Data - Capital Commitments',
      disambiguation: 'Prefer "Individual" prefix column over aggregate when both present', isDerived: false,
      aliases: [
        { id:31, text:'Capital Commitments',            tier:'Core', bank:null },
        { id:32, text:'Committed Capital',              tier:'Core', bank:null },
        { id:33, text:'Original Commitment',            tier:'Core', bank:null },
        { id:34, text:'Individual Original Commitment', tier:'Core', bank:null },
        { id:35, text:'Total Commitment',               tier:'Core', bank:null },
        { id:36, text:'Commitment (USD)',                tier:'Bank', bank:'BNY' },
      ],
    },
    {
      id: 7, canonical: '% of Capital Commitments',
      lpMasterField: 'Commitment Data - % of Capital Commitments',
      disambiguation: "LP's commitment as a percentage of total fund commitments", isDerived: false,
      aliases: [
        { id:37, text:'% of Capital Commitments', tier:'Core', bank:null },
        { id:38, text:'% Commitment',             tier:'Core', bank:null },
        { id:39, text:'Commitment Percentage',    tier:'Core', bank:null },
        { id:40, text:'LP Commitment %',          tier:'Core', bank:null },
      ],
    },
    {
      id: 8, canonical: 'Called Capital',
      lpMasterField: 'Commitment Data - Called Capital',
      disambiguation: 'Cumulative capital drawn from the LP to date', isDerived: false,
      aliases: [
        { id:41, text:'Called Capital',    tier:'Core', bank:null },
        { id:42, text:'Drawn Capital',     tier:'Core', bank:null },
        { id:43, text:'Funded Capital',    tier:'Core', bank:null },
        { id:44, text:'Capital Drawn',     tier:'Core', bank:null },
        { id:45, text:'Funded Commitment', tier:'Core', bank:null },
        { id:46, text:'Called Commitment', tier:'Core', bank:null },
      ],
    },
    {
      id: 9, canonical: 'Recallable Distributions',
      lpMasterField: 'Commitment Data - Recallable Distributions',
      disambiguation: 'Prior distributions subject to recall; SVB template feature; added back to callable capital base when computing remaining callable capital',
      isDerived: false,
      aliases: [
        { id:47, text:'Recallable Distributions', tier:'Bank', bank:'SVB' },
        { id:48, text:'Recallable Capital',        tier:'Bank', bank:'SVB' },
      ],
    },
  ]},

  { group: 'Uncalled Data', fields: [
    {
      id: 10, canonical: 'Uncalled Capital',
      lpMasterField: 'Uncalled Data - Uncalled Capital',
      disambiguation: 'Prefer "Individual" prefix; skip column if any qualifier blocklist term matches header',
      isDerived: false,
      aliases: [
        { id:49, text:'Uncalled Capital',               tier:'Core', bank:null },
        { id:50, text:'Unfunded Capital Commitment',    tier:'Core', bank:null },
        { id:51, text:'Individual Unfunded Commitment', tier:'Core', bank:null },
        { id:52, text:'Unfunded Commitment',            tier:'Core', bank:null },
        { id:53, text:'Remaining Callable Capital',     tier:'Bank', bank:'SVB' },
        { id:54, text:'Remaining Commitment',           tier:'Core', bank:null },
        { id:55, text:'Uncalled Capital (USD)',          tier:'Bank', bank:'BNY' },
      ],
    },
    {
      id: 11, canonical: '% of Uncalled Capital',
      lpMasterField: 'Uncalled Data - % of Uncalled Capital',
      disambiguation: "LP's uncalled capital as a percentage of total fund uncalled", isDerived: false,
      aliases: [
        { id:56, text:'% of Uncalled Capital',      tier:'Core', bank:null },
        { id:57, text:'% Uncalled',                 tier:'Core', bank:null },
        { id:58, text:'Uncalled %',                 tier:'Core', bank:null },
        { id:59, text:'% Unfunded',                 tier:'Core', bank:null },
        { id:60, text:'Uncalled Ratio',             tier:'Core', bank:null },
        { id:61, text:'% Total Unfunded Commitment',tier:'Core', bank:null },
      ],
    },
    {
      id: 12, canonical: '% of LP Called',
      lpMasterField: 'Uncalled Data - % of LP Called',
      disambiguation: "Percentage of the LP's own commitment that has been drawn", isDerived: false,
      aliases: [
        { id:62, text:'% of LP Called', tier:'Core', bank:null },
        { id:63, text:'% Called',        tier:'Core', bank:null },
        { id:64, text:'Called Ratio',    tier:'Core', bank:null },
        { id:65, text:'Draw Percentage', tier:'Core', bank:null },
        { id:66, text:'% Funded',        tier:'Core', bank:null },
      ],
    },
  ]},

  { group: 'Financial Scale', fields: [
    {
      id: 13, canonical: 'AUM',
      lpMasterField: 'Financial Scale - AUM',
      disambiguation: null, isDerived: false,
      aliases: [
        { id:67, text:'AUM',                    tier:'Core', bank:null },
        { id:68, text:'Assets Under Management',tier:'Core', bank:null },
        { id:69, text:'Net Assets',             tier:'Core', bank:null },
        { id:70, text:'Net Assets (range)',     tier:'Core', bank:null },
        { id:71, text:'Total AUM',              tier:'Core', bank:null },
      ],
    },
    {
      id: 14, canonical: 'NAV',
      lpMasterField: 'Financial Scale - NAV',
      disambiguation: "Net asset value of the LP's fund interest at most recent reporting date", isDerived: false,
      aliases: [
        { id:72, text:'NAV',            tier:'Core', bank:null },
        { id:73, text:'Net Asset Value',tier:'Core', bank:null },
        { id:74, text:'Fund NAV',       tier:'Core', bank:null },
        { id:75, text:'Total NAV',      tier:'Core', bank:null },
      ],
    },
    {
      id: 15, canonical: 'Pension Assets',
      lpMasterField: 'Financial Scale - Pension Assets',
      disambiguation: 'Total pension fund assets managed by or on behalf of the LP', isDerived: false,
      aliases: [
        { id:76, text:'Pension Assets',      tier:'Core', bank:null },
        { id:77, text:'Pension Fund Assets', tier:'Core', bank:null },
        { id:78, text:'Pension Pool',        tier:'Core', bank:null },
        { id:79, text:'ERISA Assets',        tier:'Core', bank:null },
      ],
    },
    {
      id: 16, canonical: 'Pension Funded %',
      lpMasterField: 'Financial Scale - Pension Funded %',
      disambiguation: "Funded status of the LP's pension plan expressed as a percentage", isDerived: false,
      aliases: [
        { id:80, text:'Pension Funded %',      tier:'Core', bank:null },
        { id:81, text:'Pension Funding Ratio', tier:'Core', bank:null },
        { id:82, text:'Funded Status',         tier:'Core', bank:null },
        { id:83, text:'Pension Funded Ratio',  tier:'Core', bank:null },
      ],
    },
  ]},

  { group: 'Borrowing Base', fields: [
    {
      id: 17, canonical: 'Agent Advance Rate',
      lpMasterField: 'Borrowing Base - Agent Advance Rate',
      disambiguation: null, isDerived: false,
      aliases: [
        { id:84, text:'Advance Rate',      tier:'Core', bank:null },
        { id:85, text:'Agent Advance Rate',tier:'Core', bank:null },
        { id:86, text:'Adv. Rate',         tier:'Core', bank:null },
        { id:87, text:'Rate',              tier:'Core', bank:null },
        { id:88, text:'Applicable Rate',   tier:'Core', bank:null },
      ],
    },
    {
      id: 18, canonical: 'Agent Eligible Commitment',
      lpMasterField: 'Borrowing Base - Agent Eligible Commitment',
      disambiguation: 'LP uncalled commitment after per-LP concentration haircut applied; agent-calculated; maps to "Eligible Commitment" (GS/WF) and "Remaining Callable Capital Adjusted for Concentration Limit" (SVB)',
      isDerived: true,
      aliases: [
        { id:89, text:'Eligible Commitment',                                        tier:'Core', bank:null },
        { id:90, text:'Remaining Callable Capital Adjusted for Concentration Limit', tier:'Bank', bank:'SVB' },
        { id:91, text:'Eligible Uncalled',                                           tier:'Core', bank:null },
      ],
    },
    {
      id: 19, canonical: '% of Eligible Uncalled',
      lpMasterField: 'Borrowing Base - % of Eligible Uncalled',
      disambiguation: 'LP eligible uncalled as % of total eligible uncalled pool; agent-calculated; appears as "% Eligible Unfunded Commitment" in GS and WF templates',
      isDerived: true,
      aliases: [
        { id:92, text:'% Eligible Unfunded Commitment', tier:'Core', bank:null },
        { id:93, text:'% of Eligible Uncalled Capital', tier:'Core', bank:null },
        { id:94, text:'% Eligible Uncalled',            tier:'Core', bank:null },
      ],
    },
    {
      id: 20, canonical: '% of Borrowing Base',
      lpMasterField: 'Borrowing Base - % of Borrowing Base',
      disambiguation: 'LP BB contribution as % of total facility borrowing base; agent-calculated informational column',
      isDerived: true,
      aliases: [
        { id:95, text:'% of Borrowing Base', tier:'Core', bank:null },
        { id:96, text:'% BB',               tier:'Core', bank:null },
        { id:97, text:'BB Percentage',       tier:'Core', bank:null },
      ],
    },
    {
      id: 21, canonical: 'Agent Borrowing Base',
      lpMasterField: 'Borrowing Base - Agent Borrowing Base',
      disambiguation: 'LP-level borrowing base as reported by the facility agent (= Agent Eligible Commitment × Agent Advance Rate)',
      isDerived: true,
      aliases: [
        { id:98,  text:'Agent Borrowing Base',       tier:'Core', bank:null },
        { id:99,  text:'Agent BB',                   tier:'Core', bank:null },
        { id:100, text:'Facility BB',                tier:'Core', bank:null },
        { id:101, text:'Agent Base',                 tier:'Core', bank:null },
        { id:102, text:'BB Amount',                  tier:'Core', bank:null },
        { id:103, text:'Borrowing Base Contribution',tier:'Core', bank:null },
      ],
    },
  ]},

  { group: 'Concentration', fields: [
    {
      id: 22, canonical: 'Agent Concentration Limit',
      lpMasterField: 'Concentration - Agent Concentration Limit',
      disambiguation: null, isDerived: false,
      aliases: [
        { id:104, text:'Concentration Limit',      tier:'Core', bank:null },
        { id:105, text:'Agent Concentration Limit',tier:'Core', bank:null },
        { id:106, text:'Conc. Limit',              tier:'Core', bank:null },
        { id:107, text:'Excel Concentration',      tier:'Bank', bank:'BNY' },
        { id:108, text:'Max Concentration',        tier:'Core', bank:null },
      ],
    },
    {
      id: 23, canonical: 'Excess Concentration',
      lpMasterField: 'Concentration - Excess Concentration',
      disambiguation: 'Dollar amount by which LP uncalled exceeds the per-LP concentration cap; agent-calculated as max(0, uncalled − cap × total_eligible)',
      isDerived: true,
      aliases: [
        { id:109, text:'Excess Concentration', tier:'Core', bank:null },
        { id:110, text:'Conc. Overage',        tier:'Core', bank:null },
        { id:111, text:'Concentration Excess', tier:'Core', bank:null },
      ],
    },
  ]},

  { group: 'Ratings', fields: [
    {
      id: 24, canonical: 'S&P Rating',
      lpMasterField: 'Ratings - S&P Rating',
      disambiguation: 'Use last occurrence when column header repeats in same sheet', isDerived: false,
      aliases: [
        { id:112, text:"S&P",              tier:'Core', bank:null },
        { id:113, text:"S&P Rating",       tier:'Core', bank:null },
        { id:114, text:"S&P Credit Rating",tier:'Core', bank:null },
        { id:115, text:"S and P",          tier:'Core', bank:null },
        { id:116, text:"S & P's Rating",   tier:'Core', bank:null },
        { id:117, text:"S & P",            tier:'Core', bank:null },
      ],
    },
    {
      id: 25, canonical: "Moody's Rating",
      lpMasterField: "Ratings - Moody's Rating",
      disambiguation: 'Use last occurrence when column header repeats in same sheet', isDerived: false,
      aliases: [
        { id:118, text:"Moody's",         tier:'Core', bank:null },
        { id:119, text:"Moody's Rating",  tier:'Core', bank:null },
        { id:120, text:"Moodys",          tier:'Core', bank:null },
        { id:121, text:"Applicable Rating",tier:'Bank', bank:'BNY' },
      ],
    },
    {
      id: 26, canonical: 'Fitch Rating',
      lpMasterField: 'Ratings - Fitch Rating',
      disambiguation: null, isDerived: false,
      aliases: [
        { id:122, text:'Fitch',              tier:'Core', bank:null },
        { id:123, text:'Fitch Rating',       tier:'Core', bank:null },
        { id:124, text:'Fitch Credit Rating',tier:'Core', bank:null },
      ],
    },
    {
      id: 27, canonical: 'S&P Numeric Score',
      lpMasterField: 'Ratings - S&P Numeric Score',
      disambiguation: 'Goldman Sachs 0–9 numeric conversion of S&P letter rating used in advance rate tier lookup; GS-specific derived column; do not confuse with raw S&P letter rating',
      isDerived: true,
      aliases: [
        { id:125, text:'S&P (numerical ratings scale, 0-9)', tier:'Bank', bank:'GS' },
      ],
    },
    {
      id: 28, canonical: "Moody's Numeric Score",
      lpMasterField: "Ratings - Moody's Numeric Score",
      disambiguation: "Goldman Sachs 0–9 numeric conversion of Moody's letter rating; GS-specific derived column",
      isDerived: true,
      aliases: [
        { id:126, text:"Moody's (numerical ratings scale, 0-9)", tier:'Bank', bank:'GS' },
      ],
    },
    {
      id: 29, canonical: 'Agent Numeric Rating',
      lpMasterField: 'Ratings - Agent Numeric Rating',
      disambiguation: "Goldman Sachs composite 0–9 score (higher of S&P / Moody's numeric) that drives the advance rate tier; GS-specific; bank-scoped alias — distinct from BNY's letter-rating alias 'Applicable Rating' → Moody's Rating",
      isDerived: true,
      aliases: [
        { id:127, text:'Applicable Rating (numerical ratings scale, 0-9)', tier:'Bank', bank:'GS' },
      ],
    },
  ]},
]

export const GLOBAL_BLOCKLIST = [
  { id:1, qualifier:'Adjusted',            reason:'Post-processed — concentration or eligibility already applied' },
  { id:2, qualifier:'Eligible',            reason:'Post-eligibility filter applied — not a raw input field' },
  { id:3, qualifier:'Capped',              reason:'Concentration cap already applied upstream' },
  { id:4, qualifier:'Net of',              reason:'Net value includes deductions — not a raw commitment' },
  { id:5, qualifier:'Post-Haircut',        reason:'Haircut already applied upstream' },
  { id:6, qualifier:'After Concentration', reason:'Concentration already factored in' },
]

export const PENDING_SUGGESTIONS = [
  { id:1, extracted:'Outstanding Callable Balance', canonical:'Uncalled Capital', group:'Uncalled Data',  suggestedBy:'J. Martinez', bank:'Citi', submission:'CITI-0089', date:'2026-05-02', source:'User', confidence:null },
  { id:2, extracted:'Applicable Rating',            canonical:"Moody's Rating",  group:'Ratings',        suggestedBy:'AI Engine',   bank:'BNY',  submission:'BNY-0041',  date:'2026-05-05', source:'AI',   confidence:82   },
]

export const ALL_CANONICAL_FIELDS = ALIAS_GROUPS.flatMap(g =>
  g.fields.map(f => ({ value: f.canonical, label: `${g.group} › ${f.canonical}` }))
)
