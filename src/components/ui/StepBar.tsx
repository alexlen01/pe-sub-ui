interface StepBarProps { steps: readonly string[]; current: number }

export default function StepBar({ steps, current }: StepBarProps) {
  return (
    <div className="step-bar">
      {steps.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : ''
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <div className={`step ${state}`}>
              <div className="step-num">{state === 'done' ? '✓' : i + 1}</div>
              {label}
            </div>
            {i < steps.length - 1 && <span className="step-arrow">›</span>}
          </div>
        )
      })}
    </div>
  )
}
