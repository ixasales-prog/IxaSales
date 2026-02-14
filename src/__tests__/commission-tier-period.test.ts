import { describe, it, expect, beforeEach } from 'vitest'
import { commissionService } from '../services/payroll/commissionService'

describe('Commission per-period tiering (Phase A)', () => {
  beforeEach(() => {
    // Mock tiers for rule 'r1'
    ;(commissionService as any).getCommissionTiers = async (_ruleId: string) => [
      { id: 't1', minAmount: '0', maxAmount: '1000', commissionPercentage: '5', sortOrder: 0 },
      { id: 't2', minAmount: '1000', maxAmount: '5000', commissionPercentage: '7', sortOrder: 1 },
      { id: 't3', minAmount: '5000', maxAmount: null, commissionPercentage: '10', sortOrder: 2 },
    ];
  })

  it('period 800 yields approx 40', async () => {
    const val = await (commissionService as any).calculateTieredCommissionForPeriod('r1', 800)
    expect(val).toBeCloseTo(40)
  })

  it('period 1200 yields approx 64', async () => {
    const val = await (commissionService as any).calculateTieredCommissionForPeriod('r1', 1200)
    expect(val).toBeCloseTo(64)
  })

  it('brand map computes per-brand tier contributions', async () => {
    const byBrand = { BrandA: 800, BrandB: 1200 }
    const res = await (commissionService as any).calculateTieredCommissionForPeriodByBrand('r1', byBrand)
    expect(res.BrandA).toBeCloseTo(40)
    expect(res.BrandB).toBeCloseTo(64)
  })
})
