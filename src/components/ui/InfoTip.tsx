import { useState } from 'react'

interface InfoItem { label: string; desc: string }

interface InfoTipProps {
  items: InfoItem[]
  title?: string
  align?: 'left' | 'right'
  width?: number
}

export default function InfoTip({ items, title = 'Legend', align = 'right', width = 310 }: InfoTipProps) {
  const [show, setShow] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15, borderRadius: '50%', border: '1.5px solid var(--muted)', color: 'var(--muted)', fontSize: 9, fontWeight: 700, cursor: 'default', userSelect: 'none' }}
      >i</span>
      {show && (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', [align === 'left' ? 'left' : 'right']: 0, zIndex: 200, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: '10px 14px', width, pointerEvents: 'none' }}>
          <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--navy)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
          {items.map((r, i, arr) => (
            <div key={r.label} style={{ paddingBottom: i < arr.length - 1 ? 7 : 0, marginBottom: i < arr.length - 1 ? 7 : 0, borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{r.label}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.45 }}>{r.desc}</div>
            </div>
          ))}
        </div>
      )}
    </span>
  )
}
