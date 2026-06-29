import { useApp } from '../../context/AppContext'

export default function Toast() {
  const { toasts, dismissToast } = useApp()
  return (
    <>
      {toasts.map((t, i) => (
        <div key={t.id} className={`toast toast-enter${t.variant === 'warning' ? ' toast-warning' : ''}`} style={{ bottom: 24 + i * 52 }}>
          <span>{t.msg}</span>
          <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={() => dismissToast(t.id)}>x</button>
        </div>
      ))}
    </>
  )
}
