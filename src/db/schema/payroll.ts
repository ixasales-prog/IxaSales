import { pgTable, uuid, varchar, text, timestamp, decimal, integer, date, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { tenants, users } from './core';
import { orders } from './orders';

export const commissionRuleTypeEnum = pgEnum('commission_rule_type', [
  'percentage',
  'fixed',
  'tiered',
]);

export const commissionAppliesToEnum = pgEnum('commission_applies_to', [
  'all',
  'user',
  'territory',
  'brand',
  'product',
]);

export const commissionRecordStatusEnum = pgEnum('commission_record_status', [
  'calculated',
  'included_in_payroll',
  'paid',
]);

export const commissionRules = pgTable('commission_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  ruleType: commissionRuleTypeEnum('rule_type').notNull(),
  appliesTo: commissionAppliesToEnum('applies_to').default('all'),
  targetId: uuid('target_id'),
  calculationBase: varchar('calculation_base', { length: 50 }).default('order_total'),
  eligibilityStatus: varchar('eligibility_status', { length: 50 }).default('delivered'),
  tierMode: varchar('tier_mode', { length: 50 }).default('per_order'),
  basePercentage: decimal('base_percentage', { precision: 10, scale: 2 }),
  minCommission: decimal('min_commission', { precision: 15, scale: 2 }),
  maxCommission: decimal('max_commission', { precision: 15, scale: 2 }),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const commissionTiers = pgTable('commission_tiers', {
  id: uuid('id').primaryKey().defaultRandom(),
  commissionRuleId: uuid('commission_rule_id').references(() => commissionRules.id).notNull(),
  minAmount: decimal('min_amount', { precision: 15, scale: 2 }).notNull(),
  maxAmount: decimal('max_amount', { precision: 15, scale: 2 }),
  commissionPercentage: decimal('commission_percentage', { precision: 10, scale: 2 }).notNull(),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const commissionRecords = pgTable('commission_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  orderId: uuid('order_id').references(() => orders.id).notNull(),
  commissionRuleId: uuid('commission_rule_id').references(() => commissionRules.id).notNull(),
  payrollPeriodId: uuid('payroll_period_id'),
  orderAmount: decimal('order_amount', { precision: 15, scale: 2 }).notNull(),
  commissionRate: decimal('commission_rate', { precision: 10, scale: 2 }).notNull(),
  commissionAmount: decimal('commission_amount', { precision: 15, scale: 2 }).notNull(),
  calculationDate: date('calculation_date').notNull(),
  status: commissionRecordStatusEnum('status').default('calculated'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
