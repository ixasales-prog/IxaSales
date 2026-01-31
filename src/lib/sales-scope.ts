import { and, eq, sql } from 'drizzle-orm';
import { schema } from '../db';

export const buildSalesCustomerScope = (tenantId: string, userId: string) => and(
    eq(schema.customers.tenantId, tenantId),
    eq(schema.customers.assignedSalesRepId, userId)
);

export const buildSalesCustomerAssignmentCondition = (
    customerIdColumn: any,
    tenantId: string,
    userId: string
) => sql`exists (
    select 1
    from ${schema.customers}
    where ${schema.customers.id} = ${customerIdColumn}
      and ${schema.customers.tenantId} = ${tenantId}
      and ${schema.customers.assignedSalesRepId} = ${userId}
)`;
