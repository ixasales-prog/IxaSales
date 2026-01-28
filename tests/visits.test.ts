import { describe, it, before, after } from 'node:test';
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
    let quickVisit: any;

    before(async () => {
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
                tenantId: 'test-tenant-id',
                name: 'Test Customer',
                phone: '+1234567890',
                address: '123 Test Street',
                email: 'test@example.com'
            })
            .returning();

        testCustomer = customer;
    });

    after(async () => {
        // Cleanup: Delete test visits if they exist
        if (testVisit) {
            await db
                .delete(schema.salesVisits)
                .where(eq(schema.salesVisits.id, testVisit.id));
        }
        if (quickVisit) {
            await db
                .delete(schema.salesVisits)
                .where(eq(schema.salesVisits.id, quickVisit.id));
        }

        // Delete test customer
        await db
            .delete(schema.customers)
            .where(eq(schema.customers.id, testCustomer.id));

        await server.close();
    });

    it('should create a scheduled visit successfully', async () => {
        const plannedDate = new Date();
        plannedDate.setDate(plannedDate.getDate() + 1); // Tomorrow
        const formattedDate = plannedDate.toISOString().split('T')[0];

        const response = await server.inject({
            method: 'POST',
            url: '/',
            payload: {
                customerId: testCustomer.id,
                plannedDate: formattedDate,
                plannedTime: '10:00',
                notes: 'Test visit for integration test',
                visitType: 'scheduled',
                mode: 'scheduled'
            }
        });

        equal(response.statusCode, 200);
        const result = response.json();
        ok(result.success);
        ok(result.data);
        equal(result.data.customerId, testCustomer.id);
        equal(result.data.status, 'planned');
        equal(result.data.plannedDate, formattedDate);
        equal(result.data.visitType, 'scheduled');
        testVisit = result.data; // Store for later tests
    });

    it('should create a quick visit successfully', async () => {
        const response = await server.inject({
            method: 'POST',
            url: '/',
            payload: {
                customerId: testCustomer.id,
                mode: 'quick',
                outcome: 'order_placed',
                outcomeNotes: 'Quick visit completed with order',
                latitude: 40.7128,
                longitude: -74.0060
            }
        });

        equal(response.statusCode, 200);
        const result = response.json();
        ok(result.success);
        ok(result.data);
        equal(result.data.customerId, testCustomer.id);
        equal(result.data.status, 'completed');
        equal(result.data.outcome, 'order_placed');
        equal(result.data.visitType, 'ad_hoc');
        ok(result.data.startedAt);
        ok(result.data.completedAt);
        quickVisit = result.data; // Store for cleanup
    });

    it('should validate mode parameter', async () => {
        const response = await server.inject({
            method: 'POST',
            url: '/',
            payload: {
                customerId: testCustomer.id,
                mode: 'invalid_mode',
                plannedDate: '2025-01-01'
            }
        });

        equal(response.statusCode, 400);
        const result = response.json();
        ok(!result.success);
        equal(result.error.code, 'INVALID_MODE');
    });

    it('should validate required fields for scheduled mode', async () => {
        const response = await server.inject({
            method: 'POST',
            url: '/',
            payload: {
                customerId: testCustomer.id,
                mode: 'scheduled'
                // Missing plannedDate
            }
        });

        equal(response.statusCode, 400);
        const result = response.json();
        ok(!result.success);
        equal(result.error.code, 'MISSING_REQUIRED_FIELD');
    });

    it('should validate required fields for quick mode', async () => {
        const response = await server.inject({
            method: 'POST',
            url: '/',
            payload: {
                customerId: testCustomer.id,
                mode: 'quick'
                // Missing outcome
            }
        });

        equal(response.statusCode, 400);
        const result = response.json();
        ok(!result.success);
        equal(result.error.code, 'MISSING_REQUIRED_FIELD');
    });

    it('should validate outcome enum for quick visits', async () => {
        const response = await server.inject({
            method: 'POST',
            url: '/',
            payload: {
                customerId: testCustomer.id,
                mode: 'quick',
                outcome: 'invalid_outcome'
            }
        });

        equal(response.statusCode, 400);
        const result = response.json();
        ok(!result.success);
        equal(result.error.code, 'INVALID_OUTCOME');
    });

    it('should start a planned visit successfully', async () => {
        if (!testVisit) {
            throw new Error('Test visit not created');
        }

        const response = await server.inject({
            method: 'PATCH',
            url: `/${testVisit.id}/start`,
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
            url: `/${testVisit.id}/complete`,
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

    it('should validate outcome enum when completing visit', async () => {
        // Create a new visit to test completion validation
        const plannedDate = new Date();
        plannedDate.setDate(plannedDate.getDate() + 1);
        const formattedDate = plannedDate.toISOString().split('T')[0];

        const createResponse = await server.inject({
            method: 'POST',
            url: '/',
            payload: {
                customerId: testCustomer.id,
                plannedDate: formattedDate,
                mode: 'scheduled'
            }
        });

        const newVisit = createResponse.json().data;

        // Start the visit
        await server.inject({
            method: 'PATCH',
            url: `/${newVisit.id}/start`,
            payload: {}
        });

        // Try to complete with invalid outcome
        const response = await server.inject({
            method: 'PATCH',
            url: `/${newVisit.id}/complete`,
            payload: {
                outcome: 'invalid_outcome'
            }
        });

        equal(response.statusCode, 400);
        const result = response.json();
        ok(!result.success);
        equal(result.error.code, 'INVALID_OUTCOME');

        // Cleanup
        await db.delete(schema.salesVisits).where(eq(schema.salesVisits.id, newVisit.id));
    });

    it('should validate status transitions', async () => {
        if (!testVisit) {
            throw new Error('Test visit not created');
        }

        // Try to start a completed visit (should fail)
        const response = await server.inject({
            method: 'PATCH',
            url: `/${testVisit.id}/start`,
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
            url: '/',
            payload: {
                customerId: testCustomer.id,
                mode: 'scheduled',
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

    it('should validate visit type enum', async () => {
        const plannedDate = new Date();
        plannedDate.setDate(plannedDate.getDate() + 1);
        const formattedDate = plannedDate.toISOString().split('T')[0];

        const response = await server.inject({
            method: 'POST',
            url: '/',
            payload: {
                customerId: testCustomer.id,
                mode: 'scheduled',
                plannedDate: formattedDate,
                visitType: 'invalid_type'
            }
        });

        equal(response.statusCode, 400);
        const result = response.json();
        ok(!result.success);
        equal(result.error.code, 'INVALID_VISIT_TYPE');
    });

    it('should list visits with pagination', async () => {
        const response = await server.inject({
            method: 'GET',
            url: '/?page=1&limit=10',
        });

        equal(response.statusCode, 200);
        const result = response.json();
        ok(result.success);
        ok(Array.isArray(result.data));
        ok(result.meta);
        ok(typeof result.meta.total === 'number');
        ok(typeof result.meta.totalPages === 'number');
    });

    it('should get visit by id', async () => {
        if (!testVisit) {
            throw new Error('Test visit not created');
        }

        const response = await server.inject({
            method: 'GET',
            url: `/${testVisit.id}`,
        });

        equal(response.statusCode, 200);
        const result = response.json();
        ok(result.success);
        equal(result.data.id, testVisit.id);
    });

    it('should return 404 for non-existent visit', async () => {
        const response = await server.inject({
            method: 'GET',
            url: '/non-existent-id',
        });

        equal(response.statusCode, 404);
        const result = response.json();
        ok(!result.success);
        equal(result.error.code, 'NOT_FOUND');
    });
});
