import { db, schema } from '../db';
import { eq, and, sql, desc, gte, lte, inArray, SQL } from 'drizzle-orm';
import { InvalidStatusTransitionError } from '../errors';
import { PgColumn } from 'drizzle-orm/pg-core';

// Simple sanitization utility for backend
const sanitizeInput = (input: string | null | undefined): string | null => {
  if (input === null || input === undefined) return null;
  
  // Basic sanitization: remove control characters and normalize whitespace
  return input
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .trim(); // Remove leading/trailing whitespace
};

const sanitizeArray = (input: string[] | null | undefined): string[] | null => {
  if (input === null || input === undefined) return null;
  return input.map(item => sanitizeInput(item) as string).filter(Boolean) as string[];
};

// Valid enum values
const VALID_OUTCOMES = ['order_placed', 'no_order', 'follow_up', 'not_available'] as const;
const VALID_VISIT_TYPES = ['scheduled', 'ad_hoc', 'phone_call'] as const;

type Outcome = typeof VALID_OUTCOMES[number];
type VisitType = typeof VALID_VISIT_TYPES[number];

export interface Location {
  latitude: number;
  longitude: number;
}

export interface VisitFilters {
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  status?: string;
  customerId?: string;
}

export interface CreateVisitInput {
  customerId: string;
  salesRepId?: string;
  visitType?: string;
  plannedDate: string;
  plannedTime?: string;
  notes?: string;
}

export interface QuickVisitInput {
  customerId: string;
  outcome: string;
  plannedDate?: string;
  plannedTime?: string;
  photo?: string;
  latitude?: number;
  longitude?: number;
  outcomeNotes?: string;
  noOrderReason?: string;
  followUpReason?: string;
  followUpDate?: string;
  followUpTime?: string;
}

export interface UnifiedCreateVisitInput {
  // Common fields
  customerId: string;
  plannedDate?: string;
  plannedTime?: string;
  notes?: string;
  
  // Mode determines the workflow
  mode: 'scheduled' | 'quick';
  
  // Scheduled mode specific
  salesRepId?: string;
  visitType?: string;
  
  // Quick mode specific
  outcome?: string;
  photo?: string;
  latitude?: number;
  longitude?: number;
  outcomeNotes?: string;
  noOrderReason?: string;
  followUpReason?: string;
  followUpDate?: string;
  followUpTime?: string;
}

export interface StartVisitInput {
  latitude?: number;
  longitude?: number;
}

export interface CompleteVisitInput {
  outcome: string;
  outcomeNotes?: string;
  photos?: string[];
  orderId?: string;
  latitude?: number;
  longitude?: number;
}

export interface CancelVisitInput {
  reason?: string;
}

export interface UpdateVisitInput {
  plannedDate?: string;
  plannedTime?: string;
  notes?: string;
  visitType?: string;
}

export class VisitsService {
  /**
   * Get all sales rep IDs assigned to a supervisor
   */
  private async getAssignedRepIds(supervisorId: string, tenantId: string): Promise<string[]> {
    const reps = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(
        eq(schema.users.supervisorId, supervisorId),
        eq(schema.users.tenantId, tenantId),
        eq(schema.users.role, 'sales_rep')
      ));
    return reps.map(r => r.id);
  }

  /**
   * Validate that a customer exists and belongs to the tenant
   */
  private async validateCustomer(customerId: string, tenantId: string): Promise<void> {
    const [customer] = await db
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(and(
        eq(schema.customers.id, customerId),
        eq(schema.customers.tenantId, tenantId)
      ));

    if (!customer) {
      throw new Error('Customer not found');
    }
  }

  /**
   * Validate that a planned date is not in the past
   */
  private validatePlannedDate(dateStr: string): void {
    const plannedDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (plannedDate < today) {
      throw new Error('Planned date cannot be in the past');
    }
  }

  /**
   * Validate outcome enum value
   */
  private validateOutcome(outcome: string): asserts outcome is Outcome {
    if (!VALID_OUTCOMES.includes(outcome as Outcome)) {
      throw new Error(`Invalid outcome. Must be one of: ${VALID_OUTCOMES.join(', ')}`);
    }
  }

  /**
   * Validate visit type enum value
   */
  private validateVisitType(visitType: string): asserts visitType is VisitType {
    if (!VALID_VISIT_TYPES.includes(visitType as VisitType)) {
      throw new Error(`Invalid visit type. Must be one of: ${VALID_VISIT_TYPES.join(', ')}`);
    }
  }

  /**
   * List visits with pagination and filtering
   */
  async listVisits(tenantId: string, userId: string, role: string, filters: VisitFilters = {}) {
    const { page = 1, limit = 20, startDate, endDate, status, customerId } = filters;
    const offset = (page - 1) * limit;

    const conditions: SQL<unknown>[] = [eq(schema.salesVisits.tenantId, tenantId)];

    // Sales rep can only see their own visits
    if (role === 'sales_rep') {
      conditions.push(eq(schema.salesVisits.salesRepId, userId));
    }

    // Supervisor can only see their assigned reps' visits
    if (role === 'supervisor') {
      const assignedRepIds = await this.getAssignedRepIds(userId, tenantId);
      if (assignedRepIds.length > 0) {
        conditions.push(inArray(schema.salesVisits.salesRepId, assignedRepIds));
      } else {
        // No assigned reps - return empty result
        conditions.push(sql`1=0`);
      }
    }

    // Apply filters
    if (startDate) conditions.push(gte(schema.salesVisits.plannedDate, startDate));
    if (endDate) conditions.push(lte(schema.salesVisits.plannedDate, endDate));
    if (status) conditions.push(eq(schema.salesVisits.status, status as any));
    if (customerId) conditions.push(eq(schema.salesVisits.customerId, customerId));

    const visits = await db
      .select({
        id: schema.salesVisits.id,
        customerId: schema.salesVisits.customerId,
        customerName: schema.customers.name,
        customerAddress: schema.customers.address,
        salesRepId: schema.salesVisits.salesRepId,
        salesRepName: schema.users.name,
        visitType: schema.salesVisits.visitType,
        status: schema.salesVisits.status,
        outcome: schema.salesVisits.outcome,
        plannedDate: schema.salesVisits.plannedDate,
        plannedTime: schema.salesVisits.plannedTime,
        startedAt: schema.salesVisits.startedAt,
        completedAt: schema.salesVisits.completedAt,
        notes: schema.salesVisits.notes,
        outcomeNotes: schema.salesVisits.outcomeNotes,
        createdAt: schema.salesVisits.createdAt,
      })
      .from(schema.salesVisits)
      .leftJoin(schema.customers, eq(schema.salesVisits.customerId, schema.customers.id))
      .leftJoin(schema.users, eq(schema.salesVisits.salesRepId, schema.users.id))
      .where(and(...conditions))
      .orderBy(desc(schema.salesVisits.plannedDate))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.salesVisits)
      .where(and(...conditions));

    return {
      data: visits,
      meta: { page, limit, total: Number(count), totalPages: Math.ceil(Number(count) / limit) },
    };
  }

  /**
   * Get today's visits for a user
   */
  async getTodayVisits(tenantId: string, userId: string, role: string, date?: string) {
    const actualDate = date || new Date().toISOString().split('T')[0];

    const conditions: SQL<unknown>[] = [
      eq(schema.salesVisits.tenantId, tenantId),
      eq(schema.salesVisits.plannedDate, actualDate),
    ];

    if (role === 'sales_rep') {
      conditions.push(eq(schema.salesVisits.salesRepId, userId));
    }

    // Supervisor can only see their assigned reps' visits
    if (role === 'supervisor') {
      const assignedRepIds = await this.getAssignedRepIds(userId, tenantId);
      if (assignedRepIds.length > 0) {
        conditions.push(inArray(schema.salesVisits.salesRepId, assignedRepIds));
      } else {
        // No assigned reps - return empty result
        conditions.push(sql`1=0`);
      }
    }

    const visits = await db
      .select({
        id: schema.salesVisits.id,
        customerId: schema.salesVisits.customerId,
        customerName: schema.customers.name,
        customerAddress: schema.customers.address,
        customerPhone: schema.customers.phone,
        visitType: schema.salesVisits.visitType,
        status: schema.salesVisits.status,
        outcome: schema.salesVisits.outcome,
        plannedTime: schema.salesVisits.plannedTime,
        startedAt: schema.salesVisits.startedAt,
        completedAt: schema.salesVisits.completedAt,
        notes: schema.salesVisits.notes,
      })
      .from(schema.salesVisits)
      .leftJoin(schema.customers, eq(schema.salesVisits.customerId, schema.customers.id))
      .where(and(...conditions))
      .orderBy(desc(schema.salesVisits.plannedTime));

    // Calculate stats
    const completed = visits.filter(v => v.status === 'completed').length;
    const inProgress = visits.filter(v => v.status === 'in_progress').length;
    const planned = visits.filter(v => v.status === 'planned').length;

    return {
      data: visits,
      stats: { total: visits.length, completed, inProgress, planned }
    };
  }

  /**
   * Get follow-up summary for a user
   */
  async getFollowUpSummary(tenantId: string, userId: string, role: string) {
    const todayStr = new Date().toISOString().split('T')[0];

    const conditions: SQL<unknown>[] = [
      eq(schema.salesVisits.tenantId, tenantId),
      eq(schema.salesVisits.outcome, 'follow_up'),
    ];

    if (role === 'sales_rep') {
      conditions.push(eq(schema.salesVisits.salesRepId, userId));
    }

    // Supervisor can only see their assigned reps' visits
    if (role === 'supervisor') {
      const assignedRepIds = await this.getAssignedRepIds(userId, tenantId);
      if (assignedRepIds.length > 0) {
        conditions.push(inArray(schema.salesVisits.salesRepId, assignedRepIds));
      } else {
        // No assigned reps - return empty result
        conditions.push(sql`1=0`);
      }
    }

    const [summary] = await db
      .select({
        dueToday: sql<number>`count(*) filter (where ${schema.salesVisits.followUpDate} = ${todayStr})`,
        overdue: sql<number>`count(*) filter (where ${schema.salesVisits.followUpDate} < ${todayStr})`,
        upcoming: sql<number>`count(*) filter (where ${schema.salesVisits.followUpDate} > ${todayStr})`,
      })
      .from(schema.salesVisits)
      .where(and(...conditions));

    const topDue = await db
      .select({
        id: schema.salesVisits.id,
        customerId: schema.salesVisits.customerId,
        customerName: schema.customers.name,
        followUpDate: schema.salesVisits.followUpDate,
      })
      .from(schema.salesVisits)
      .leftJoin(schema.customers, eq(schema.salesVisits.customerId, schema.customers.id))
      .where(and(
        ...conditions,
        lte(schema.salesVisits.followUpDate, todayStr),
      ))
      .orderBy(schema.salesVisits.followUpDate, schema.salesVisits.createdAt)
      .limit(5);

    return {
      dueToday: Number(summary?.dueToday || 0),
      overdue: Number(summary?.overdue || 0),
      upcoming: Number(summary?.upcoming || 0),
      topDue: topDue.map(v => ({
        id: v.id,
        customerId: v.customerId,
        customerName: v.customerName,
        followUpDate: v.followUpDate,
      })),
    };
  }

  /**
   * Get a specific visit by ID
   */
  async getVisitById(id: string, tenantId: string, userId: string, role: string) {
    const [visit] = await db
      .select({
        id: schema.salesVisits.id,
        customerId: schema.salesVisits.customerId,
        customerName: schema.customers.name,
        customerAddress: schema.customers.address,
        customerPhone: schema.customers.phone,
        salesRepId: schema.salesVisits.salesRepId,
        salesRepName: schema.users.name,
        visitType: schema.salesVisits.visitType,
        status: schema.salesVisits.status,
        outcome: schema.salesVisits.outcome,
        plannedDate: schema.salesVisits.plannedDate,
        plannedTime: schema.salesVisits.plannedTime,
        startedAt: schema.salesVisits.startedAt,
        completedAt: schema.salesVisits.completedAt,
        startLatitude: schema.salesVisits.startLatitude,
        startLongitude: schema.salesVisits.startLongitude,
        endLatitude: schema.salesVisits.endLatitude,
        endLongitude: schema.salesVisits.endLongitude,
        notes: schema.salesVisits.notes,
        outcomeNotes: schema.salesVisits.outcomeNotes,
        createdAt: schema.salesVisits.createdAt,
      })
      .from(schema.salesVisits)
      .leftJoin(schema.customers, eq(schema.salesVisits.customerId, schema.customers.id))
      .leftJoin(schema.users, eq(schema.salesVisits.salesRepId, schema.users.id))
      .where(and(
        eq(schema.salesVisits.id, id),
        eq(schema.salesVisits.tenantId, tenantId)
      ));

    if (!visit) {
      return null;
    }

    // Sales rep can only see their own visits
    if (role === 'sales_rep' && visit.salesRepId !== userId) {
      return null;
    }

    // Supervisor can only see their assigned reps' visits
    if (role === 'supervisor') {
      const assignedRepIds = await this.getAssignedRepIds(userId, tenantId);
      if (!assignedRepIds.includes(visit.salesRepId)) {
        return null;
      }
    }

    return visit;
  }

  /**
   * Unified method to create a visit (scheduled or quick)
   */
  async createVisitUnified(input: UnifiedCreateVisitInput, tenantId: string, userId: string, role: string) {
    // Common validation
    await this.validateCustomer(input.customerId, tenantId);

    if (input.mode === 'scheduled') {
      return this.createScheduledVisit(input, tenantId, userId, role);
    } else {
      return this.createQuickVisitInternal(input, tenantId, userId);
    }
  }

  /**
   * Create a scheduled visit (internal method)
   */
  private async createScheduledVisit(input: UnifiedCreateVisitInput, tenantId: string, userId: string, role: string) {
    // Validate required fields for scheduled mode
    if (!input.plannedDate) {
      throw new Error('Planned date is required for scheduled visits');
    }

    // Validate planned date is not in the past
    this.validatePlannedDate(input.plannedDate);

    // Validate visit type if provided
    if (input.visitType) {
      this.validateVisitType(input.visitType);
    }

    // Sanitize notes
    const sanitizedNotes = input.notes ? sanitizeInput(input.notes) : undefined;

    const [visit] = await db
      .insert(schema.salesVisits)
      .values({
        tenantId,
        customerId: input.customerId,
        salesRepId: role === 'sales_rep' ? userId : (input.salesRepId || userId),
        visitType: (input.visitType || 'scheduled') as VisitType,
        status: 'planned',
        plannedDate: input.plannedDate,
        plannedTime: input.plannedTime,
        notes: sanitizedNotes,
      })
      .returning();

    return visit;
  }

  /**
   * Create and complete a visit in one step (internal method)
   */
  private async createQuickVisitInternal(input: UnifiedCreateVisitInput, tenantId: string, userId: string) {
    // Validate required fields for quick mode
    if (!input.outcome) {
      throw new Error('Outcome is required for quick visits');
    }

    // Validate outcome enum
    this.validateOutcome(input.outcome);

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    // Validate planned date if provided
    if (input.plannedDate) {
      this.validatePlannedDate(input.plannedDate);
    }

    // Build insert values with proper typing
    const insertValues: {
      tenantId: string;
      customerId: string;
      salesRepId: string;
      visitType: VisitType;
      status: 'completed';
      outcome: Outcome;
      plannedDate: string;
      plannedTime: string;
      startedAt: Date;
      completedAt: Date;
      startLatitude?: string;
      startLongitude?: string;
      endLatitude?: string;
      endLongitude?: string;
      photos?: string[];
      outcomeNotes?: string;
      noOrderReason?: string;
      followUpReason?: string;
      followUpDate?: string;
      followUpTime?: string;
    } = {
      tenantId,
      customerId: input.customerId,
      salesRepId: userId,
      visitType: 'ad_hoc',
      status: 'completed',
      outcome: input.outcome as Outcome,
      plannedDate: input.plannedDate || today,
      plannedTime: input.plannedTime || now.toTimeString().slice(0, 5),
      startedAt: now,
      completedAt: now,
    };

    // Add optional fields with sanitization
    if (input.latitude !== undefined && input.longitude !== undefined) {
      insertValues.startLatitude = input.latitude.toString();
      insertValues.startLongitude = input.longitude.toString();
      insertValues.endLatitude = input.latitude.toString();
      insertValues.endLongitude = input.longitude.toString();
    }
    if (input.photo) {
      insertValues.photos = [sanitizeInput(input.photo)!];
    }
    if (input.outcomeNotes) {
      insertValues.outcomeNotes = sanitizeInput(input.outcomeNotes) || undefined;
    }
    if (input.noOrderReason) {
      insertValues.noOrderReason = sanitizeInput(input.noOrderReason) || undefined;
    }
    if (input.followUpReason) {
      insertValues.followUpReason = sanitizeInput(input.followUpReason) || undefined;
    }
    if (input.followUpDate) {
      insertValues.followUpDate = input.followUpDate;
    }
    if (input.followUpTime) {
      insertValues.followUpTime = input.followUpTime;
    }

    // Create visit with completed status
    const [visit] = await db
      .insert(schema.salesVisits)
      .values(insertValues)
      .returning();

    return visit;
  }

  /**
   * Create a new visit (legacy method - delegates to unified method)
   * @deprecated Use createVisitUnified instead
   */
  async createVisit(input: CreateVisitInput, tenantId: string, userId: string, role: string) {
    return this.createVisitUnified(
      {
        ...input,
        mode: 'scheduled',
      },
      tenantId,
      userId,
      role
    );
  }

  /**
   * Create and complete a visit in one step (legacy method - delegates to unified method)
   * @deprecated Use createVisitUnified instead
   */
  async createQuickVisit(input: QuickVisitInput, tenantId: string, userId: string) {
    return this.createVisitUnified(
      {
        customerId: input.customerId,
        plannedDate: input.plannedDate,
        plannedTime: input.plannedTime,
        mode: 'quick',
        outcome: input.outcome,
        photo: input.photo,
        latitude: input.latitude,
        longitude: input.longitude,
        outcomeNotes: input.outcomeNotes,
        noOrderReason: input.noOrderReason,
        followUpReason: input.followUpReason,
        followUpDate: input.followUpDate,
        followUpTime: input.followUpTime,
      },
      tenantId,
      userId,
      'sales_rep'
    );
  }

  /**
   * Start a visit
   */
  async startVisit(visitId: string, input: StartVisitInput, tenantId: string, userId: string, role: string) {
    return await db.transaction(async (tx) => {
      // Get visit
      const [visit] = await tx
        .select()
        .from(schema.salesVisits)
        .where(and(
          eq(schema.salesVisits.id, visitId),
          eq(schema.salesVisits.tenantId, tenantId)
        ));

      if (!visit) {
        throw new Error('Visit not found');
      }

      // Sales rep can only start their own visits
      if (role === 'sales_rep' && visit.salesRepId !== userId) {
        throw new Error('Forbidden');
      }

      // Validate status transition
      if (visit.status !== 'planned') {
        throw new InvalidStatusTransitionError(`Cannot start visit with status '${visit.status}'. Only 'planned' visits can be started.`);
      }

      const result = await tx
        .update(schema.salesVisits)
        .set({
          status: 'in_progress',
          startedAt: new Date(),
          startLatitude: input.latitude?.toString(),
          startLongitude: input.longitude?.toString(),
          updatedAt: new Date(),
        })
        .where(eq(schema.salesVisits.id, visitId))
        .returning();

      return result[0];
    });
  }

  /**
   * Complete a visit
   */
  async completeVisit(visitId: string, input: CompleteVisitInput, tenantId: string, userId: string, role: string) {
    return await db.transaction(async (tx) => {
      // Get visit
      const [visit] = await tx
        .select()
        .from(schema.salesVisits)
        .where(and(
          eq(schema.salesVisits.id, visitId),
          eq(schema.salesVisits.tenantId, tenantId)
        ));

      if (!visit) {
        throw new Error('Visit not found');
      }

      if (role === 'sales_rep' && visit.salesRepId !== userId) {
        throw new Error('Forbidden');
      }

      // Validate status transition
      if (visit.status !== 'in_progress') {
        throw new InvalidStatusTransitionError(`Cannot complete visit with status '${visit.status}'. Only 'in_progress' visits can be completed.`);
      }

      // Validate outcome
      this.validateOutcome(input.outcome);

      // Sanitize inputs
      const sanitizedOutcomeNotes = input.outcomeNotes ? sanitizeInput(input.outcomeNotes) : undefined;
      const sanitizedPhotos = input.photos ? sanitizeArray(input.photos) : undefined;

      const result = await tx
        .update(schema.salesVisits)
        .set({
          status: 'completed',
          completedAt: new Date(),
          outcome: input.outcome as Outcome,
          outcomeNotes: sanitizedOutcomeNotes,
          photos: sanitizedPhotos,
          endLatitude: input.latitude?.toString(),
          endLongitude: input.longitude?.toString(),
          updatedAt: new Date(),
        })
        .where(eq(schema.salesVisits.id, visitId))
        .returning();

      return result[0];
    });
  }

  /**
   * Cancel a visit
   */
  async cancelVisit(visitId: string, input: CancelVisitInput, tenantId: string, userId: string, role: string) {
    return await db.transaction(async (tx) => {
      const [visit] = await tx
        .select()
        .from(schema.salesVisits)
        .where(and(
          eq(schema.salesVisits.id, visitId),
          eq(schema.salesVisits.tenantId, tenantId)
        ));

      if (!visit) {
        throw new Error('Visit not found');
      }

      if (role === 'sales_rep' && visit.salesRepId !== userId) {
        throw new Error('Forbidden');
      }

      // Validate status transition - can't cancel completed visits
      if (visit.status === 'completed') {
        throw new InvalidStatusTransitionError('Cannot cancel a completed visit.');
      }

      // Sanitize reason
      const sanitizedReason = input.reason ? sanitizeInput(input.reason) : undefined;

      const result = await tx
        .update(schema.salesVisits)
        .set({
          status: 'cancelled',
          outcomeNotes: sanitizedReason,
          updatedAt: new Date(),
        })
        .where(eq(schema.salesVisits.id, visitId))
        .returning();

      return result[0];
    });
  }

  /**
   * Update/reschedule a visit
   */
  async updateVisit(visitId: string, input: UpdateVisitInput, tenantId: string, userId: string, role: string) {
    return await db.transaction(async (tx) => {
      const [visit] = await tx
        .select()
        .from(schema.salesVisits)
        .where(and(
          eq(schema.salesVisits.id, visitId),
          eq(schema.salesVisits.tenantId, tenantId)
        ));

      if (!visit) {
        throw new Error('Visit not found');
      }

      if (role === 'sales_rep' && visit.salesRepId !== userId) {
        throw new Error('Forbidden');
      }

      // Can only reschedule planned visits
      if (visit.status !== 'planned') {
        throw new InvalidStatusTransitionError('Can only reschedule planned visits');
      }

      // Validate planned date if provided
      if (input.plannedDate) {
        this.validatePlannedDate(input.plannedDate);
      }

      // Validate visit type if provided
      if (input.visitType) {
        this.validateVisitType(input.visitType);
      }

      // Sanitize inputs
      const sanitizedNotes = input.notes ? sanitizeInput(input.notes) : undefined;

      const updateData: {
        updatedAt: Date;
        plannedDate?: string;
        plannedTime?: string;
        notes?: string;
        visitType?: VisitType;
      } = { updatedAt: new Date() };
      
      if (input.plannedDate) updateData.plannedDate = input.plannedDate;
      if (input.plannedTime !== undefined) updateData.plannedTime = input.plannedTime;
      if (input.notes !== undefined) updateData.notes = sanitizedNotes || undefined;
      if (input.visitType) updateData.visitType = input.visitType as VisitType;

      const result = await tx
        .update(schema.salesVisits)
        .set(updateData)
        .where(eq(schema.salesVisits.id, visitId))
        .returning();

      return result[0];
    });
  }

  /**
   * Mark missed visits
   */
  async markMissedVisits(tenantId: string) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Mark all planned visits from yesterday as missed
    const result = await db
      .update(schema.salesVisits)
      .set({
        status: 'missed',
        updatedAt: new Date(),
      })
      .where(and(
        eq(schema.salesVisits.tenantId, tenantId),
        eq(schema.salesVisits.status, 'planned'),
        lte(schema.salesVisits.plannedDate, yesterdayStr)
      ))
      .returning({ id: schema.salesVisits.id });

    return { markedAsMissed: result.length };
  }
}
