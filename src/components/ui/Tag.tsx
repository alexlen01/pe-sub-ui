const CLS_MAP: Record<string, string> = {
  'Rated':          'tag-rated',
  'Unrated >2bn':   'tag-un2',
  'Unrated 1–2bn':  'tag-un1',
  'Eligible':       'tag-elig',
  'Excluded':       'tag-excl',
  'In Progress':    'tag-inprogress',
  'Needs Review':   'tag-needsreview',
  'Not Started':    'tag-notstarted',
  'Active':         'tag-active',
  'Pending':        'tag-pending',
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
