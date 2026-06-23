// Upload wizard shared configuration.

export const WIZARD_STEPS = [
  'Select Facility',
  'Upload Document',
  'Review Extraction',
  'Review Matches',
  'LP Category & Rate Assignment',
] as const

export type WizardStep = typeof WIZARD_STEPS[number]

export const SNAPSHOT_OPTIONS = [
  'May 2026 (latest)',
  'April 2026',
  'March 2026',
] as const

// Calculation mode options for the Run Shadow BB step
export interface CalcMode {
  id:          string
  title:       string
  desc:        string
  recommended: boolean
}

// Calculation mode options for the Run Shadow BB step
export const CALC_MODES: CalcMode[] = [
  {
    id:          'full',
    title:       'Full Recalculation',
    desc:        'Recompute all eligibility rules, advance rates, and LP classifications from scratch against the uploaded Agent BB.',
    recommended: true,
  },
  {
    id:          'incremental',
    title:       'Incremental Update',
    desc:        'Apply only the delta from newly matched and accepted LPs. Existing Shadow BB lines remain unchanged.',
    recommended: false,
  },
  {
    id:          'preview',
    title:       'Preview Only',
    desc:        'Calculate and display the Shadow BB without committing results. Useful for scenario analysis before finalising.',
    recommended: false,
  },
]
