import { db, schema } from './index';
import { hashPassword } from '../lib/password';

async function seed() {
    console.log('🌱 Starting database seed...');

    try {
        // 1. Create Super Admin Tenant (System Tenant)
        console.log('Creating System Tenant...');
        const [systemTenant] = await db
            .insert(schema.tenants)
            .values({
                name: 'System Admin',
                subdomain: 'admin',
                plan: 'enterprise',
                isActive: true,
            })
            .returning();

        // 2. Create Default Tenant (Demo Company)
        console.log('Creating Demo Tenant...');
        const [demoTenant] = await db
            .insert(schema.tenants)
            .values({
                name: 'Demo Distribution Co',
                subdomain: 'demo',
                plan: 'pro',
                isActive: true,
                currency: 'USD',
                timezone: 'UTC',
            })
            .returning();

        // 3. Create Super Admin User
        console.log('Creating Super Admin User...');
        const superAdminPass = await hashPassword('admin123');
        await db.insert(schema.users).values({
            tenantId: systemTenant.id,
            name: 'Super Admin',
            email: 'admin@ixasales.com',
            passwordHash: superAdminPass,
            role: 'super_admin',
            isActive: true,
        });

        // 4. Create Tenant Admin User
        console.log('Creating Tenant Admin User...');
        const tenantAdminPass = await hashPassword('user123');
        await db.insert(schema.users).values({
            tenantId: demoTenant.id,
            name: 'John Demo',
            email: 'john@demo.com',
            passwordHash: tenantAdminPass,
            role: 'tenant_admin',
            isActive: true,
        });

        // 5. Create Sample Sales Rep User
        console.log('Creating Sample Sales Rep User...');
        const salesRepPass = await hashPassword('sales123');
        const [salesRepUser] = await db.insert(schema.users).values({
            tenantId: demoTenant.id,
            name: 'Jane Sales',
            email: 'jane@demo.com',
            passwordHash: salesRepPass,
            role: 'sales_rep',
            isActive: true,
            phone: '+998901234567'
        }).returning();

        // 6. Create Sample Customers
        console.log('Creating Sample Customers...');
        const [customer1] = await db.insert(schema.customers).values({
            tenantId: demoTenant.id,
            name: 'ABC Trading',
            phone: '+998901111111',
            address: 'Tashkent, Uzbekistan',
            createdByUserId: salesRepUser.id,
            creditBalance: '5000000',
            debtBalance: '0'
        }).returning();

        const [customer2] = await db.insert(schema.customers).values({
            tenantId: demoTenant.id,
            name: 'XYZ Company',
            phone: '+998902222222',
            address: 'Samarkand, Uzbekistan',
            createdByUserId: salesRepUser.id,
            creditBalance: '3000000',
            debtBalance: '150000'
        }).returning();

        const [customer3] = await db.insert(schema.customers).values({
            tenantId: demoTenant.id,
            name: 'Global Supplies',
            phone: '+998903333333',
            address: 'Bukhara, Uzbekistan',
            createdByUserId: salesRepUser.id,
            creditBalance: '7000000',
            debtBalance: '0'
        }).returning();

        // 7. Create Sample Visits with follow-ups
        console.log('Creating Sample Visits...');
        const today = new Date().toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        // Planned visit for today
        await db.insert(schema.salesVisits).values({
            tenantId: demoTenant.id,
            customerId: customer1.id,
            salesRepId: salesRepUser.id,
            visitType: 'scheduled',
            status: 'planned',
            plannedDate: today,
            plannedTime: '10:00',
            notes: 'Regular check-in with ABC Trading'
        });

        // Completed visit with follow-up outcome
        await db.insert(schema.salesVisits).values({
            tenantId: demoTenant.id,
            customerId: customer2.id,
            salesRepId: salesRepUser.id,
            visitType: 'scheduled',
            status: 'completed',
            plannedDate: yesterday,
            plannedTime: '14:00',
            startedAt: new Date(yesterday + ' 14:05:00'),
            completedAt: new Date(yesterday + ' 14:20:00'),
            outcome: 'follow_up',
            outcomeNotes: 'Customer needs more time to decide on large order',
            followUpDate: today,
            followUpReason: 'decision_pending'
        });

        // Scheduled follow-up for tomorrow
        await db.insert(schema.salesVisits).values({
            tenantId: demoTenant.id,
            customerId: customer3.id,
            salesRepId: salesRepUser.id,
            visitType: 'scheduled',
            status: 'planned',
            plannedDate: tomorrow,
            plannedTime: '11:00',
            outcome: 'follow_up',
            followUpDate: tomorrow,
            followUpReason: 'callback_requested',
            notes: 'Follow up on quote provided last week'
        });

        // Overdue follow-up from 2 days ago
        await db.insert(schema.salesVisits).values({
            tenantId: demoTenant.id,
            customerId: customer1.id,
            salesRepId: salesRepUser.id,
            visitType: 'scheduled',
            status: 'planned',
            plannedDate: new Date(Date.now() - 172800000).toISOString().split('T')[0], // 2 days ago
            plannedTime: '09:00',
            outcome: 'follow_up',
            followUpDate: new Date(Date.now() - 172800000).toISOString().split('T')[0], // 2 days ago
            followUpReason: 'owner_absent',
            notes: 'Owner was not available, need to follow up'
        });

        console.log('✅ Seeding complete!');
        console.log('\nCredentials:');
        console.log('Super Admin: admin@ixasales.com / admin123');
        console.log('Tenant Admin: john@demo.com / user123');
        console.log('Sales Rep: jane@demo.com / sales123');
        console.log('\nSample Data:');
        console.log('- 3 customers created (ABC Trading, XYZ Company, Global Supplies)');
        console.log('- 4 visits created (1 planned today, 1 completed follow-up, 1 scheduled tomorrow, 1 overdue)');
        console.log('- Sales rep has follow-up visits that will appear on dashboard');

        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
}

seed();
