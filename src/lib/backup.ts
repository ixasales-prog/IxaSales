/**
 * Database Backup Service
 * 
 * Manages database backups using pg_dump.
 * Requires pg_dump to be available in PATH or specified via PG_DUMP_PATH.
 */

import { spawn } from 'child_process';
import { join } from 'path';
import { mkdir, readdir, stat, unlink } from 'fs/promises';
import { CronJob } from 'cron';
import { getBackupSettings } from './systemSettings';

// Default path if not in ENV
// We found it at this location during planning
const DEFAULT_PG_DUMP_PATH = 'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe';
const DEFAULT_PSQL_PATH = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
const BACKUP_DIR = join(process.cwd(), 'backups');

export interface BackupFile {
    filename: string;
    size: number;
    createdAt: Date;
    path: string;
}

// In-memory reference to running cron job
let backupJob: CronJob | null = null;

/**
 * Initialize backup system (ensure dir exists, start schedule)
 */
export async function initBackupService() {
    try {
        await mkdir(BACKUP_DIR, { recursive: true });
        runBackupSchedule();
        console.log('[Backup] Service initialized');
    } catch (err) {
        console.error('[Backup] Failed to init service:', err);
    }
}

/**
 * Create a new database backup
 */
export async function createBackup(): Promise<{ success: boolean; filename?: string; error?: string }> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.sql`;
    const filepath = join(BACKUP_DIR, filename);

    // Get database connection info from ENV
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        return { success: false, error: 'DATABASE_URL not set' };
    }

    // Determine pg_dump executable path
    const pgDumpPath = process.env.PG_DUMP_PATH || DEFAULT_PG_DUMP_PATH;

    console.log(`[Backup] Starting backup to ${filename}...`);

    return new Promise((resolve) => {
        // Spawn pg_dump process
        // Note: We use the connection string directly
        const proc = spawn(pgDumpPath, [dbUrl, '-f', filepath], {
            env: { ...process.env }, // Pass env to inherit PATH and vars
            shell: true // Required for windows path handling sometimes
        });

        proc.on('close', async (code) => {
            if (code === 0) {
                console.log('[Backup] Backup completed successfully');

                // Enforce retention policy after successful backup
                await cleanOldBackups();

                resolve({ success: true, filename });
            } else {
                console.error(`[Backup] pg_dump exited with code ${code}`);
                resolve({ success: false, error: `Process exited with code ${code}` });
            }
        });

        proc.on('error', (err) => {
            console.error('[Backup] Process error:', err);
            resolve({ success: false, error: err.message });
        });
    });
}

/**
 * List available backups
 */
export async function listBackups(): Promise<BackupFile[]> {
    try {
        const files = await readdir(BACKUP_DIR);
        const backups: BackupFile[] = [];

        for (const file of files) {
            if (!file.endsWith('.sql')) continue;

            const stats = await stat(join(BACKUP_DIR, file));
            backups.push({
                filename: file,
                size: stats.size,
                createdAt: stats.birthtime,
                path: join(BACKUP_DIR, file)
            });
        }

        // Sort by newest first
        return backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (err) {
        console.error('[Backup] Failed to list backups:', err);
        return [];
    }
}

/**
 * Get full path to a backup file
 */
export function getBackupPath(filename: string): string {
    // Basic security check to prevent directory traversal
    const safeFilename = filename.replace(/[\/\\]/g, '');
    return join(BACKUP_DIR, safeFilename);
}

export async function restoreBackup(filename: string): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!filename.endsWith('.sql')) {
        return { success: false, error: 'Only .sql backups can be restored' };
    }

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        return { success: false, error: 'DATABASE_URL not set' };
    }

    const filepath = getBackupPath(filename);
    let fileStat;
    try {
        fileStat = await stat(filepath);
    } catch {
        return { success: false, error: 'Backup file not found' };
    }

    if (fileStat.size === 0) {
        return { success: false, error: 'Backup file is empty' };
    }

    const psqlPath = process.env.PSQL_PATH || DEFAULT_PSQL_PATH;

    return new Promise((resolve) => {
        const proc = spawn(psqlPath, [dbUrl, '-f', filepath], {
            env: { ...process.env },
            shell: true
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve({ success: true, message: 'Restore completed successfully' });
            } else {
                resolve({ success: false, error: `Restore failed with code ${code}` });
            }
        });

        proc.on('error', (err) => {
            resolve({ success: false, error: err.message });
        });
    });
}

/**
 * Clean up old backups based on retention settings
 */
export async function cleanOldBackups() {
    const settings = getBackupSettings();
    const retentionDays = settings.retentionDays || 30; // Default 30 days

    // retentionDays = 0 means infinite retention
    if (retentionDays <= 0) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const backups = await listBackups();
    let deletedCount = 0;

    for (const backup of backups) {
        if (backup.createdAt < cutoffDate) {
            try {
                await unlink(backup.path);
                deletedCount++;
            } catch (err) {
                console.error(`[Backup] Failed to delete ${backup.filename}:`, err);
            }
        }
    }

    if (deletedCount > 0) {
        console.log(`[Backup] Cleaned up ${deletedCount} old backups`);
    }
}

/**
 * Start/Update the cron schedule
 */
export function runBackupSchedule() {
    const settings = getBackupSettings();

    // Stop existing job
    if (backupJob) {
        backupJob.stop();
        backupJob = null;
    }

    if (settings.frequency === 'never') {
        console.log('[Backup] Scheduled backups disabled');
        return;
    }

    // Convert frequency to cron expression
    let cronExpression = '';
    switch (settings.frequency) {
        case 'daily':
            cronExpression = '0 0 * * *'; // Every day at midnight
            break;
        case 'weekly':
            cronExpression = '0 0 * * 0'; // Every Sunday at midnight
            break;
        case 'monthly':
            cronExpression = '0 0 1 * *'; // 1st of every month
            break;
        default:
            return;
    }

    try {
        backupJob = new CronJob(cronExpression, async () => {
            console.log('[Backup] Running scheduled backup...');
            await createBackup();
        });

        backupJob.start();
        console.log(`[Backup] Schedule updated: ${settings.frequency} (${cronExpression})`);
    } catch (err) {
        console.error('[Backup] Failed to start schedule:', err);
    }
}
