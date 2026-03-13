type CommissionTier = {
  minAmount: string
  maxAmount: string | null
  commissionPercentage: string
}

type CommissionRule = {
  id: string
  ruleType: 'percentage' | 'fixed' | 'tiered'
  basePercentage?: string | null
  minCommission?: string | null
  maxCommission?: string | null
  brand?: string | null
  tierMode?: string | null
  description?: string | null
}

export class CommissionService {
  // Fallback implementation until payroll schema/tables are restored.
  async getActiveCommissionRules(_tenantId: string, _asOfDate?: string): Promise<CommissionRule[]> {
    return []
  }

  async getCommissionTiers(_ruleId: string): Promise<CommissionTier[]> {
    return []
  }

  async calculateTieredCommission(ruleId: string, amount: number): Promise<number> {
    const tiers = await this.getCommissionTiers(ruleId)
    if (tiers.length === 0) return 0
    const sorted = tiers
      .slice()
      .sort((a, b) => parseFloat(a.minAmount) - parseFloat(b.minAmount))

    let commission = 0
    for (const tier of sorted) {
      const min = parseFloat(tier.minAmount)
      const max = tier.maxAmount ? parseFloat(tier.maxAmount) : Infinity
      const amountInTier = Math.max(0, Math.min(amount, max) - min)
      if (amountInTier > 0) {
        const rate = parseFloat(tier.commissionPercentage)
        if (!Number.isNaN(rate)) {
          commission += (amountInTier * rate) / 100
        }
      }
    }
    return Math.round(commission * 100) / 100
  }

  async calculateTieredCommissionForPeriod(ruleId: string, periodTotal: number): Promise<number> {
    return this.calculateTieredCommission(ruleId, periodTotal)
  }

  async calculateTieredCommissionForPeriodByBrand(
    ruleId: string,
    periodTotalsByBrand: Record<string, number>,
  ): Promise<Record<string, number>> {
    const output: Record<string, number> = {}
    for (const [brand, total] of Object.entries(periodTotalsByBrand)) {
      output[brand] = await this.calculateTieredCommission(ruleId, total)
    }
    return output
  }
}

export const commissionService = new CommissionService()
