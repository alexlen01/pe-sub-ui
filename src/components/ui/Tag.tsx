const CLS_MAP: Record<string, string> = {
  // UBS LP Classification → colour tag. Keys mirror the DB-seeded CLS_TAG_MAP
  // (V1_3__config.sql) so the classification badge colour-codes consistently
  // across LP Master, Run Shadow BB, and Shadow BB.
  'Rated Investor':             'tag-rated',
  'Corp Pension > $5Bn Assets': 'tag-un1',
  'Corp Pension > $1Bn Assets': 'tag-un1',
  'Unrated NAV > $1Bn':         'tag-un2',
  'FoF & Other > $10Bn AUM':    'tag-un2',
  'Other Institutional':        'tag-elig',
  'HNW Feeder (acceptable)':    'tag-elig',
  'HNW (acceptable)':           'tag-elig',
  'Excluded':                   'tag-excl',
  'In Progress':    'tag-inprogress',
  'Needs Review':   'tag-needsreview',
  'Not Started':    'tag-notstarted',
  'Active':         'tag-active',
  'Pending':        'tag-pending',
  'Pending Review': 'tag-pending',
  'Review':         'tag-review',
  'Processed':      'tag-processed',
  'Processing':     'tag-processing',
  'Draft':          'tag-draft',
  'Aborted':        'tag-aborted',
  'Cancelled':      'tag-aborted',
  'Error':          'tag-excl',
}

import type { CSSProperties } from 'react'
interface TagProps { children: string; variant?: string; style?: CSSProperties }

export default function Tag({ children, variant, style }: TagProps) {
  const cls = variant ? `tag tag-${variant}` : `tag ${CLS_MAP[children] ?? ''}`
  return <span className={cls} style={style}>{children}</span>
}
