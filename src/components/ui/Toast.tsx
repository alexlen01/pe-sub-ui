import { useApp } from '../../context/AppContext'

export default function Toast() {
  const { toasts } = useApp()
  return (
    <>
      {toasts.map((t, i) => (
        <div key={t.id} className="toast toast-enter" style={{ bottom: 24 + i * 52 }}>{t.msg}</div>
      ))}
    </>
  )
}
