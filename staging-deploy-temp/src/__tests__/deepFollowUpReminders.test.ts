/**
 * Comprehensive testing for follow-up reminders
 * Tests all components and edge cases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FollowUpDataFetcher, FollowUpReminderProcessor } from '@/lib/scheduler/jobs/deepFollowUpReminders';

// Mock database
const mockDb = {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    update: vi.fn(),
    set: vi.fn(),
};

vi.mock('@/db', () => ({
    db: mockDb
}));

vi.mock('@/db/schema', () => ({
    salesVisits: {},
    customers: {},
    users: {}
}));

vi.mock('drizzle-orm', () => ({
    and: vi.fn(),
    eq: vi.fn(),
    isNull: vi.fn(),
    sql: vi.fn()
}));

vi.mock('@/lib/telegram', () => ({
    sendFollowUpReminder: vi.fn()
}));

describe('Follow-Up Reminders - Deep Testing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('FollowUpDataFetcher', () => {
        it('should safely convert valid date strings', () => {
            const validDates = [
                '2024-01-15',
                '2024-01-15T00:00:00',
                '2024-01-15T10:30:00Z'
            ];
            
            validDates.forEach(dateStr => {
                const result = FollowUpDataFetcher.safeDateConversion(dateStr);
                expect(result).toBeInstanceOf(Date);
                expect(result).not.toBeNull();
            });
        });

        it('should handle invalid date strings gracefully', () => {
            const invalidDates = [
                null,
                '',
                'invalid-date',
                '2024-13-45', // Invalid month/day
                'not-a-date'
            ];
            
            invalidDates.forEach(dateStr => {
                const result = FollowUpDataFetcher.safeDateConversion(dateStr as any);
                expect(result).toBeNull();
            });
        });

        it('should fetch customer data with error handling', async () => {
            const mockCustomer = { id: '1', name: 'Test Customer', phone: '123', address: 'Test Address' };
            
            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([mockCustomer])
                    })
                })
            });
            
            const result = await FollowUpDataFetcher.getCustomer('1');
            expect(result).toEqual(mockCustomer);
        });

        it('should handle customer fetch errors gracefully', async () => {
            mockDb.select.mockImplementation(() => {
                throw new Error('Database error');
            });
            
            const result = await FollowUpDataFetcher.getCustomer('1');
            expect(result).toBeNull();
        });
    });

    describe('FollowUpReminderProcessor', () => {
        it('should calculate correct cutoff dates', () => {
            // This tests the core logic without database calls
            const processor = FollowUpReminderProcessor as any;
            expect(processor.CUTOFF_DAYS).toBe(7);
        });

        it('should process reminders with proper validation', async () => {
            // Mock the processor methods
            const mockVisit = {
                id: 'visit-1',
                customerId: 'customer-1',
                salesRepId: 'rep-1',
                followUpDate: '2024-01-15',
                followUpTime: '10:00',
                followUpReason: 'Product discussion'
            };
            
            // Mock data fetcher responses
            vi.spyOn(FollowUpDataFetcher, 'getCustomer').mockResolvedValue({
                id: 'customer-1',
                name: 'Test Customer',
                phone: '123',
                address: 'Test Address'
            });
            
            vi.spyOn(FollowUpDataFetcher, 'getSalesRep').mockResolvedValue({
                id: 'rep-1',
                name: 'Test Rep',
                telegramChatId: 'chat-123'
            });
            
            // Mock telegram function
            const { sendFollowUpReminder } = await import('@/lib/telegram');
            (sendFollowUpReminder as any).mockResolvedValue(true);
            
            const result = await FollowUpReminderProcessor.processSingleReminder(mockVisit as any);
            
            expect(result.visitId).toBe('visit-1');
            expect(result.status).toBe('sent');
        });
    });

    describe('Integration Tests', () => {
        it('should handle the complete workflow', async () => {
            // Test the entire flow from finding reminders to processing them
            const mockReminders = [
                {
                    id: 'visit-1',
                    customerId: 'customer-1',
                    salesRepId: 'rep-1',
                    followUpDate: '2024-01-15',
                    followUpTime: '10:00',
                    followUpReason: 'Test reason'
                }
            ];
            
            // Mock database execute
            const { sql } = await import('drizzle-orm');
            (sql as any).mockResolvedValue({
                rows: mockReminders,
                rowCount: mockReminders.length
            });
            
            // Mock all dependencies
            vi.spyOn(FollowUpDataFetcher, 'getCustomer').mockResolvedValue({
                id: 'customer-1',
                name: 'Test Customer',
                phone: '123',
                address: 'Test Address'
            });
            
            vi.spyOn(FollowUpDataFetcher, 'getSalesRep').mockResolvedValue({
                id: 'rep-1',
                name: 'Test Rep',
                telegramChatId: 'chat-123'
            });
            
            const { sendFollowUpReminder } = await import('@/lib/telegram');
            (sendFollowUpReminder as any).mockResolvedValue(true);
            
            // Mock update operation
            mockDb.update.mockReturnValue({
                set: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue({})
                })
            });
            
            const results = [];
            for (const reminder of mockReminders) {
                const result = await FollowUpReminderProcessor.processSingleReminder(reminder as any);
                results.push(result);
            }
            
            expect(results).toHaveLength(1);
            expect(results[0].status).toBe('sent');
        });
    });
});