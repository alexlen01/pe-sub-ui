export const ALIAS_GROUPS = [
  { group: 'Identity & Classification', fields: [
    { canonical: 'Investor Name', lpMasterField: 'Identity & Classification - Investor Name', disambiguation: null, aliases: [{ id:1,text:'Investor Name',tier:'Core',bank:null},{id:2,text:'Investor Name (Agent Records)',tier:'Core',bank:null},{id:3,text:'Investor',tier:'Core',bank:null},{id:4,text:'LP Name',tier:'Core',bank:null},{id:5,text:'Limited Partner',tier:'Core',bank:null},{id:6,text:'Fund Investor',tier:'Bank',bank:'SVB'}] },
    { canonical: 'LP Classification', lpMasterField: 'Identity & Classification - LP Classification', disambiguation: "Extract the Agent's own category label as-is", aliases: [{id:1,text:'LP Type',tier:'Core',bank:null},{id:2,text:'Investor Type',tier:'Core',bank:null},{id:3,text:'Classification',tier:'Core',bank:null},{id:4,text:'Category',tier:'Core',bank:null},{id:5,text:'Investor Category',tier:'Core',bank:null},{id:6,text:'LP Classification',tier:'Core',bank:null},{id:7,text:'Entity Type',tier:'Bank',bank:'BNY'},{id:8,text:'Investor Class',tier:'Bank',bank:'JPM'}] },
    { canonical: 'Transferee', lpMasterField: 'Identity & Classification - Transferee', disambiguation: 'Y where LP received a transferred commitment; blank otherwise', aliases: [{id:1,text:'Transferee',tier:'Core',bank:null},{id:2,text:'Transfer Flag',tier:'Core',bank:null},{id:3,text:'Assignee',tier:'Core',bank:null},{id:4,text:'Assignment Flag',tier:'Core',bank:null},{id:5,text:'Transferred LP',tier:'Core',bank:null}] },
    { canonical: 'Parent / Sponsor', lpMasterField: 'Identity & Classification - Parent / Sponsor', disambiguation: 'Ultimate parent or sponsoring entity of the LP', aliases: [{id:1,text:'Parent / Sponsor',tier:'Core',bank:null},{id:2,text:'Parent',tier:'Core',bank:null},{id:3,text:'Sponsor',tier:'Core',bank:null},{id:4,text:'Parent Entity',tier:'Core',bank:null},{id:5,text:'Sponsoring Entity',tier:'Core',bank:null},{id:6,text:'Ultimate Parent',tier:'Core',bank:null},{id:7,text:'Parent Organization',tier:'Core',bank:null}] },
  ]},
  { group: 'Commitment Data', fields: [
    { canonical: 'Capital Commitments', lpMasterField: 'Commitment Data - Capital Commitments', disambiguation: 'Prefer "Individual" prefix column over aggregate when both present', aliases: [{id:10,text:'Capital Commitments',tier:'Core',bank:null},{id:11,text:'Committed Capital',tier:'Core',bank:null},{id:12,text:'Original Commitment',tier:'Core',bank:null},{id:13,text:'Individual Original Commitment',tier:'Core',bank:null},{id:14,text:'Total Commitment',tier:'Core',bank:null},{id:15,text:'Commitment (USD)',tier:'Bank',bank:'BNY'}] },
    { canonical: '% of Capital Commitments', lpMasterField: 'Commitment Data - % of Capital Commitments', disambiguation: "LP's commitment as a percentage of total fund commitments", aliases: [{id:16,text:'% of Capital Commitments',tier:'Core',bank:null},{id:17,text:'% Commitment',tier:'Core',bank:null},{id:18,text:'Commitment Percentage',tier:'Core',bank:null},{id:19,text:'LP Commitment %',tier:'Core',bank:null}] },
    { canonical: 'Called Capital', lpMasterField: 'Commitment Data - Called Capital', disambiguation: 'Cumulative capital drawn from the LP to date', aliases: [{id:20,text:'Called Capital',tier:'Core',bank:null},{id:21,text:'Drawn Capital',tier:'Core',bank:null},{id:22,text:'Funded Capital',tier:'Core',bank:null},{id:23,text:'Capital Drawn',tier:'Core',bank:null},{id:24,text:'Funded Commitment',tier:'Core',bank:null},{id:25,text:'Called Commitment',tier:'Core',bank:null}] },
  ]},
  { group: 'Uncalled Data', fields: [
    { canonical: 'Uncalled Capital', lpMasterField: 'Uncalled Data - Uncalled Capital', disambiguation: 'Prefer "Individual" prefix; skip column if any qualifier blocklist term matches header', aliases: [{id:1,text:'Uncalled Capital',tier:'Core',bank:null},{id:2,text:'Unfunded Capital Commitment',tier:'Core',bank:null},{id:3,text:'Individual Unfunded Commitment',tier:'Core',bank:null},{id:4,text:'Unfunded Commitment',tier:'Core',bank:null},{id:5,text:'Remaining Callable Capital',tier:'Bank',bank:'SVB'},{id:6,text:'Remaining Commitment',tier:'Core',bank:null},{id:7,text:'Uncalled Capital (USD)',tier:'Bank',bank:'BNY'}] },
    { canonical: '% of Uncalled Capital', lpMasterField: 'Uncalled Data - % of Uncalled Capital', disambiguation: "LP's uncalled capital as a percentage of total fund uncalled", aliases: [{id:1,text:'% of Uncalled Capital',tier:'Core',bank:null},{id:2,text:'% Uncalled',tier:'Core',bank:null},{id:3,text:'Uncalled %',tier:'Core',bank:null},{id:4,text:'% Unfunded',tier:'Core',bank:null},{id:5,text:'Uncalled Ratio',tier:'Core',bank:null}] },
    { canonical: '% of LP Called', lpMasterField: 'Uncalled Data - % of LP Called', disambiguation: "Percentage of the LP's own commitment that has been drawn", aliases: [{id:1,text:'% of LP Called',tier:'Core',bank:null},{id:2,text:'% Called',tier:'Core',bank:null},{id:3,text:'Called Ratio',tier:'Core',bank:null},{id:4,text:'Draw Percentage',tier:'Core',bank:null},{id:5,text:'% Funded',tier:'Core',bank:null}] },
  ]},
  { group: 'Financial Scale', fields: [
    { canonical: 'AUM', lpMasterField: 'Financial Scale - AUM', disambiguation: null, aliases: [{id:30,text:'AUM',tier:'Core',bank:null},{id:31,text:'Assets Under Management',tier:'Core',bank:null},{id:32,text:'Net Assets',tier:'Core',bank:null},{id:33,text:'Net Assets (range)',tier:'Core',bank:null},{id:34,text:'Total AUM',tier:'Core',bank:null}] },
    { canonical: 'NAV', lpMasterField: 'Financial Scale - NAV', disambiguation: 'Net asset value of the LP\'s fund interest at most recent reporting date', aliases: [{id:35,text:'NAV',tier:'Core',bank:null},{id:36,text:'Net Asset Value',tier:'Core',bank:null},{id:37,text:'Fund NAV',tier:'Core',bank:null},{id:38,text:'Total NAV',tier:'Core',bank:null}] },
    { canonical: 'Pension Assets', lpMasterField: 'Financial Scale - Pension Assets', disambiguation: 'Total pension fund assets managed by or on behalf of the LP', aliases: [{id:39,text:'Pension Assets',tier:'Core',bank:null},{id:40,text:'Pension Fund Assets',tier:'Core',bank:null},{id:41,text:'Pension Pool',tier:'Core',bank:null},{id:42,text:'ERISA Assets',tier:'Core',bank:null}] },
    { canonical: 'Pension Funded %', lpMasterField: 'Financial Scale - Pension Funded %', disambiguation: "Funded status of the LP's pension plan expressed as a percentage", aliases: [{id:43,text:'Pension Funded %',tier:'Core',bank:null},{id:44,text:'Pension Funding Ratio',tier:'Core',bank:null},{id:45,text:'Funded Status',tier:'Core',bank:null},{id:46,text:'Pension Funded Ratio',tier:'Core',bank:null}] },
  ]},
  { group: 'Borrowing Base', fields: [
    { canonical: 'Agent Advance Rate', lpMasterField: 'Borrowing Base - Agent Advance Rate', disambiguation: null, aliases: [{id:1,text:'Advance Rate',tier:'Core',bank:null},{id:2,text:'Agent Advance Rate',tier:'Core',bank:null},{id:3,text:'Adv. Rate',tier:'Core',bank:null},{id:4,text:'Rate',tier:'Core',bank:null},{id:5,text:'Applicable Rate',tier:'Core',bank:null}] },
  ]},
  { group: 'Concentration', fields: [
    { canonical: 'Agent Concentration Limit', lpMasterField: 'Concentration - Agent Concentration Limit', disambiguation: null, aliases: [{id:1,text:'Concentration Limit',tier:'Core',bank:null},{id:2,text:'Agent Concentration Limit',tier:'Core',bank:null},{id:3,text:'Conc. Limit',tier:'Core',bank:null},{id:4,text:'Excel Concentration',tier:'Bank',bank:'BNY'},{id:5,text:'Max Concentration',tier:'Core',bank:null}] },
    { canonical: 'Agent Borrowing Base', lpMasterField: 'Concentration - Agent Borrowing Base', disambiguation: 'LP-level borrowing base as reported by the facility agent', aliases: [{id:1,text:'Agent Borrowing Base',tier:'Core',bank:null},{id:2,text:'Agent BB',tier:'Core',bank:null},{id:3,text:'Facility BB',tier:'Core',bank:null},{id:4,text:'Agent Base',tier:'Core',bank:null},{id:5,text:'BB Amount',tier:'Core',bank:null}] },
  ]},
  { group: 'Ratings', fields: [
    { canonical: 'S&P Rating', lpMasterField: 'Ratings - S&P Rating', disambiguation: 'Use last occurrence when column header repeats in same sheet', aliases: [{id:60,text:"S&P",tier:'Core',bank:null},{id:61,text:"S&P Rating",tier:'Core',bank:null},{id:62,text:"S&P Credit Rating",tier:'Core',bank:null},{id:63,text:"S and P",tier:'Core',bank:null}] },
    { canonical: "Moody's Rating", lpMasterField: "Ratings - Moody's Rating", disambiguation: 'Use last occurrence when column header repeats in same sheet', aliases: [{id:70,text:"Moody's",tier:'Core',bank:null},{id:71,text:"Moody's Rating",tier:'Core',bank:null},{id:72,text:"Moodys",tier:'Core',bank:null},{id:73,text:"Applicable Rating",tier:'Bank',bank:'BNY'}] },
    { canonical: 'Fitch Rating', lpMasterField: 'Ratings - Fitch Rating', disambiguation: 'Use last occurrence when column header repeats in same sheet', aliases: [{id:74,text:'Fitch',tier:'Core',bank:null},{id:75,text:'Fitch Rating',tier:'Core',bank:null},{id:76,text:'Fitch Credit Rating',tier:'Core',bank:null}] },
  ]},
]

export const GLOBAL_BLOCKLIST = [
  { id:1,qualifier:'Adjusted',           reason:'Post-processed — concentration or eligibility already applied' },
  { id:2,qualifier:'Eligible',           reason:'Post-eligibility filter applied — not a raw input field' },
  { id:3,qualifier:'Capped',             reason:'Concentration cap already applied upstream' },
  { id:4,qualifier:'Net of',             reason:'Net value includes deductions — not a raw commitment' },
  { id:5,qualifier:'Post-Haircut',       reason:'Haircut already applied upstream' },
  { id:6,qualifier:'After Concentration',reason:'Concentration already factored in' },
]

export const PENDING_SUGGESTIONS = [
  { id:1, extracted:'Outstanding Callable Balance', canonical:'Uncalled Capital',   group:'Uncalled Data',  suggestedBy:'J. Martinez', bank:'Citi', submission:'CITI-0089', date:'2026-05-02', source:'User', confidence:null  },
  { id:2, extracted:'Applicable Rating',            canonical:"Moody's Rating",     group:'Ratings',        suggestedBy:'AI Engine',   bank:'BNY',  submission:'BNY-0041',  date:'2026-05-05', source:'AI',   confidence:82    },
]

export const ALL_CANONICAL_FIELDS = ALIAS_GROUPS.flatMap(g =>
  g.fields.map(f => ({ value: f.canonical, label: `${g.group} › ${f.canonical}` }))
)
