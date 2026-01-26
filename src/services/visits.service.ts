import { db, schema } from '../db';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';
import { InvalidStatusTransitionError } from '../errors';

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
   * List visits with pagination and filtering
   */
  async listVisits(tenantId: string, userId: string, role: string, filters: VisitFilters = {}) {
    const { page = 1, limit = 20, startDate, endDate, status, customerId } = filters;
    const offset = (page - 1) * limit;

    const conditions: any[] = [eq(schema.salesVisits.tenantId, tenantId)];

    // Sales rep can only see their own visits
    if (role === 'sales_rep') {
      conditions.push(eq(schema.salesVisits.salesRepId, userId));
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

    const conditions: any[] = [
      eq(schema.salesVisits.tenantId, tenantId),
      eq(schema.salesVisits.plannedDate, actualDate),
    ];

    if (role === 'sales_rep') {
      conditions.push(eq(schema.salesVisits.salesRepId, userId));
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

    const conditions: any[] = [
      eq(schema.salesVisits.tenantId, tenantId),
      eq(schema.salesVisits.outcome, 'follow_up'),
    ];

    if (role === 'sales_rep') {
      conditions.push(eq(schema.salesVisits.salesRepId, userId));
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

    return visit;
  }

  /**
   * Create a new visit
   */
  async createVisit(input: CreateVisitInput, tenantId: string, userId: string, role: string) {
    // Validate planned date is not in the past
    const plannedDate = new Date(input.plannedDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (plannedDate < today) {
      throw new Error('Planned date cannot be in the past');
    }

    // Verify customer exists and belongs to tenant
    const [customer] = await db
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(and(
        eq(schema.customers.id, input.customerId),
        eq(schema.customers.tenantId, tenantId)
      ));

    if (!customer) {
      throw new Error('Customer not found');
    }

    // Sanitize notes
    const sanitizedNotes = input.notes ? sanitizeInput(input.notes) : undefined;

    const [visit] = await db
      .insert(schema.salesVisits)
      .values({
        tenantId,
        customerId: input.customerId,
        salesRepId: role === 'sales_rep' ? userId : (input.salesRepId || userId),
        visitType: (input.visitType || 'scheduled') as any,
        status: 'planned',
        plannedDate: input.plannedDate,
        plannedTime: input.plannedTime,
        notes: sanitizedNotes,
      })
      .returning();

    return visit;
  }

  /**
   * Create and complete a visit in one step (quick visit)
   */
  async createQuickVisit(input: QuickVisitInput, tenantId: string, userId: string) {
    // Verify customer exists and belongs to tenant
    const [customer] = await db
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(and(
        eq(schema.customers.id, input.customerId),
        eq(schema.customers.tenantId, tenantId)
      ));

    if (!customer) {
      throw new Error('Customer not found');
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    // Validate planned date if provided
    if (input.plannedDate) {
      const plannedDate = new Date(input.plannedDate);
      const dateToday = new Date();
      dateToday.setHours(0, 0, 0, 0);
      
      if (plannedDate < dateToday) {
        throw new Error('Planned date cannot be in the past');
      }
    }

    // Build insert values, handling optional fields with sanitization
    const insertValues: any = {
      tenantId,
      customerId: input.customerId,
      salesRepId: userId,
      visitType: 'ad_hoc',
      status: 'completed',
      outcome: input.outcome,
      plannedDate: input.plannedDate || today,
      plannedTime: input.plannedTime || now.toTimeString().slice(0, 5),
      startedAt: now,
      completedAt: now,
    };

    // Sanitize and add optional fields
    if (input.latitude !== undefined) {
      insertValues.startLatitude = input.latitude.toString();
      insertValues.startLongitude = input.longitude?.toString();
      insertValues.endLatitude = input.latitude.toString();
      insertValues.endLongitude = input.longitude?.toString();
    }
    if (input.photo) {
      insertValues.photos = [sanitizeInput(input.photo)!];
    }
    if (input.outcomeNotes) {
      insertValues.outcomeNotes = sanitizeInput(input.outcomeNotes);
    }
    if (input.noOrderReason) {
      insertValues.noOrderReason = sanitizeInput(input.noOrderReason);
    }
    if (input.followUpReason) {
      insertValues.followUpReason = sanitizeInput(input.followUpReason);
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

      // Sanitize inputs
      const sanitizedOutcomeNotes = input.outcomeNotes ? sanitizeInput(input.outcomeNotes) : undefined;
      const sanitizedPhotos = input.photos ? sanitizeArray(input.photos) : undefined;

      const result = await tx
        .update(schema.salesVisits)
        .set({
          status: 'completed',
          completedAt: new Date(),
          outcome: input.outcome as any,
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
        const plannedDate = new Date(input.plannedDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (plannedDate < today) {
          throw new Error('Planned date cannot be in the past');
        }
      }

      // Sanitize inputs
      const sanitizedNotes = input.notes ? sanitizeInput(input.notes) : undefined;

      const updateData: any = { updatedAt: new Date() };
      if (input.plannedDate) updateData.plannedDate = input.plannedDate;
      if (input.plannedTime !== undefined) updateData.plannedTime = input.plannedTime;
      if (input.notes !== undefined) updateData.notes = sanitizedNotes;
      if (input.visitType) updateData.visitType = input.visitType;

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