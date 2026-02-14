import { salaryService } from './salaryService';
import { KPIService } from './kpiService';
import { commissionService } from './commissionService';

// MVP: Simple payroll runner for salary + commissions + advances (no KPI yet).
// This runs for a given period and creates payroll_records entries per active employee.
export class SimplePayrollRunner {
  // Helper: fetch period total sales for an employee in the period
  async getPeriodTotal(tenantId: string, employee: any, startDate: string, endDate: string) {
    const userId = employee.userId;
    const baseQuery1 = `SELECT COALESCE(SUM(totalAmount),0) as total FROM orders WHERE tenant_id = '${tenantId}' AND salesRepId = '${userId}' AND orderDate >= '${startDate}' AND orderDate <= '${endDate}'`;
    try {
      const res = await (require('../../db') as any).db.query(baseQuery1);
      return Number(res[0]?.total || 0);
    } catch {
      const baseQuery2 = `SELECT COALESCE(SUM(totalAmount),0) as total FROM orders WHERE tenant_id = '${tenantId}' AND salesRepId = '${userId}' AND createdAt >= '${startDate}' AND createdAt <= '${endDate}'`;
      try {
        const res2 = await (require('../../db') as any).db.query(baseQuery2);
        return Number(res2[0]?.total || 0);
      } catch {
        return 0;
      }
    }
  }

  // Helper: compute per-brand totals for an employee in the period
  async getBrandTotals(tenantId: string, employee: any, startDate: string, endDate: string) {
    const userId = employee.userId;
    const byBrand: Record<string, number> = {};
    const q1 = `SELECT brand, SUM(totalAmount) as total FROM orders WHERE tenant_id = '${tenantId}' AND salesRepId = '${userId}' AND orderDate >= '${startDate}' AND orderDate <= '${endDate}' GROUP BY brand`;
    try {
      const rows = await (require('../../db') as any).db.query(q1);
      for (const r of rows) byBrand[r.brand] = Number(r.total || 0);
      return byBrand;
    } catch {
      const q2 = `SELECT brand, SUM(totalAmount) as total FROM orders WHERE tenant_id = '${tenantId}' AND salesRepId = '${userId}' AND createdAt >= '${startDate}' AND createdAt <= '${endDate}' GROUP BY brand`;
      try {
        const rows2 = await (require('../../db') as any).db.query(q2);
        rows2.forEach((r: any) => {
          byBrand[r.brand] = Number(r.total || 0);
        });
      } catch {
        // ignore
      }
      return byBrand;
    }
  }

  // Phase B: per-order if needed in future (toggle via marker). Retrieve orders for period per employee.
  async getOrdersForPeriod(tenantId: string, userId: string, startDate: string, endDate: string) {
    const q = `SELECT totalAmount FROM orders WHERE tenant_id = '${tenantId}' AND salesRepId = '${userId}' AND orderDate >= '${startDate}' AND orderDate <= '${endDate}'`;
    try {
      const rows = await (require('../../db') as any).db.query(q);
      return rows;
    } catch {
      const q2 = `SELECT totalAmount FROM orders WHERE tenant_id = '${tenantId}' AND salesRepId = '${userId}' AND createdAt >= '${startDate}' AND createdAt <= '${endDate}'`;
      try {
        const rows2 = await (require('../../db') as any).db.query(q2);
        return rows2;
      } catch {
        return [];
      }
    }
  }

  async runPeriod(tenantId: string, periodId: string, startDate: string, endDate: string) {
    // Fetch active salary configurations for the tenant
    const activeSalaries = await salaryService.getActiveSalaryConfigurations(tenantId, endDate);

    // Compute period days (inclusive)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    const periodDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
    const monthDays = 30; // MVP assumption

    // For MVP, compute simple payroll line per employee (no DB writes yet)
    const results: any[] = [];
    // Compute period totals and tiered commissions (per-period) using orders data
    const tieredRules = (await commissionService.getActiveCommissionRules(tenantId, endDate)).filter((r: any)=> r.ruleType === 'tiered');
    for (const s of (activeSalaries as any[])) {
      const baseSalary = Number((s as any).baseSalary || 0);
      const proratedBase = this.prorate(baseSalary, periodDays, monthDays);
      // Aggregations for tiered commissions
      const periodTotal = await this.getPeriodTotal(tenantId, s, startDate, endDate);
      const brandTotals = await this.getBrandTotals(tenantId, s, startDate, endDate);
      let totalCommission = 0;
      const brandTotalsOut: Record<string, number> = {};
      for (const rule of tieredRules) {
        if ((rule as any).brand) {
          const map = await commissionService.calculateTieredCommissionForPeriodByBrand(rule.id, brandTotals);
          for (const [brand, val] of Object.entries(map)) {
            brandTotalsOut[brand] = (brandTotalsOut[brand] || 0) + val;
            totalCommission += val;
          }
        } else {
          const isPerOrder = !!((rule as any).tierMode) && (rule as any).tierMode === 'per_order' || /\[PER_ORDER\]/.test((rule as any).description || '');
          if (isPerOrder) {
            const orders = await this.getOrdersForPeriod(tenantId, (s as any).userId, startDate, endDate);
            for (const ord of orders) {
              totalCommission += await commissionService.calculateTieredCommission(rule.id, Number(ord.totalAmount || 0));
            }
          } else {
            const part = await commissionService.calculateTieredCommissionForPeriod(rule.id, periodTotal);
            totalCommission += part;
          }
        }
      }
      const advances = 0; // MVP: no advances in MVP calculation
      const grandGross = proratedBase + totalCommission;
      const net = grandGross - advances;

      // Add computed line to results (no persistence in MVP)
      results.push({
        employeeId: (s as any).userId,
        periodId,
        proratedBase,
        periodTotal,
        brandCommissions: brandTotalsOut,
        totalCommission,
        advances,
        gross: grandGross,
        net,
      });
    }

    return results;
  }

  prorate(base: number, periodDays: number, monthDays: number) {
    if (monthDays <= 0) return base;
    return Math.round((base * (periodDays / monthDays)) * 100) / 100;
  }
}

export const simplePayrollRunner = new SimplePayrollRunner();
