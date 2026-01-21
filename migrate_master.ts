import { db } from './src/db';
import { sql } from 'drizzle-orm';

async function migrate() {
    console.log('Creating master_products table...');
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "master_products" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
            "sku" varchar(100) NOT NULL,
            "barcode" varchar(100),
            "name" varchar(255) NOT NULL,
            "description" text,
            "category" varchar(100),
            "image_url" varchar(500),
            "created_at" timestamp DEFAULT now(),
            "updated_at" timestamp DEFAULT now(),
            CONSTRAINT "master_products_sku_unique" UNIQUE("sku")
        );
    `);
    console.log('Done.');
    process.exit(0);
}

migrate();
