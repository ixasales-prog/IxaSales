import { describe, it, beforeAll, afterAll } from 'node:test';
import { equal, ok } from 'assert';
import Fastify from 'fastify';
import { db } from '../src/db';
import { schema } from '../src/db';
import { eq, and } from 'drizzle-orm';
import { visitRoutes } from '../src/routes-fastify/visits';

describe('Visits API Integration Tests', () => {
    let server: any;
    let testUser: any;
    let testCustomer: any;
    let testVisit: any;

    beforeAll(async () => {
        server = Fastify({ logger: false });
        server.register(visitRoutes);

        // Register hooks to simulate authentication
        server.addHook('preHandler', async (request: any) => {
            // Mock user for testing
            request.user = {
                id: 'test-user-id',
                tenantId: 'test-tenant-id',
                role: 'admin' // Use admin to have full access
            };
        });

        await server.ready();

        // Create a test customer
        const [customer] = await db
            .insert(schema.customers)
            .values({
                id: 'test-customer-id',
                tenantId: 'test-tenant-id',
                name: 'Test Customer',
                phone: '+1234567890',
                address: '123 Test Street',
                email: 'test@example.com',
                status: 'active',
                creditLimit: 1000,
                outstandingBalance: 0
            })
            .returning();

        testCustomer = customer;
    });

    afterAll(async () => {
        // Cleanup: Delete test visit if it exists
        if (testVisit) {
            await db
                .delete(schema.salesVisits)
                .where(eq(schema.salesVisits.id, testVisit.id));
        }

        // Delete test customer
        await db
            .delete(schema.customers)
            .where(eq(schema.customers.id, testCustomer.id));

        await server.close();
    });

    it('should create a visit successfully', async () => {
        const plannedDate = new Date();
        plannedDate.setDate(plannedDate.getDate() + 1); // Tomorrow
        const formattedDate = plannedDate.toISOString().split('T')[0];

        const response = await server.inject({
            method: 'POST',
            url: '/visits',
            payload: {
                customerId: testCustomer.id,
                plannedDate: formattedDate,
                plannedTime: '10:00',
                notes: 'Test visit for integration test',
                visitType: 'scheduled'
            }
        });

        equal(response.statusCode, 200);
        const result = response.json();
        ok(result.success);
        ok(result.data);
        equal(result.data.customerId, testCustomer.id);
        equal(result.data.status, 'planned');
        equal(result.data.plannedDate, formattedDate);
        testVisit = result.data; // Store for later tests
    });

    it('should start a planned visit successfully', async () => {
        if (!testVisit) {
            throw new Error('Test visit not created');
        }

        const response = await server.inject({
            method: 'PATCH',
            url: `/visits/${testVisit.id}/start`,
            payload: {
                latitude: 40.7128,
                longitude: -74.0060
            }
        });

        equal(response.statusCode, 200);
        const result = response.json();
        ok(result.success);
        equal(result.data.status, 'in_progress');
        ok(result.data.startedAt);
    });

    it('should complete an in-progress visit successfully', async () => {
        if (!testVisit) {
            throw new Error('Test visit not created');
        }

        const response = await server.inject({
            method: 'PATCH',
            url: `/visits/${testVisit.id}/complete`,
            payload: {
                outcome: 'order_placed',
                outcomeNotes: 'Successfully placed order',
                photos: ['https://example.com/photo.jpg'],
                latitude: 40.7128,
                longitude: -74.0060
            }
        });

        equal(response.statusCode, 200);
        const result = response.json();
        ok(result.success);
        equal(result.data.status, 'completed');
        equal(result.data.outcome, 'order_placed');
        ok(result.data.completedAt);
    });

    it('should validate status transitions', async () => {
        if (!testVisit) {
            throw new Error('Test visit not created');
        }

        // Try to start a completed visit (should fail)
        const response = await server.inject({
            method: 'PATCH',
            url: `/visits/${testVisit.id}/start`,
            payload: {
                latitude: 40.7128,
                longitude: -74.0060
            }
        });

        equal(response.statusCode, 400);
        const result = response.json();
        ok(!result.success);
        ok(result.error);
        ok(result.error.code === 'INVALID_STATUS_TRANSITION' || result.error.message.includes('in_progress'));
    });

    it('should validate planned date is not in the past', async () => {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 1); // Yesterday
        const formattedDate = pastDate.toISOString().split('T')[0];

        const response = await server.inject({
            method: 'POST',
            url: '/visits',
            payload: {
                customerId: testCustomer.id,
                plannedDate: formattedDate,
                plannedTime: '10:00',
                notes: 'Test visit with past date'
            }
        });

        equal(response.statusCode, 400);
        const result = response.json();
        ok(!result.success);
        ok(result.error);
        equal(result.error.code, 'INVALID_DATE');
    });
});