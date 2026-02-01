/**
 * Script to create default users for any tenant
 * Usage: npx tsx scripts/create_users_for_tenant.ts <tenant_id>
 * 
 * Creates the following users with password "11111111":
 * 1. Superadmin@ixasales.uz (super_admin)
 * 2. TenantAdmin@ixasales.uz (tenant_admin)
 * 3. Supervisor@ixasales.uz (supervisor)
 * 4. Sales@ixasales.uz (sales_rep)
 * 5. Warehouse@ixasales.uz (warehouse)
 * 6. Delivery@ixasales.uz (driver)
 */

import { db } from '../src/db';
import { users, tenants } from '../src/db/schema';
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

async function createUsersForTenant(tenantId: string) {
    console.log(`\n🏢 Creating users for tenant: ${tenantId}\n`);

    // Verify tenant exists
    const [tenant] = await db.select({ id: tenants.id, name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

    if (!tenant) {
        console.error(`❌ Tenant with ID "${tenantId}" not found!`);
        process.exit(1);
    }

    console.log(`✓ Found tenant: ${tenant.name} (${tenant.id})\n`);

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
            tenantId: userData.role === 'super_admin' ? null : tenantId,
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

        console.log(`✅ Created: ${newUser.name} (${newUser.email}) - Role: ${newUser.role} - ID: ${newUser.id}`);
        createdUsers.push(newUser);
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Tenant: ${tenant.name} (${tenant.id})`);
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
}

// Main execution
async function main() {
    const tenantId = process.argv[2];

    if (!tenantId) {
        console.error('\n❌ Error: Tenant ID is required!\n');
        console.log('Usage: npx tsx scripts/create_users_for_tenant.ts <tenant_id>\n');
        console.log('Example:');
        console.log('  npx tsx scripts/create_users_for_tenant.ts 123e4567-e89b-12d3-a456-426614174000\n');
        
        // Show available tenants
        console.log('Fetching available tenants...\n');
        const allTenants = await db.select({ id: tenants.id, name: tenants.name, subdomain: tenants.subdomain })
            .from(tenants)
            .orderBy(tenants.name);
        
        if (allTenants.length === 0) {
            console.log('No tenants found in the database.\n');
        } else {
            console.log('Available tenants:');
            allTenants.forEach(t => {
                console.log(`  • ${t.name} (${t.subdomain})`);
                console.log(`    ID: ${t.id}\n`);
            });
        }
        
        process.exit(1);
    }

    try {
        await createUsersForTenant(tenantId);
    } catch (error) {
        console.error('\n❌ Error creating users:', error);
        process.exit(1);
    } finally {
        // Close database connection
        // Note: The db connection is managed by the db module
    }
}

main();
