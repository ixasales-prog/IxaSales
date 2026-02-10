-- ============================================================================
-- Tier Upgrade/Downgrade System Migration
-- ============================================================================

-- Upgrade condition type enum
DO $$ BEGIN
    CREATE TYPE upgrade_condition_type AS ENUM ('orders_count', 'total_spend', 'on_time_payment_pct');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Tier change type enum (for logging)
DO $$ BEGIN
    CREATE TYPE tier_change_type AS ENUM ('downgrade', 'upgrade', 'manual');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Tier Upgrade Rules table
CREATE TABLE IF NOT EXISTS tier_upgrade_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    from_tier_id UUID NOT NULL REFERENCES customer_tiers(id),
    to_tier_id UUID NOT NULL REFERENCES customer_tiers(id),
    condition_type upgrade_condition_type NOT NULL,
    condition_value INTEGER NOT NULL,
    period_days INTEGER NOT NULL DEFAULT 90,
    cooldown_days INTEGER NOT NULL DEFAULT 30,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tier Change Logs table (tracks both upgrades and downgrades)
CREATE TABLE IF NOT EXISTS tier_change_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    from_tier_id UUID NOT NULL REFERENCES customer_tiers(id),
    to_tier_id UUID NOT NULL REFERENCES customer_tiers(id),
    change_type tier_change_type DEFAULT 'downgrade',
    rule_id UUID, -- references either tier_downgrade_rules or tier_upgrade_rules
    reason TEXT,
    executed_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tier_upgrade_rules_tenant ON tier_upgrade_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tier_upgrade_rules_from_tier ON tier_upgrade_rules(from_tier_id);
CREATE INDEX IF NOT EXISTS idx_tier_change_logs_customer ON tier_change_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_tier_change_logs_rule ON tier_change_logs(rule_id);
CREATE INDEX IF NOT EXISTS idx_tier_change_logs_tenant_executed ON tier_change_logs(tenant_id, executed_at);
CREATE INDEX IF NOT EXISTS idx_tier_change_logs_change_type ON tier_change_logs(change_type);
