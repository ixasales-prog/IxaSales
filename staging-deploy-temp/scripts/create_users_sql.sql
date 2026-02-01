-- SQL Script to create default users for any tenant in pgAdmin
-- Password for all users: 11111111 (bcrypt hashed)
-- 
-- Instructions:
-- 1. Open pgAdmin
-- 2. Connect to your database
-- 3. Open Query Tool
-- 4. Replace :tenant_id with your actual tenant UUID
-- 5. Run the script
--
-- Users created:
-- 1. Superadmin@ixasales.uz (super_admin) - NO tenant (global)
-- 2. TenantAdmin@ixasales.uz (tenant_admin)
-- 3. Supervisor@ixasales.uz (supervisor)
-- 4. Sales@ixasales.uz (sales_rep)
-- 5. Warehouse@ixasales.uz (warehouse)
-- 6. Delivery@ixasales.uz (driver)

-- NOTE: Replace this with your actual tenant UUID
-- :tenant_id = 'your-tenant-uuid-here'

-- First, let's check if the tenant exists
SELECT id, name, subdomain FROM tenants WHERE id = :tenant_id;

-- Insert users with pre-hashed password (11111111)
-- Password hash generated with bcrypt (12 rounds): $2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G

-- 1. Super Admin (no tenant - global access)
INSERT INTO users (
    id, tenant_id, role, name, email, password_hash, phone, is_active, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    NULL, -- super_admin has no tenant
    'super_admin',
    'Super Admin',
    'superadmin@ixasales.uz',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G',
    '+998901234567',
    true,
    NOW(),
    NOW()
) ON CONFLICT (email) DO NOTHING;

-- 2. Tenant Admin
INSERT INTO users (
    id, tenant_id, role, name, email, password_hash, phone, is_active, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    :tenant_id,
    'tenant_admin',
    'Tenant Admin',
    'tenantadmin@ixasales.uz',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G',
    '+998901234568',
    true,
    NOW(),
    NOW()
) ON CONFLICT (email) DO NOTHING;

-- 3. Supervisor
INSERT INTO users (
    id, tenant_id, role, name, email, password_hash, phone, is_active, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    :tenant_id,
    'supervisor',
    'Supervisor',
    'supervisor@ixasales.uz',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G',
    '+998901234569',
    true,
    NOW(),
    NOW()
) ON CONFLICT (email) DO NOTHING;

-- 4. Sales Representative
INSERT INTO users (
    id, tenant_id, role, name, email, password_hash, phone, is_active, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    :tenant_id,
    'sales_rep',
    'Sales Representative',
    'sales@ixasales.uz',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G',
    '+998901234570',
    true,
    NOW(),
    NOW()
) ON CONFLICT (email) DO NOTHING;

-- 5. Warehouse Manager
INSERT INTO users (
    id, tenant_id, role, name, email, password_hash, phone, is_active, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    :tenant_id,
    'warehouse',
    'Warehouse Manager',
    'warehouse@ixasales.uz',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G',
    '+998901234571',
    true,
    NOW(),
    NOW()
) ON CONFLICT (email) DO NOTHING;

-- 6. Delivery Driver
INSERT INTO users (
    id, tenant_id, role, name, email, password_hash, phone, is_active, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    :tenant_id,
    'driver',
    'Delivery Driver',
    'delivery@ixasales.uz',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G',
    '+998901234572',
    true,
    NOW(),
    NOW()
) ON CONFLICT (email) DO NOTHING;

-- Verify created users
SELECT 
    u.id,
    u.name,
    u.email,
    u.role,
    u.phone,
    u.is_active,
    t.name as tenant_name,
    u.created_at
FROM users u
LEFT JOIN tenants t ON u.tenant_id = t.id
WHERE u.email IN (
    'superadmin@ixasales.uz',
    'tenantadmin@ixasales.uz',
    'supervisor@ixasales.uz',
    'sales@ixasales.uz',
    'warehouse@ixasales.uz',
    'delivery@ixasales.uz'
)
ORDER BY 
    CASE u.role
        WHEN 'super_admin' THEN 1
        WHEN 'tenant_admin' THEN 2
        WHEN 'supervisor' THEN 3
        WHEN 'sales_rep' THEN 4
        WHEN 'warehouse' THEN 5
        WHEN 'driver' THEN 6
    END;
