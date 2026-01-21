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

        console.log('✅ Seeding complete!');
        console.log('\nCredentials:');
        console.log('Super Admin: admin@ixasales.com / admin123');
        console.log('Tenant Admin: john@demo.com / user123');

        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
}

seed();
