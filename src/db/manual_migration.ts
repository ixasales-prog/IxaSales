import { db } from './index';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';

async function runMigration() {
    console.log('Starting manual migration...');

    const commands = [
        // Enum: payment_token_status
        sql`DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_token_status') THEN
                CREATE TYPE "public"."payment_token_status" AS ENUM('pending', 'paid', 'expired', 'cancelled');
            END IF;
        END $$;`,

        // Tables
        sql`CREATE TABLE IF NOT EXISTS "payment_tokens" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
            "tenant_id" uuid NOT NULL,
            "order_id" uuid NOT NULL,
            "customer_id" uuid NOT NULL,
            "token" varchar(64) NOT NULL,
            "amount" numeric(15, 2) NOT NULL,
            "currency" varchar(3) DEFAULT 'UZS',
            "status" "payment_token_status" DEFAULT 'pending',
            "expires_at" timestamp NOT NULL,
            "created_at" timestamp DEFAULT now(),
            "paid_at" timestamp,
            "paid_via" varchar(20),
            "provider_transaction_id" varchar(100),
            CONSTRAINT "payment_tokens_token_unique" UNIQUE("token")
        );`,

        sql`CREATE TABLE IF NOT EXISTS "shopping_carts" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
            "tenant_id" uuid NOT NULL,
            "customer_id" uuid NOT NULL,
            "updated_at" timestamp DEFAULT now(),
            CONSTRAINT "shopping_carts_customer_id_unique" UNIQUE("customer_id")
        );`,

        sql`CREATE TABLE IF NOT EXISTS "cart_items" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
            "cart_id" uuid NOT NULL,
            "product_id" uuid NOT NULL,
            "quantity" integer DEFAULT 1 NOT NULL,
            "created_at" timestamp DEFAULT now(),
            CONSTRAINT "cart_items_cart_id_product_id_unique" UNIQUE("cart_id","product_id")
        );`,

        sql`CREATE TABLE IF NOT EXISTS "customer_addresses" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
            "tenant_id" uuid NOT NULL,
            "customer_id" uuid NOT NULL,
            "name" varchar(100) NOT NULL,
            "address" text NOT NULL,
            "latitude" varchar(20),
            "longitude" varchar(20),
            "is_default" boolean DEFAULT false,
            "created_at" timestamp DEFAULT now(),
            "updated_at" timestamp DEFAULT now()
        );`,

        sql`CREATE TABLE IF NOT EXISTS "customer_favorites" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
            "tenant_id" uuid NOT NULL,
            "customer_id" uuid NOT NULL,
            "product_id" uuid NOT NULL,
            "created_at" timestamp DEFAULT now(),
            CONSTRAINT "customer_favorites_customer_id_product_id_unique" UNIQUE("customer_id","product_id")
        );`,

        // Columns
        sql`ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "telegram_bot_username" varchar(100);`,
        sql`ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "telegram_webhook_secret" varchar(100);`,
        sql`ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "payment_portal_enabled" boolean DEFAULT false;`,
        sql`ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "click_merchant_id" varchar(100);`,
        sql`ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "click_service_id" varchar(100);`,
        sql`ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "click_secret_key" varchar(255);`,
        sql`ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "payme_merchant_id" varchar(100);`,
        sql`ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "payme_secret_key" varchar(255);`,

        sql`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "otp_code" varchar(6);`,
        sql`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "otp_expires_at" timestamp;`,

        // Notification Columns
        sql`ALTER TABLE "tenant_notification_settings" ADD COLUMN IF NOT EXISTS "notify_order_approved" boolean DEFAULT true;`,
        sql`ALTER TABLE "tenant_notification_settings" ADD COLUMN IF NOT EXISTS "notify_order_cancelled" boolean DEFAULT true;`,
        sql`ALTER TABLE "tenant_notification_settings" ADD COLUMN IF NOT EXISTS "notify_order_delivered" boolean DEFAULT true;`,
        sql`ALTER TABLE "tenant_notification_settings" ADD COLUMN IF NOT EXISTS "notify_order_partial_delivery" boolean DEFAULT true;`,
        sql`ALTER TABLE "tenant_notification_settings" ADD COLUMN IF NOT EXISTS "notify_order_returned" boolean DEFAULT true;`,
        sql`ALTER TABLE "tenant_notification_settings" ADD COLUMN IF NOT EXISTS "notify_order_partial_return" boolean DEFAULT true;`,
        sql`ALTER TABLE "tenant_notification_settings" ADD COLUMN IF NOT EXISTS "notify_order_completed" boolean DEFAULT true;`,
        sql`ALTER TABLE "tenant_notification_settings" ADD COLUMN IF NOT EXISTS "notify_payment_partial" boolean DEFAULT true;`,
        sql`ALTER TABLE "tenant_notification_settings" ADD COLUMN IF NOT EXISTS "notify_payment_complete" boolean DEFAULT true;`,
        sql`ALTER TABLE "tenant_notification_settings" ADD COLUMN IF NOT EXISTS "customer_notify_order_confirmed" boolean DEFAULT true;`,
        sql`ALTER TABLE "tenant_notification_settings" ADD COLUMN IF NOT EXISTS "customer_notify_order_approved" boolean DEFAULT true;`,
        sql`ALTER TABLE "tenant_notification_settings" ADD COLUMN IF NOT EXISTS "customer_notify_order_cancelled" boolean DEFAULT true;`,
        sql`ALTER TABLE "tenant_notification_settings" ADD COLUMN IF NOT EXISTS "customer_notify_out_for_delivery" boolean DEFAULT true;`,
        sql`ALTER TABLE "tenant_notification_settings" ADD COLUMN IF NOT EXISTS "customer_notify_delivered" boolean DEFAULT true;`,
        sql`ALTER TABLE "tenant_notification_settings" ADD COLUMN IF NOT EXISTS "customer_notify_partial_delivery" boolean DEFAULT true;`,
        sql`ALTER TABLE "tenant_notification_settings" ADD COLUMN IF NOT EXISTS "customer_notify_returned" boolean DEFAULT false;`,
        sql`ALTER TABLE "tenant_notification_settings" ADD COLUMN IF NOT EXISTS "customer_notify_payment_received" boolean DEFAULT true;`,
        sql`ALTER TABLE "tenant_notification_settings" ADD COLUMN IF NOT EXISTS "customer_notify_payment_due" boolean DEFAULT true;`
    ];

    for (const cmd of commands) {
        try {
            await db.execute(cmd);
        } catch (e: any) {
            console.log(`Skipping command: ${e.message}`);
        }
    }

    console.log('Migration complete.');
    process.exit(0);
}

runMigration().catch(console.error);
