import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

async function main() {
    // Set proper sort orders: higher number = higher tier
    await sql.unsafe("UPDATE customer_tiers SET sort_order = 2 WHERE name = 'VIP'");
    await sql.unsafe("UPDATE customer_tiers SET sort_order = 1 WHERE name = 'Gold'");

    const result = await sql.unsafe('SELECT id, name, sort_order FROM customer_tiers ORDER BY sort_order');
    console.log('Updated tiers:');
    console.log(JSON.stringify(result, null, 2));

    await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
