import { pgTable, uuid, text, timestamp, date, time, decimal, pgEnum, json } from 'drizzle-orm/pg-core';
import { tenants, users } from './core';
import { customers } from './customers';
import { orders } from './orders';

// ============================================================================
// ENUMS
// ============================================================================

export const visitStatusEnum = pgEnum('visit_status', [
    'planned',
    'in_progress',
    'completed',
    'cancelled',
    'missed'
]);

export const visitTypeEnum = pgEnum('visit_type', [
    'scheduled',
    'ad_hoc',
    'phone_call'
]);

export const visitOutcomeEnum = pgEnum('visit_outcome', [
    'order_placed',
    'no_order',
    'follow_up'
]);

// ============================================================================
// SALES VISITS
// ============================================================================

export const salesVisits = pgTable('sales_visits', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    customerId: uuid('customer_id').references(() => customers.id).notNull(),
    salesRepId: uuid('sales_rep_id').references(() => users.id).notNull(),

    // Visit classification
    visitType: visitTypeEnum('visit_type').default('scheduled'),
    status: visitStatusEnum('status').default('planned'),
    outcome: visitOutcomeEnum('outcome'),

    // Scheduling
    plannedDate: date('planned_date').notNull(),
    plannedTime: time('planned_time'),

    // Execution tracking
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),

    // GPS tracking
    startLatitude: decimal('start_latitude', { precision: 10, scale: 8 }),
    startLongitude: decimal('start_longitude', { precision: 11, scale: 8 }),
    endLatitude: decimal('end_latitude', { precision: 10, scale: 8 }),
    endLongitude: decimal('end_longitude', { precision: 11, scale: 8 }),

    // Notes and outcome
    notes: text('notes'),
    outcomeNotes: text('outcome_notes'),
    photos: json('photos').$type<string[]>().default([]),

    // Quick visit flow - No order reason
    noOrderReason: text('no_order_reason'),

    // Quick visit flow - Follow up details
    followUpReason: text('follow_up_reason'),
    followUpDate: date('follow_up_date'),
    followUpTime: time('follow_up_time'),

    // Follow-up reminder tracking
    followUpReminderSentAt: timestamp('follow_up_reminder_sent_at'),

    // Related order (if visit resulted in order)
    orderId: uuid('order_id').references(() => orders.id),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});