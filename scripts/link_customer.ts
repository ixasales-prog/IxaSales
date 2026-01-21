import { db } from '../src/db';
import * as schema from '../src/db/schema';
import { eq } from 'drizzle-orm';

const customerId = '9eb86860-2080-425f-9ee1-f08aaf9d1900'; // ilhom ramazonov
const chatId = '112562253';

async function main() {
    console.log('Linking customer "ilhom ramazonov" to Telegram...');

    await db
        .update(schema.customers)
        .set({
            telegramChatId: chatId,
            updatedAt: new Date(),
        })
        .where(eq(schema.customers.id, customerId));

    console.log('✅ Successfully linked ilhom ramazonov to Telegram chat ID:', chatId);

    // Verify
    const [customer] = await db
        .select({
            name: schema.customers.name,
            phone: schema.customers.phone,
            telegramChatId: schema.customers.telegramChatId,
        })
        .from(schema.customers)
        .where(eq(schema.customers.id, customerId));

    console.log('Customer updated:', customer);

    process.exit(0);
}

main().catch(console.error);
