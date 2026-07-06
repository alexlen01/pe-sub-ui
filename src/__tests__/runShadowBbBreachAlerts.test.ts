import { describe, it, expect } from 'vitest'
import { buildBreachAlerts } from '../screens/RunShadowBB'
import type { BBBreach } from '../types/bb'

// After a Shadow BB run the server response carries the breaches evaluated against the
// Concentration Limits config. The Run Shadow BB screen must surface them as attention
// events: a red alert box for breaches, an amber one for warnings, and a relabelled
// primary action when anything must be resolved.

const singleLpBreach: BBBreach = {
  type: 'single-lp', severity: 'breach',
  message: 'CalPERS exceeds 40% single-lp concentration', value: 0.5, limit: 0.4,
}
const top10Warning: BBBreach = {
  type: 'top10', severity: 'warning',
  message: 'Top-10 LPs between 80–90% of UBS BB', value: 0.8333, limit: 0.9,
}

describe('buildBreachAlerts', () => {
  it('partitions server breaches by severity', () => {
    const model = buildBreachAlerts([singleLpBreach, top10Warning])
    expect(model.hardBreaches).toEqual([singleLpBreach])
    expect(model.warnings).toEqual([top10Warning])
  })

  it('renders the breach header with count and resolution demand', () => {
    const model = buildBreachAlerts([singleLpBreach])
    expect(model.breachHeader).toBe(
      '⚠ 1 concentration breach — must resolve before submitting BB certificate to agent')
    expect(model.warningHeader).toBeNull()
  })

  it('pluralises the breach header for multiple breaches', () => {
    const second: BBBreach = { ...singleLpBreach, message: 'CalSTRS exceeds 40% single-lp concentration' }
    const model = buildBreachAlerts([singleLpBreach, second])
    expect(model.breachHeader).toBe(
      '⚠ 2 concentration breaches — must resolve before submitting BB certificate to agent')
  })

  it('renders the warning header when only warnings exist', () => {
    const model = buildBreachAlerts([top10Warning])
    expect(model.breachHeader).toBeNull()
    expect(model.warningHeader).toBe(
      '⚠ 1 concentration warning — approaching limit, monitor closely')
  })

  it('relabels the primary action only when a hard breach exists', () => {
    expect(buildBreachAlerts([singleLpBreach]).primaryButtonLabel).toBe('Review Breaches in BB Results')
    expect(buildBreachAlerts([top10Warning]).primaryButtonLabel).toBe('View BB Results')
    expect(buildBreachAlerts([]).primaryButtonLabel).toBe('View BB Results')
  })
})
