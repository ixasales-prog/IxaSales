/**
 * Script to create a new tenant and default users
 * Usage: npx tsx scripts/create_tenant_and_users.ts "Tenant Name"
 * 
 * Creates:
 * 1. A new tenant with the given name
 * 2. 6 default users with password "11111111":
 *    - Superadmin@ixasales.uz (super_admin)
 *    - TenantAdmin@ixasales.uz (tenant_admin)
 *    - Supervisor@ixasales.uz (supervisor)
 *    - Sales@ixasales.uz (sales_rep)
 *    - Warehouse@ixasales.uz (warehouse)
 *    - Delivery@ixasales.uz (driver)
 */

import { db } from '../src/db';
import { users, tenants, tenantNotificationSettings, notificationRoleSettings } from '../src/db/schema';
import { hashPassword } from '../src/lib/password';
import { eq } from 'drizzle-orm';

const DEFAULT_PASSWORD = '11111111';

const USERS_TO_CREATE = [
    {
        name: 'Super Admin',
        email: 'Superadmin@ixasales.uz',
        role: 'super_admin' as const,
        phone: '+998901234567',
    },
    {
        name: 'Tenant Admin',
        email: 'TenantAdmin@ixasales.uz',
        role: 'tenant_admin' as const,
        phone: '+998901234568',
    },
    {
        name: 'Supervisor',
        email: 'Supervisor@ixasales.uz',
        role: 'supervisor' as const,
        phone: '+998901234569',
    },
    {
        name: 'Sales Representative',
        email: 'Sales@ixasales.uz',
        role: 'sales_rep' as const,
        phone: '+998901234570',
    },
    {
        name: 'Warehouse Manager',
        email: 'Warehouse@ixasales.uz',
        role: 'warehouse' as const,
        phone: '+998901234571',
    },
    {
        name: 'Delivery Driver',
        email: 'Delivery@ixasales.uz',
        role: 'driver' as const,
        phone: '+998901234572',
    },
];

function generateSubdomain(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50);
}

async function createTenantAndUsers(tenantName: string) {
    console.log(`\n🏢 Creating tenant: "${tenantName}"\n`);

    const subdomain = generateSubdomain(tenantName);
    console.log(`Generated subdomain: ${subdomain}\n`);

    // Check if tenant with this subdomain already exists
    const [existingTenant] = await db.select({ id: tenants.id, name: tenants.name })
        .from(tenants)
        .where(eq(tenants.subdomain, subdomain))
        .limit(1);

    if (existingTenant) {
        console.error(`❌ A tenant with subdomain "${subdomain}" already exists: ${existingTenant.name}`);
        process.exit(1);
    }

    // Create tenant
    console.log('Creating tenant...');
    const [newTenant] = await db.insert(tenants).values({
        name: tenantName,
        subdomain: subdomain,
        plan: 'pro',
        maxUsers: 50,
        maxProducts: 5000,
        currency: 'UZS',
        timezone: 'Asia/Tashkent',
        isActive: true,
    }).returning({
        id: tenants.id,
        name: tenants.name,
        subdomain: tenants.subdomain,
    });

    console.log(`✅ Tenant created: ${newTenant.name} (${newTenant.id})\n`);

    // Create default notification settings for tenant
    console.log('Creating default notification settings...');
    await db.insert(tenantNotificationSettings).values({
        tenantId: newTenant.id,
    }).onConflictDoNothing();
    console.log('✅ Notification settings created\n');

    // Hash password once for all users
    console.log('🔐 Hashing password...');
    const passwordHash = await hashPassword(DEFAULT_PASSWORD);
    console.log('✓ Password hashed\n');

    const createdUsers = [];
    const skippedUsers = [];

    for (const userData of USERS_TO_CREATE) {
        // Check if user already exists
        const [existing] = await db.select({ id: users.id, email: users.email })
            .from(users)
            .where(eq(users.email, userData.email.toLowerCase()))
            .limit(1);

        if (existing) {
            console.log(`⚠️  Skipping ${userData.email} - already exists (ID: ${existing.id})`);
            skippedUsers.push(userData);
            continue;
        }

        // Create user
        const [newUser] = await db.insert(users).values({
            tenantId: userData.role === 'super_admin' ? null : newTenant.id,
            name: userData.name,
            email: userData.email.toLowerCase(),
            passwordHash,
            role: userData.role,
            phone: userData.phone,
            isActive: true,
        }).returning({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
        });

        console.log(`✅ Created: ${newUser.name} (${newUser.email}) - Role: ${newUser.role}`);
        createdUsers.push(newUser);
    }

    // Create notification role settings for the tenant (optional - table may not exist)
    try {
        console.log('\nSetting up notification role settings...');
        const notificationTypes = [
            'notifyNewOrder',
            'notifyOrderApproved',
            'notifyOrderCancelled',
            'notifyOrderDelivered',
            'notifyOrderPartialDelivery',
            'notifyOrderReturned',
            'notifyOrderPartialReturn',
            'notifyOrderCompleted',
            'notifyPaymentReceived',
            'notifyPaymentPartial',
            'notifyPaymentComplete',
            'notifyLowStock',
            'notifyDueDebt',
        ];

        const roles = ['tenant_admin', 'supervisor', 'sales_rep', 'warehouse', 'driver'];
        
        for (const notificationType of notificationTypes) {
            for (const role of roles) {
                await db.insert(notificationRoleSettings).values({
                    tenantId: newTenant.id,
                    notificationType,
                    role: role as any,
                    enabled: true,
                }).onConflictDoNothing();
            }
        }
        console.log('✅ Notification role settings created\n');
    } catch (err) {
        console.log('⚠️  Notification role settings table not found (optional feature)\n');
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Tenant: ${newTenant.name}`);
    console.log(`ID: ${newTenant.id}`);
    console.log(`Subdomain: ${newTenant.subdomain}`);
    console.log(`Plan: pro (maxUsers: 50, maxProducts: 5000)`);
    console.log(`-`.repeat(60));
    console.log(`Created: ${createdUsers.length} users`);
    console.log(`Skipped: ${skippedUsers.length} users (already exist)`);
    console.log(`\nPassword for all users: ${DEFAULT_PASSWORD}`);
    console.log('='.repeat(60));

    if (createdUsers.length > 0) {
        console.log('\n✨ Newly created users:');
        createdUsers.forEach(u => {
            console.log(`  • ${u.name} (${u.email}) - ${u.role}`);
        });
    }

    if (skippedUsers.length > 0) {
        console.log('\n⚠️  Skipped (already exist):');
        skippedUsers.forEach(u => {
            console.log(`  • ${u.name} (${u.email})`);
        });
    }

    console.log('\n✅ Done!\n');
    console.log('You can now log in with any of these accounts:');
    console.log('  URL: http://localhost:3000 (or your configured domain)');
    console.log('  Password: 11111111');
    console.log('');
}

// Main execution
async function main() {
    const tenantName = process.argv[2] || 'Demo Company';

    if (!tenantName || tenantName.trim() === '') {
        console.error('\n❌ Error: Tenant name is required!\n');
        console.log('Usage: npx tsx scripts/create_tenant_and_users.ts "Tenant Name"\n');
        console.log('Example:');
        console.log('  npx tsx scripts/create_tenant_and_users.ts "My Company"\n');
        process.exit(1);
    }

    try {
        await createTenantAndUsers(tenantName.trim());
    } catch (error) {
        console.error('\n❌ Error:', error);
        process.exit(1);
    }
}

main();
