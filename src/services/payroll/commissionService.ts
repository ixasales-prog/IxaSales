import { db } from "../../db";
import {
  commissionRules,
  commissionTiers,
  commissionRecords,
  orders,
  users,
} from "../../db/schema";
import { eq, and, desc, sql, lte, gte, or, isNull, inArray } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

type CommissionRule = InferSelectModel<typeof commissionRules>;
type NewCommissionRule = InferInsertModel<typeof commissionRules>;
type CommissionTier = InferSelectModel<typeof commissionTiers>;
type NewCommissionTier = InferInsertModel<typeof commissionTiers>;
type CommissionRecord = InferSelectModel<typeof commissionRecords>;
type NewCommissionRecord = InferInsertModel<typeof commissionRecords>;

export class CommissionService {
  /**
   * Get all commission rules for a tenant
   */
  async getAllCommissionRules(tenantId: string) {
    return await db
      .select()
      .from(commissionRules)
      .where(eq(commissionRules.tenantId, tenantId))
      .orderBy(desc(commissionRules.createdAt));
  }

  /**
   * Get active commission rules
   */
  async getActiveCommissionRules(tenantId: string, asOfDate?: string) {
    const date = asOfDate || new Date().toISOString().split("T")[0];

    return await db
      .select()
      .from(commissionRules)
      .where(
        and(
          eq(commissionRules.tenantId, tenantId),
          eq(commissionRules.isActive, true),
          lte(commissionRules.effectiveFrom, date),
          or(
            isNull(commissionRules.effectiveTo),
            gte(commissionRules.effectiveTo, date),
          ),
        ),
      );
  }

  /**
   * Get commission rule by ID
   */
  async getCommissionRuleById(tenantId: string, id: string) {
    const result = await db
      .select()
      .from(commissionRules)
      .where(
        and(eq(commissionRules.tenantId, tenantId), eq(commissionRules.id, id)),
      )
      .limit(1);

    return result[0] || null;
  }

  /**
   * Create commission rule
   */
  async createCommissionRule(data: any) {
    // Transform frontend data structure to backend schema
    const transformedData: any = {
      tenantId: data.tenantId,
      name: data.name,
      description: data.description || null,
      ruleType: data.ruleType,
      effectiveFrom: data.effectiveFrom,
      effectiveTo: data.effectiveTo || null,
      isActive: data.isActive !== undefined ? data.isActive : true,
    };

    // Handle applicableRoles array - store as 'all' and encode in description
    // Since targetId is UUID type but roles are strings, we store role info in description
    if (
      data.applicableRoles &&
      Array.isArray(data.applicableRoles) &&
      data.applicableRoles.length > 0
    ) {
      transformedData.appliesTo = "all";
      // Store roles in description as JSON for easy parsing
      const rolesJson = JSON.stringify({
        applicableRoles: data.applicableRoles,
      });
      transformedData.description =
        (transformedData.description || "") + `\n[ROLES:${rolesJson}]`;
    } else {
      transformedData.appliesTo = "all";
    }

    // Map percentage/fixedAmount to basePercentage
    if (data.ruleType === "percentage" && data.percentage !== undefined) {
      transformedData.basePercentage = data.percentage.toString();
    } else if (data.ruleType === "fixed" && data.fixedAmount !== undefined) {
      transformedData.basePercentage = data.fixedAmount.toString();
    }

    // Map min/max amounts
    if (data.minAmount !== undefined) {
      transformedData.minCommission = data.minAmount.toString();
    }
    if (data.maxAmount !== undefined) {
      transformedData.maxCommission = data.maxAmount.toString();
    }

    // Set defaults for fields not provided by frontend
    transformedData.calculationBase = data.calculationBase || "order_total";
    transformedData.eligibilityStatus = data.eligibilityStatus || "delivered";

    // Create the commission rule
    // Ensure tierMode defaults to per_order if not specified
    if (!transformedData.tierMode) {
      transformedData.tierMode = 'per_order';
    }
    const [rule] = await db
      .insert(commissionRules)
      .values(transformedData)
      .returning();

    // Handle tiers if provided
    if (data.tiers && Array.isArray(data.tiers) && data.tiers.length > 0) {
      for (let i = 0; i < data.tiers.length; i++) {
        const tier = data.tiers[i];
        await db.insert(commissionTiers).values({
          commissionRuleId: rule.id,
          minAmount: tier.minAmount.toString(),
          maxAmount: tier.maxAmount ? tier.maxAmount.toString() : null,
          commissionPercentage: tier.percentage
            ? tier.percentage.toString()
            : tier.fixedAmount
              ? tier.fixedAmount.toString()
              : "0",
          sortOrder: i,
        });
      }
    }

    return rule;
  }

  /**
   * Update commission rule
   */
  async updateCommissionRule(tenantId: string, id: string, data: any) {
    // Transform frontend data structure to backend schema
    const transformedData: any = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) transformedData.name = data.name;
    if (data.description !== undefined)
      transformedData.description = data.description;
    if (data.ruleType !== undefined) transformedData.ruleType = data.ruleType;
    if (data.effectiveFrom !== undefined)
      transformedData.effectiveFrom = data.effectiveFrom;
    if (data.effectiveTo !== undefined)
      transformedData.effectiveTo = data.effectiveTo;
    if (data.isActive !== undefined) transformedData.isActive = data.isActive;

    // Handle applicableRoles array - store as 'all' and encode in description
    if (
      data.applicableRoles &&
      Array.isArray(data.applicableRoles) &&
      data.applicableRoles.length > 0
    ) {
      transformedData.appliesTo = "all";
      // Store roles in description as JSON for easy parsing
      const rolesJson = JSON.stringify({
        applicableRoles: data.applicableRoles,
      });
      transformedData.description =
        (data.description || transformedData.description || "") +
        `\n[ROLES:${rolesJson}]`;
    }

    // Map percentage/fixedAmount to basePercentage
    if (data.percentage !== undefined) {
      transformedData.basePercentage = data.percentage.toString();
    } else if (data.fixedAmount !== undefined) {
      transformedData.basePercentage = data.fixedAmount.toString();
    }

    // Map min/max amounts
    if (data.minAmount !== undefined) {
      transformedData.minCommission = data.minAmount.toString();
    }
    if (data.maxAmount !== undefined) {
      transformedData.maxCommission = data.maxAmount.toString();
    }

    const [updated] = await db
      .update(commissionRules)
      .set(transformedData)
      .where(
        and(eq(commissionRules.tenantId, tenantId), eq(commissionRules.id, id)),
      )
      .returning();

    // Handle tierMode if provided
    if (data.tierMode) {
      await db
        .update(commissionRules)
        .set({ tierMode: data.tierMode })
        .where(
          and(eq(commissionRules.tenantId, tenantId), eq(commissionRules.id, id)),
        );
    }

    // Handle tiers update if provided
    if (data.tiers && Array.isArray(data.tiers)) {
      // Delete existing tiers
      await db
        .delete(commissionTiers)
        .where(eq(commissionTiers.commissionRuleId, id));

      // Create new tiers
      for (let i = 0; i < data.tiers.length; i++) {
        const tier = data.tiers[i];
        await db.insert(commissionTiers).values({
          commissionRuleId: id,
          minAmount: tier.minAmount.toString(),
          maxAmount: tier.maxAmount ? tier.maxAmount.toString() : null,
          commissionPercentage: tier.percentage
            ? tier.percentage.toString()
            : tier.fixedAmount
              ? tier.fixedAmount.toString()
              : "0",
          sortOrder: i,
        });
      }
    }

    return updated;
  }

  /**
   * Delete commission rule
   */
  async deleteCommissionRule(tenantId: string, id: string) {
    await db
      .delete(commissionRules)
      .where(
        and(eq(commissionRules.tenantId, tenantId), eq(commissionRules.id, id)),
      );
  }

  /**
   * Get commission tiers for a rule
   */
  async getCommissionTiers(ruleId: string) {
    return await db
      .select()
      .from(commissionTiers)
      .where(eq(commissionTiers.commissionRuleId, ruleId))
      .orderBy(commissionTiers.sortOrder, desc(commissionTiers.minAmount));
  }

  /**
   * Create commission tier
   */
  async createCommissionTier(data: NewCommissionTier) {
    const [tier] = await db.insert(commissionTiers).values(data).returning();
    return tier;
  }

  /**
   * Update commission tier
   */
  async updateCommissionTier(id: string, data: Partial<NewCommissionTier>) {
    const [updated] = await db
      .update(commissionTiers)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(commissionTiers.id, id))
      .returning();

    return updated;
  }

  /**
   * Delete commission tier
   */
  async deleteCommissionTier(id: string) {
    await db.delete(commissionTiers).where(eq(commissionTiers.id, id));
  }

  /**
   * Get applicable commission rules for a user/order
   */
  async getApplicableRules(
    tenantId: string,
    userId: string,
    orderId: string,
    orderDate: string,
  ): Promise<CommissionRule[]> {
    // Get all active rules for the date
    const activeRules = await this.getActiveCommissionRules(
      tenantId,
      orderDate,
    );

    // Filter rules based on applies_to
    const applicableRules: CommissionRule[] = [];

    for (const rule of activeRules) {
      // Extract applicable roles from description
      let applicableRoles: string[] = [];
      if (rule.description) {
        const rolesMatch = rule.description.match(/\[ROLES:(.+?)\]/);
        if (rolesMatch) {
          try {
            const rolesData = JSON.parse(rolesMatch[1]);
            applicableRoles = rolesData.applicableRoles || [];
          } catch (e) {
            // Fallback to all if parsing fails
            applicableRoles = [];
          }
        }
      }

      if (rule.appliesTo === "all") {
        // If no specific roles, rule applies to all
        if (applicableRoles.length === 0) {
          applicableRules.push(rule);
        } else {
          // Check if user has one of the applicable roles
          const user = await db
            .select()
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);
          if (user[0] && applicableRoles.includes(user[0].role)) {
            applicableRules.push(rule);
          }
        }
      } else if (rule.appliesTo === "user" && rule.targetId === userId) {
        applicableRules.push(rule);
      }
      // TODO: Add territory, brand, product checks when needed
    }

    return applicableRules;
  }

  /**
   * Calculate commission based on rule type
   */
  async calculateCommission(
    rule: CommissionRule,
    orderAmount: number,
  ): Promise<number> {
    let commission = 0;

    switch (rule.ruleType) {
      case "percentage":
        if (rule.basePercentage) {
          commission = (orderAmount * parseFloat(rule.basePercentage)) / 100;
        }
        break;

      case "tiered":
        commission = await this.calculateTieredCommission(rule.id, orderAmount);
        break;

      case "fixed":
        commission = parseFloat(rule.basePercentage || "0");
        break;
    }

    // Apply min/max caps
    if (rule.minCommission) {
      commission = Math.max(commission, parseFloat(rule.minCommission));
    }
    if (rule.maxCommission) {
      commission = Math.min(commission, parseFloat(rule.maxCommission));
    }

    return Math.round(commission * 100) / 100; // Round to 2 decimals
  }

  /**
   * Calculate tiered commission
   */
  async calculateTieredCommission(
    ruleId: string,
    amount: number,
  ): Promise<number> {
    const tiers = await this.getCommissionTiers(ruleId);
    let commission = 0;
    let remainingAmount = amount;

    // Sort tiers by minAmount ascending
    const sortedTiers = tiers.sort(
      (a, b) => parseFloat(a.minAmount) - parseFloat(b.minAmount),
    );

    for (const tier of sortedTiers) {
      const minAmount = parseFloat(tier.minAmount);
      const maxAmount = tier.maxAmount ? parseFloat(tier.maxAmount) : Infinity;
      const rate = parseFloat(tier.commissionPercentage);

      if (remainingAmount <= 0) break;

      const tierAmount = Math.min(remainingAmount, maxAmount - minAmount);

      if (tierAmount > 0) {
        commission += (tierAmount * rate) / 100;
        remainingAmount -= tierAmount;
      }
    }

    return commission;
  }

  /**
   * Calculate tiered commission for a period total (per-period tiering)
   * Returns the total commission for the given periodTotal according to the rule's tiers.
   */
  async calculateTieredCommissionForPeriod(ruleId: string, periodTotal: number) {
    const tiers = await this.getCommissionTiers(ruleId);
    if (!tiers || tiers.length === 0) return 0;
    const sorted = tiers.slice().sort((a: any, b: any) => parseFloat(a.minAmount) - parseFloat(b.minAmount));
    let commission = 0;
    for (const tier of sorted) {
      const min = parseFloat(tier.minAmount);
      const max = tier.maxAmount ? parseFloat(tier.maxAmount) : Infinity;
      const amountInTier = Math.max(0, Math.min(periodTotal, max) - min);
      if (amountInTier > 0) {
        const rate = parseFloat(tier.commissionPercentage);
        if (!isNaN(rate)) {
          commission += (amountInTier * rate) / 100;
        }
      }
    }
    return Math.round(commission * 100) / 100;
  }

  /**
   * Calculate tiered commissions per brand for a given period totals map
   * periodTotalsByBrand: { [brand]: totalSales }
   * Returns a map of brand -> commission amount
   */
  async calculateTieredCommissionForPeriodByBrand(ruleId: string, periodTotalsByBrand: Record<string, number>) {
    const result: Record<string, number> = {};
    const tiers = await this.getCommissionTiers(ruleId);
    if (!tiers || tiers.length === 0) return result;
    const sorted = tiers.slice().sort((a: any, b: any) => parseFloat(a.minAmount) - parseFloat(b.minAmount));
    for (const [brand, total] of Object.entries(periodTotalsByBrand)) {
      let commission = 0;
      for (const tier of sorted) {
        const min = parseFloat(tier.minAmount);
        const max = tier.maxAmount ? parseFloat(tier.maxAmount) : Infinity;
        const amountInTier = Math.max(0, Math.min(total, max) - min);
        if (amountInTier > 0) {
          const rate = parseFloat(tier.commissionPercentage);
          if (!isNaN(rate)) {
            commission += (amountInTier * rate) / 100;
          }
        }
      }
      result[brand] = Math.round(commission * 100) / 100;
    }
    return result;
  }

  /**
   * Per-order path: sum tiered commissions across multiple orders for a single rule
   * orderAmounts: list of order amounts for the employee in the period
   */
  async calculateTieredCommissionPerOrderForRule(ruleId: string, orderAmounts: number[]) {
    let total = 0;
    for (const amt of orderAmounts) {
      total += await this.calculateTieredCommission(ruleId, amt);
    }
    return total;
  }

  /**
   * Calculate and create commission record for an order
   */
  async calculateCommissionForOrder(
    tenantId: string,
    userId: string,
    orderId: string,
    orderAmount: string,
    orderDate: string,
  ) {
    const amount = parseFloat(orderAmount);

    // Get applicable rules
    const rules = await this.getApplicableRules(
      tenantId,
      userId,
      orderId,
      orderDate,
    );

    if (rules.length === 0) {
      return null; // No commission rules apply
    }

    // Use the rule that gives the highest commission
    // (Or implement your own logic - combine, use first, etc.)
    let bestCommission = 0;
    let bestRule: CommissionRule | null = null;

    for (const rule of rules) {
      const commission = await this.calculateCommission(rule, amount);
      if (commission > bestCommission) {
        bestCommission = commission;
        bestRule = rule;
      }
    }

    if (!bestRule || bestCommission === 0) {
      return null;
    }

    // Create commission record
    const [record] = await db
      .insert(commissionRecords)
      .values({
        tenantId,
        userId,
        orderId,
        commissionRuleId: bestRule.id,
        orderAmount: orderAmount,
        commissionRate: bestRule.basePercentage || "0",
        commissionAmount: bestCommission.toString(),
        calculationDate: orderDate,
        status: "calculated",
      })
      .returning();

    return record;
  }

  /**
   * Get commission records for a user
   */
  async getCommissionRecordsForUser(
    tenantId: string,
    userId: string,
    startDate?: string,
    endDate?: string,
  ) {
    const conditions = [
      eq(commissionRecords.tenantId, tenantId),
      eq(commissionRecords.userId, userId),
    ];

    if (startDate) {
      conditions.push(gte(commissionRecords.calculationDate, startDate));
    }

    if (endDate) {
      conditions.push(lte(commissionRecords.calculationDate, endDate));
    }

    return await db
      .select({
        id: commissionRecords.id,
        orderId: commissionRecords.orderId,
        orderAmount: commissionRecords.orderAmount,
        commissionRate: commissionRecords.commissionRate,
        commissionAmount: commissionRecords.commissionAmount,
        calculationDate: commissionRecords.calculationDate,
        status: commissionRecords.status,
        payrollPeriodId: commissionRecords.payrollPeriodId,
        ruleName: commissionRules.name,
        createdAt: commissionRecords.createdAt,
      })
      .from(commissionRecords)
      .leftJoin(
        commissionRules,
        eq(commissionRecords.commissionRuleId, commissionRules.id),
      )
      .where(and(...conditions))
      .orderBy(desc(commissionRecords.calculationDate));
  }

  /**
   * Get pending commissions (not included in payroll yet)
   */
  async getPendingCommissions(tenantId: string, userId?: string) {
    const conditions = [
      eq(commissionRecords.tenantId, tenantId),
      eq(commissionRecords.status, "calculated"),
      isNull(commissionRecords.payrollPeriodId),
    ];

    if (userId) {
      conditions.push(eq(commissionRecords.userId, userId));
    }

    return await db
      .select({
        id: commissionRecords.id,
        userId: commissionRecords.userId,
        userName: users.name,
        orderId: commissionRecords.orderId,
        orderAmount: commissionRecords.orderAmount,
        commissionAmount: commissionRecords.commissionAmount,
        calculationDate: commissionRecords.calculationDate,
      })
      .from(commissionRecords)
      .leftJoin(users, eq(commissionRecords.userId, users.id))
      .where(and(...conditions))
      .orderBy(commissionRecords.calculationDate);
  }

  /**
   * Get commissions for payroll period
   */
  async getCommissionsForPeriod(
    tenantId: string,
    startDate: string,
    endDate: string,
    status?: string,
  ) {
    const conditions = [
      eq(commissionRecords.tenantId, tenantId),
      gte(commissionRecords.calculationDate, startDate),
      lte(commissionRecords.calculationDate, endDate),
    ];

    if (status) {
      conditions.push(eq(commissionRecords.status, status as any));
    }

    return await db
      .select({
        userId: commissionRecords.userId,
        userName: users.name,
        totalCommission: sql<string>`SUM(${commissionRecords.commissionAmount})`,
        commissionCount: sql<number>`COUNT(${commissionRecords.id})`,
      })
      .from(commissionRecords)
      .leftJoin(users, eq(commissionRecords.userId, users.id))
      .where(and(...conditions))
      .groupBy(commissionRecords.userId, users.name);
  }

  /**
   * Mark commissions as included in payroll
   */
  async includeCommissionsInPayroll(
    commissionIds: string[],
    payrollPeriodId: string,
  ) {
    await db
      .update(commissionRecords)
      .set({
        status: "included_in_payroll",
        payrollPeriodId,
        updatedAt: new Date(),
      })
      .where(inArray(commissionRecords.id, commissionIds));
  }

  /**
   * Recalculate commission for an order
   */
  async recalculateCommissionForOrder(
    tenantId: string,
    orderId: string,
  ): Promise<CommissionRecord | null> {
    // Get order details
    const orderResult = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!orderResult[0]) {
      throw new Error("Order not found");
    }

    const order = orderResult[0];

    // Delete existing commission record
    await db
      .delete(commissionRecords)
      .where(
        and(
          eq(commissionRecords.tenantId, tenantId),
          eq(commissionRecords.orderId, orderId),
          eq(commissionRecords.status, "calculated"),
        ),
      );

    // Calculate new commission
    // Calculate new commission
    const orderDate = order.createdAt
      ? new Date(order.createdAt).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    if (!order.salesRepId) {
      return null;
    }

    return await this.calculateCommissionForOrder(
      tenantId,
      order.salesRepId,
      orderId,
      order.totalAmount,
      orderDate,
    );
  }

  /**
   * Get commission summary for a user
   */
  async getCommissionSummary(
    tenantId: string,
    userId: string,
    startDate?: string,
    endDate?: string,
  ) {
    const conditions = [
      eq(commissionRecords.tenantId, tenantId),
      eq(commissionRecords.userId, userId),
    ];

    if (startDate) {
      conditions.push(gte(commissionRecords.calculationDate, startDate));
    }

    if (endDate) {
      conditions.push(lte(commissionRecords.calculationDate, endDate));
    }

    const result = await db
      .select({
        totalCommission: sql<string>`SUM(${commissionRecords.commissionAmount})`,
        totalOrders: sql<number>`COUNT(DISTINCT ${commissionRecords.orderId})`,
        totalOrderValue: sql<string>`SUM(${commissionRecords.orderAmount})`,
        averageCommission: sql<string>`AVG(${commissionRecords.commissionAmount})`,
        calculatedCount: sql<number>`COUNT(CASE WHEN ${commissionRecords.status} = 'calculated' THEN 1 END)`,
        paidCount: sql<number>`COUNT(CASE WHEN ${commissionRecords.status} = 'paid' THEN 1 END)`,
      })
      .from(commissionRecords)
      .where(and(...conditions));

    return result[0];
  }

  /**
   * SIMPLE COMMISSION ASSIGNMENT
   * Assign a commission rule directly to a specific user
   */
  async assignCommissionRuleToUser(
    tenantId: string,
    ruleId: string,
    userId: string,
  ) {
    // Get the existing rule
    const rule = await this.getCommissionRuleById(tenantId, ruleId);
    if (!rule) {
      throw new Error("Commission rule not found");
    }

    // Update the rule to target this specific user
    await db
      .update(commissionRules)
      .set({
        appliesTo: "user",
        targetId: userId,
        updatedAt: new Date(),
      })
      .where(
        and(eq(commissionRules.tenantId, tenantId), eq(commissionRules.id, ruleId)),
      );

    return { success: true, message: "Commission rule assigned to user" };
  }

  /**
   * Get commission rules assigned to a specific user
   */
  async getCommissionRulesForUser(tenantId: string, userId: string) {
    const rules = await db
      .select({
        id: commissionRules.id,
        name: commissionRules.name,
        description: commissionRules.description,
        ruleType: commissionRules.ruleType,
        basePercentage: commissionRules.basePercentage,
        minCommission: commissionRules.minCommission,
        maxCommission: commissionRules.maxCommission,
        effectiveFrom: commissionRules.effectiveFrom,
        effectiveTo: commissionRules.effectiveTo,
        isActive: commissionRules.isActive,
        createdAt: commissionRules.createdAt,
        appliesTo: commissionRules.appliesTo,
        targetId: commissionRules.targetId,
      })
      .from(commissionRules)
      .where(
        and(
          eq(commissionRules.tenantId, tenantId),
          eq(commissionRules.appliesTo, "user"),
          eq(commissionRules.targetId, userId),
        ),
      )
      .orderBy(desc(commissionRules.createdAt));

    // Get tiers for each rule
    const rulesWithTiers = await Promise.all(
      rules.map(async (rule) => {
        const tiers = await this.getCommissionTiers(rule.id);
        return {
          ...rule,
          tiers: tiers.map((t) => ({
            id: t.id,
            minAmount: t.minAmount,
            maxAmount: t.maxAmount,
            commissionPercentage: t.commissionPercentage,
            sortOrder: t.sortOrder,
          })),
        };
      }),
    );

    return rulesWithTiers;
  }

  /**
   * Remove commission rule assignment from a user
   */
  async removeCommissionRuleFromUser(
    tenantId: string,
    ruleId: string,
    userId: string,
  ) {
    // Verify the rule belongs to this user
    const rule = await db
      .select()
      .from(commissionRules)
      .where(
        and(
          eq(commissionRules.tenantId, tenantId),
          eq(commissionRules.id, ruleId),
          eq(commissionRules.targetId, userId),
        ),
      )
      .limit(1);

    if (!rule[0]) {
      throw new Error("Commission rule not found or not assigned to this user");
    }

    // Option 1: Delete the rule entirely
    // await this.deleteCommissionRule(tenantId, ruleId);

    // Option 2: Deactivate the rule
    await db
      .update(commissionRules)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(commissionRules.id, ruleId));

    return { success: true, message: "Commission rule removed from user" };
  }

  /**
   * Validate commission rule
   */
  validateCommissionRule(data: any): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Validate name
    if (!data.name || data.name.trim() === "") {
      errors.push("Rule name is required");
    }

    // Validate rule type
    if (
      !data.ruleType ||
      !["percentage", "fixed", "tiered"].includes(data.ruleType)
    ) {
      errors.push("Valid rule type is required (percentage, fixed, or tiered)");
    }

    // Validate based on rule type
    if (data.ruleType === "percentage") {
      const percentage = data.percentage || data.basePercentage;
      if (!percentage && percentage !== 0) {
        errors.push("Percentage is required for percentage-type rules");
      } else {
        const percentValue = parseFloat(percentage);
        if (isNaN(percentValue) || percentValue < 0 || percentValue > 100) {
          errors.push("Percentage must be between 0 and 100");
        }
      }
    }

    if (data.ruleType === "fixed") {
      const fixedAmount = data.fixedAmount || data.basePercentage;
      if (!fixedAmount && fixedAmount !== 0) {
        errors.push("Fixed amount is required for fixed-type rules");
      } else {
        const amount = parseFloat(fixedAmount);
        if (isNaN(amount) || amount < 0) {
          errors.push("Fixed amount must be a positive number");
        }
      }
    }

    if (data.ruleType === "tiered") {
      if (
        !data.tiers ||
        !Array.isArray(data.tiers) ||
        data.tiers.length === 0
      ) {
        errors.push("At least one tier is required for tiered rules");
      } else {
        // Validate each tier
        data.tiers.forEach((tier: any, index: number) => {
          if (!tier.minAmount && tier.minAmount !== 0) {
            errors.push(`Tier ${index + 1}: Minimum amount is required`);
          }
          if (!tier.percentage && !tier.fixedAmount) {
            errors.push(
              `Tier ${index + 1}: Either percentage or fixed amount is required`,
            );
          }
        });
      }
    }

    // Validate min/max commission
    const minCommission = data.minAmount || data.minCommission;
    const maxCommission = data.maxAmount || data.maxCommission;

    if (minCommission && maxCommission) {
      const min = parseFloat(minCommission);
      const max = parseFloat(maxCommission);
      if (!isNaN(min) && !isNaN(max) && min > max) {
        errors.push("Minimum commission cannot be greater than maximum");
      }
    }

    // Validate dates
    if (!data.effectiveFrom) {
      errors.push("Effective from date is required");
    }

    if (data.effectiveFrom && data.effectiveTo) {
      const from = new Date(data.effectiveFrom);
      const to = new Date(data.effectiveTo);
      if (to <= from) {
        errors.push("Effective to date must be after effective from date");
      }
    }

    // Validate applicable roles
    if (
      !data.applicableRoles ||
      !Array.isArray(data.applicableRoles) ||
      data.applicableRoles.length === 0
    ) {
      errors.push("At least one applicable role is required");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export const commissionService = new CommissionService();
