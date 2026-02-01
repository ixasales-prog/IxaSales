import { eq } from 'drizzle-orm';
import { db, schema } from '../db';

export interface TenantDayRange {
    timezone: string;
    startOfDay: Date;
    endOfDay: Date;
    todayStr: string;
}

export const getTenantDayRange = async (tenantId: string, now: Date = new Date()): Promise<TenantDayRange> => {
    const [tenant] = await db
        .select({ timezone: schema.tenants.timezone })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);

    const timezone = tenant?.timezone || 'Asia/Tashkent';
    let startOfDay: Date;

    try {
        const dayFormatter = new Intl.DateTimeFormat('en-CA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            timeZone: timezone,
        });
        const localDateStr = dayFormatter.format(now);
        startOfDay = new Date(`${localDateStr}T00:00:00`);

        const offsetFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            timeZoneName: 'shortOffset',
        });
        const offsetMatch = offsetFormatter.format(now).match(/GMT([+-]\d+)/);
        if (offsetMatch) {
            const offsetHours = parseInt(offsetMatch[1]);
            startOfDay = new Date(startOfDay.getTime() - offsetHours * 60 * 60 * 1000);
        }
    } catch {
        startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
    }

    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const todayStr = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: timezone,
    }).format(now);

    return { timezone, startOfDay, endOfDay, todayStr };
};
