import { db } from '../src/db';
import * as schema from '../src/db/schema';
import { eq, and, or, sql } from 'drizzle-orm';

const tenantId = '8506ea17-aa25-46bf-beca-649e0780faef';
const phone = '+998976309599';
const chatId = '112562253';

async function main() {
    console.log('Searching for customer with phone:', phone);

    // Search for customer
    const phoneVariants = [
        phone,
        phone.replace('+', ''),
        phone.replace(/^\+998/, ''),
    ];

    console.log('Phone variants:', phoneVariants);

    const customers = await db
        .select({
            id: schema.customers.id,
            name: schema.customers.name,
            phone: schema.customers.phone,
            telegramChatId: schema.customers.telegramChatId,
        })
        .from(schema.customers)
        .where(and(
            eq(schema.customers.tenantId, tenantId),
            or(
                sql`${schema.customers.phone} IN (${sql.join(phoneVariants.map(p => sql`${p}`), sql`, `)})`,
                sql`REPLACE(${schema.customers.phone}, '+', '') = ${phone.replace('+', '')}`
            )
        ))
        .limit(5);

    console.log('Found customers:', customers);

    if (customers.length === 0) {
        console.log('\n❌ No customer found with this phone number.');
        console.log('Listing all customers in tenant...');

        const allCustomers = await db
            .select({
                id: schema.customers.id,
                name: schema.customers.name,
                phone: schema.customers.phone,
            })
            .from(schema.customers)
            .where(eq(schema.customers.tenantId, tenantId))
            .limit(10);

        console.log('Customers in this tenant:', allCustomers);
    } else {
        const customer = customers[0];
        console.log('\n✅ Found customer:', customer.name);

        if (customer.telegramChatId === chatId) {
            console.log('Already linked to this Telegram!');
        } else {
            console.log('Linking customer to Telegram chat ID:', chatId);

            await db
                .update(schema.customers)
                .set({
                    telegramChatId: chatId,
                    updatedAt: new Date(),
                })
                .where(eq(schema.customers.id, customer.id));

            console.log('✅ Successfully linked!');
        }
    }

    process.exit(0);
}

main().catch(console.error);
