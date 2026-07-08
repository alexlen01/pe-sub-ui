// Screen metadata: titles and subtitles rendered in TopBar.
// Add new screens here alongside their entry in App.tsx SCREEN_MAP.

export interface ScreenMeta {
  title: string
  sub:   string
}

export const SCREENS: Record<string, ScreenMeta> = {
  dashboard:           { title: 'Dashboard',                sub: 'PE Sub Borrowing Base Platform'                                                                   },
  upload:              { title: 'Upload Agent BB',          sub: 'Ingest agent borrowing base document for a facility'                                              },
  'lp-master':         { title: 'LP Master Database',       sub: 'Single LP identity across all facilities'                                                         },
  'shadow-bb':         { title: 'Shadow BB',                sub: 'Borrowing base calculation and LP classification'                                                 },
  reports:             { title: 'Reports',                  sub: 'Generate, schedule, and export borrowing base and collateral analysis reports'                    },
  configuration:       { title: 'Configuration',            sub: 'Eligibility rules, advance rates, and classification tiers'                                       },
  audit:               { title: 'Audit Trail',              sub: 'Complete immutable log of all platform events — 7-year retention'                                 },
  'match-thresholds':  { title: 'Match Thresholds',         sub: 'Tune LP name-matching algorithm parameters and normalisation rules'                               },
  'field-mapping':     { title: 'Field Mapping Dictionary', sub: 'Manage alias groups, qualifier blocklist, and pending suggestions for Agent BB column extraction' },
  'extraction-preview':{ title: 'Review Extraction',        sub: 'Review extracted LP records from the uploaded Agent BB'                                           },
  'match-queue':       { title: 'LP Match Queue',           sub: 'LP name matches requiring credit officer review'                                                  },
  'run-shadow-bb':     { title: 'LP Category & Shadow BB',  sub: 'Assign LP categories, advance rates, and run Shadow BB for the current submission'                   },
  'bb-templates':      { title: 'BB Template Registry',     sub: 'Manage Agent BB workbook format definitions — tabs, header positions, LP category group sections'      },
}
