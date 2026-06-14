// LP name-matching algorithm configuration.
// Used by MatchThresholds screen, MatchQueue pattern recognition, and matching services.

export interface MatchThresholds {
  autoAccept:    number
  reviewQueue:   number
  noMatch:       number
  jwWeight:      number
  levWeight:     number
  stripSuffixes: boolean
  caseFold:      boolean
  punctuation:   boolean
  abbrevExpand:  boolean
  retirementNormalize?: boolean
}

export interface LegalSuffix {
  abbr:  string
  full:  string
  strip: boolean
}

export interface KnownAbbreviation {
  token:     string
  expansion: string
}

export const DEFAULT_THRESHOLDS: MatchThresholds = {
  autoAccept:    95,
  reviewQueue:   80,
  noMatch:       50,
  jwWeight:      0.6,
  levWeight:     0.4,
  stripSuffixes: true,
  caseFold:      true,
  punctuation:   true,
  abbrevExpand:  true,
  retirementNormalize: true,
}

// Legal entity suffixes — stripped before comparison when suffix stripping is enabled
export const LEGAL_SUFFIXES: LegalSuffix[] = [
  { abbr: 'LP',   full: 'Limited Partnership',              strip: true  },
  { abbr: 'LLC',  full: 'Limited Liability Company',        strip: true  },
  { abbr: 'Ltd',  full: 'Limited',                          strip: true  },
  { abbr: 'Pte.', full: 'Private (Singapore)',              strip: true  },
  { abbr: 'LLP',  full: 'Limited Liability Partnership',    strip: true  },
  { abbr: 'GmbH', full: 'Gesellschaft mit beschrankter Haftung', strip: true },
  { abbr: 'Mgmt', full: 'Management',                       strip: false },
  { abbr: 'Inv.', full: 'Investments / Investors',          strip: false },
]

// Regex-keyed abbreviation map used by the normalisation pipeline
export const ABBREV_REGEX_MAP: Record<string, string> = {
  'Inv\\.?':          'Investment',
  'Mgmt':             'Management',
  'Fam\\.?':          'Family',
  'Auth\\.?':         'Authority',
  'Co\\.?(?=\\s|$)':  'Company',
  'Corp\\.?':         'Corporation',
}

// Well-known acronym expansions used before matching
export const KNOWN_ABBREVIATIONS: KnownAbbreviation[] = [
  // Sovereign / institutional investors
  { token: 'GIC',     expansion: 'Government Investment Corporation'               },
  { token: 'ADIA',    expansion: 'Abu Dhabi Investment Authority'                  },
  { token: 'CPPIB',   expansion: 'Canada Pension Plan Investment Board'            },
  { token: 'OTPP',    expansion: 'Ontario Teachers Pension Plan'                   },
  { token: 'CalPERS', expansion: 'California Public Employees Retirement System'   },
  // Agent banks (also appear as LPs in co-invest / NAV structures)
  { token: 'JPM',     expansion: 'JPMorgan Chase'                                  },
  { token: 'BofA',    expansion: 'Bank of America'                                 },
  { token: 'BAML',    expansion: 'Bank of America Merrill Lynch'                   },
  { token: 'WF',      expansion: 'Wells Fargo'                                     },
  { token: 'PNC',     expansion: 'PNC Bank'                                        },
]
