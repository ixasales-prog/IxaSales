import { db } from '../db';
import { sql } from 'drizzle-orm';
import os from 'os';

export async function getSystemHealth() {
    const start = performance.now();
    let dbStatus = 'disconnected';
    let dbLatency = 0;

    try {
        await db.execute(sql`SELECT 1`);
        dbStatus = 'connected';
        dbLatency = Math.round(performance.now() - start);
    } catch (e) {
        dbStatus = 'error';
    }

    const memoryUsage = process.memoryUsage();

    return {
        status: dbStatus === 'connected' ? 'healthy' : 'degraded',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: {
            status: dbStatus,
            latencyMs: dbLatency
        },
        memory: {
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
            heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
            rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
        },
        system: {
            platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus().length,
            freeMem: Math.round(os.freemem() / 1024 / 1024), // MB
            totalMem: Math.round(os.totalmem() / 1024 / 1024), // MB
        }
    };
}
