import { useEffect, type CSSProperties, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose?: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  width?: number | string
}

export default function Modal({ open, onClose, title, subtitle, children, footer, width }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const boxStyle: CSSProperties = width ? { width } : {}

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="modal-box" style={boxStyle}>
        {title && (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: subtitle ? 4 : 16 }}>
            <div style={{ minWidth: 0 }}>
              {title && <div className="modal-title">{title}</div>}
            </div>
            {onClose && (
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, color: 'var(--muted)', padding: '0 0 0 12px', flexShrink: 0, marginTop: -2 }} aria-label="Close">×</button>
            )}
          </div>
        )}
        {subtitle && <div className="modal-subtitle">{subtitle}</div>}
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
