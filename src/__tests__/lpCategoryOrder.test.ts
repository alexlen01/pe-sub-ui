import { describe, expect, it } from 'vitest'
import { sortLpCategoriesByRate } from '../utils/lpCategoryOrder'

describe('sortLpCategoriesByRate', () => {
  it('orders LP categories by descending advance rate', () => {
    const rates = {
      Excluded: '0%',
      HNW: '50%',
      Feeder: '65%',
      Institutional: '75%',
      Rated: '90%',
    }

    expect(sortLpCategoriesByRate(Object.keys(rates), rates)).toEqual([
      'Rated',
      'Institutional',
      'Feeder',
      'HNW',
      'Excluded',
    ])
  })

  it('uses configured order to break equal-rate ties', () => {
    const categories = ['Second', 'Missing second', 'First', 'Missing first', 'Unconfigured']
    const rates = { First: '75%', Second: '75%', Unconfigured: '75%' }

    expect(sortLpCategoriesByRate(categories, rates, ['First', 'Second', 'Missing first', 'Missing second'])).toEqual([
      'First',
      'Second',
      'Unconfigured',
      'Missing first',
      'Missing second',
    ])
  })
})
