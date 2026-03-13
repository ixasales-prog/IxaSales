import { salaryService } from './salaryService';
import { KPIService } from './kpiService';
import { commissionService } from './commissionService';
import { db, schema } from '../../db';
import { and, eq, gte, lt, sql } from 'drizzle-orm';

// MVP: Simple payroll runner for salary + commissions + advances (no KPI yet).
// This runs for a given period and creates payroll_records entries per active employee.
export class SimplePayrollRunner {
  private getDateRange(startDate: string, endDate: string) {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const endExclusive = new Date(`${endDate}T00:00:00.000Z`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(endExclusive.getTime())) {
      throw new Error('Invalid payroll period date format');
    }

    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    return { start, endExclusive };
  }

  // Helper: fetch period total sales for an employee in the period
  async getPeriodTotal(tenantId: string, employee: { userId: string }, startDate: string, endDate: string) {
    const userId = employee.userId;
    const { start, endExclusive } = this.getDateRange(startDate, endDate);

    const [result] = await db
      .select({
        total: sql<string>`coalesce(sum(${schema.orders.totalAmount}), 0)`,
      })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.tenantId, tenantId),
          eq(schema.orders.salesRepId, userId),
          gte(schema.orders.createdAt, start),
          lt(schema.orders.createdAt, endExclusive),
        ),
      );

    return Number(result?.total || 0);
  }

  // Helper: compute per-brand totals for an employee in the period
  async getBrandTotals(tenantId: string, employee: { userId: string }, startDate: string, endDate: string) {
    const userId = employee.userId;
    const { start, endExclusive } = this.getDateRange(startDate, endDate);
    const byBrand: Record<string, number> = {};

    const rows = await db
      .select({
        brandName: schema.brands.name,
        total: sql<string>`coalesce(sum(${schema.orderItems.lineTotal}), 0)`,
      })
      .from(schema.orders)
      .innerJoin(schema.orderItems, eq(schema.orderItems.orderId, schema.orders.id))
      .innerJoin(schema.products, eq(schema.products.id, schema.orderItems.productId))
      .leftJoin(schema.brands, eq(schema.brands.id, schema.products.brandId))
      .where(
        and(
          eq(schema.orders.tenantId, tenantId),
          eq(schema.orders.salesRepId, userId),
          gte(schema.orders.createdAt, start),
          lt(schema.orders.createdAt, endExclusive),
        ),
      )
      .groupBy(schema.brands.name);

    for (const row of rows) {
      if (row.brandName) {
        byBrand[row.brandName] = Number(row.total || 0);
      }
    }

    return byBrand;
  }

  // Phase B: per-order if needed in future (toggle via marker). Retrieve orders for period per employee.
  async getOrdersForPeriod(tenantId: string, userId: string, startDate: string, endDate: string) {
    const { start, endExclusive } = this.getDateRange(startDate, endDate);
    return await db
      .select({ totalAmount: schema.orders.totalAmount })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.tenantId, tenantId),
          eq(schema.orders.salesRepId, userId),
          gte(schema.orders.createdAt, start),
          lt(schema.orders.createdAt, endExclusive),
        ),
      );
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

    // Compute payroll lines per employee.
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
        salaryConfigId: (s as any).id,
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

    // Persist calculated entries for the period so /payroll/run produces usable records.
    await db.transaction(async (tx) => {
      await tx
        .delete(schema.payrollEntries)
        .where(and(
          eq(schema.payrollEntries.tenantId, tenantId),
          eq(schema.payrollEntries.payrollPeriodId, periodId),
        ));

      if (results.length > 0) {
        await tx.insert(schema.payrollEntries).values(results.map((r) => ({
          tenantId,
          payrollPeriodId: periodId,
          userId: r.employeeId,
          salaryConfigId: r.salaryConfigId || null,
          baseSalary: r.proratedBase.toFixed(2),
          commissionAmount: r.totalCommission.toFixed(2),
          bonusAmount: '0',
          grossSalary: r.gross.toFixed(2),
          taxAmount: '0',
          advanceDeduction: Number(r.advances || 0).toFixed(2),
          loanDeduction: '0',
          otherDeductions: '0',
          totalDeductions: Number(r.advances || 0).toFixed(2),
          netSalary: r.net.toFixed(2),
          daysWorked: periodDays,
          notes: `Generated by /payroll/run for ${startDate}..${endDate}`,
          updatedAt: new Date(),
        })));
      }
    });

    return results;
  }

  prorate(base: number, periodDays: number, monthDays: number) {
    if (monthDays <= 0) return base;
    return Math.round((base * (periodDays / monthDays)) * 100) / 100;
  }
}

export const simplePayrollRunner = new SimplePayrollRunner();
