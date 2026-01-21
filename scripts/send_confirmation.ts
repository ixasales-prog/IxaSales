import { db } from '../src/db';
import * as schema from '../src/db/schema';
import { eq } from 'drizzle-orm';

const tenantId = '8506ea17-aa25-46bf-beca-649e0780faef';
const chatId = '112562253';
const customerName = 'ilhom ramazonov';

async function main() {
    // Get tenant bot token
    const [tenant] = await db
        .select({
            name: schema.tenants.name,
            telegramBotToken: schema.tenants.telegramBotToken,
        })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId));

    if (!tenant || !tenant.telegramBotToken) {
        console.error('No bot token found');
        process.exit(1);
    }

    // Send confirmation message
    const response = await fetch(
        `https://api.telegram.org/bot${tenant.telegramBotToken}/sendMessage`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: `✅ <b>Muvaffaqiyatli bog'landi!</b>\n\nXush kelibsiz, <b>${customerName}</b>!\n\nEndi siz quyidagi bildirishnomalarni olasiz:\n• Buyurtma tasdiqlandi\n• Yetkazib berish yangilanishlari\n• To'lov eslatmalari\n• To'lov tasdiqlandi\n\n${tenant.name} bilan bog'langaningiz uchun rahmat! 🎉`,
                parse_mode: 'HTML',
            }),
        }
    );

    const result = await response.json();
    console.log('Message sent:', result.ok ? '✅ Success' : '❌ Failed');
    if (!result.ok) {
        console.log('Error:', result);
    }

    process.exit(0);
}

main().catch(console.error);
