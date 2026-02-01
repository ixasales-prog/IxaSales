import { readdir, stat, unlink, rmdir } from 'fs/promises';
import { join } from 'path';
import { db, schema } from '../db';
import { eq, sql, and, lt } from 'drizzle-orm';
import { userSessions, userActivityEvents } from '../db/schema/users';

/**
 * Cleanup utility for orphaned upload files
 * Finds files in the uploads directory that are not referenced in the database
 * and deletes them if they are older than the specified age (default: 24 hours)
 */

interface CleanupResult {
    scanned: number;
    deleted: number;
    errors: string[];
    freedBytes: number;
}

async function getReferencedUrls(): Promise<Set<string>> {
    const urls = new Set<string>();

    // Get all product imageUrls
    const products = await db
        .select({ imageUrl: schema.products.imageUrl })
        .from(schema.products)
        .where(sql`${schema.products.imageUrl} IS NOT NULL`);

    products.forEach(p => {
        if (p.imageUrl) urls.add(p.imageUrl);
    });

    // Get all product gallery images
    const productImages = await db
        .select({
            url: schema.productImages.url,
            thumbnailUrl: schema.productImages.thumbnailUrl,
            mediumUrl: schema.productImages.mediumUrl
        })
        .from(schema.productImages);

    productImages.forEach(img => {
        if (img.url) urls.add(img.url);
        if (img.thumbnailUrl) urls.add(img.thumbnailUrl);
        if (img.mediumUrl) urls.add(img.mediumUrl);
    });

    // Get tenant logos if applicable
    const tenants = await db
        .select({ logo: schema.tenants.logo })
        .from(schema.tenants)
        .where(sql`${schema.tenants.logo} IS NOT NULL`);

    tenants.forEach(t => {
        if (t.logo) urls.add(t.logo);
    });

    return urls;
}

async function scanDirectory(dir: string, files: string[] = []): Promise<string[]> {
    try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                await scanDirectory(fullPath, files);
            } else if (entry.isFile()) {
                files.push(fullPath);
            }
        }
    } catch (err: any) {
        if (err.code !== 'ENOENT') {
            console.error(`Error scanning directory ${dir}:`, err.message);
        }
    }

    return files;
}

function filePathToUrl(filePath: string): string {
    // Convert "uploads/tenant-id/full/filename.webp" to "/uploads/tenant-id/full/filename.webp"
    return '/' + filePath.replace(/\\/g, '/');
}

export async function cleanupOrphanedFiles(maxAgeHours = 24): Promise<CleanupResult> {
    const result: CleanupResult = {
        scanned: 0,
        deleted: 0,
        errors: [],
        freedBytes: 0
    };

    const uploadsDir = 'uploads';
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    const now = Date.now();

    try {
        // Get all referenced URLs from database
        const referencedUrls = await getReferencedUrls();
        console.log(`Found ${referencedUrls.size} referenced URLs in database`);

        // Scan all files in uploads directory
        const files = await scanDirectory(uploadsDir);
        result.scanned = files.length;
        console.log(`Scanned ${files.length} files in uploads directory`);

        for (const filePath of files) {
            try {
                const fileUrl = filePathToUrl(filePath);

                // Check if file is referenced
                if (referencedUrls.has(fileUrl)) {
                    continue; // File is in use, skip
                }

                // Check file age
                const fileStat = await stat(filePath);
                const fileAge = now - fileStat.mtimeMs;

                if (fileAge < maxAgeMs) {
                    continue; // File is too new, might still be in use
                }

                // Delete orphaned file
                await unlink(filePath);
                result.deleted++;
                result.freedBytes += fileStat.size;
                console.log(`Deleted orphaned file: ${filePath} (${Math.round(fileStat.size / 1024)}KB)`);

            } catch (err: any) {
                result.errors.push(`Failed to process ${filePath}: ${err.message}`);
            }
        }

        // Try to remove empty directories
        await cleanupEmptyDirs(uploadsDir);

    } catch (err: any) {
        result.errors.push(`Cleanup failed: ${err.message}`);
    }

    console.log(`Cleanup complete: deleted ${result.deleted} files, freed ${Math.round(result.freedBytes / 1024)}KB`);
    return result;
}

async function cleanupEmptyDirs(dir: string): Promise<void> {
    try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const subDir = join(dir, entry.name);
                await cleanupEmptyDirs(subDir);

                // Try to remove if empty (will fail silently if not empty)
                try {
                    const subEntries = await readdir(subDir);
                    if (subEntries.length === 0) {
                        await rmdir(subDir);
                        console.log(`Removed empty directory: ${subDir}`);
                    }
                } catch {
                    // Directory not empty or other error, ignore
                }
            }
        }
    } catch {
        // Ignore errors
    }
}

// Cleanup user activity data based on retention policy
export async function cleanupUserActivityData() {
    const result = {
        sessionsDeleted: 0,
        eventsDeleted: 0,
        errors: [] as string[]
    };
    
    try {
        // Get tenant-specific retention setting (default to 90 days)
        const retentionDays = parseInt(process.env.USER_ACTIVITY_RETENTION_DAYS || '90');
        const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
        
        console.log(`Cleaning user activity data older than ${cutoffDate.toISOString()}`);
        
        // Count old activity events before deletion
        const [eventsCount] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(userActivityEvents)
            .where(lt(userActivityEvents.timestamp, cutoffDate));
        
        // Delete old activity events first (due to foreign key constraint)
        await db
            .delete(userActivityEvents)
            .where(lt(userActivityEvents.timestamp, cutoffDate));
        
        result.eventsDeleted = eventsCount.count;
        console.log(`Deleted ${result.eventsDeleted} old activity events`);
        
        // Count old sessions before deletion
        const [sessionsCount] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(userSessions)
            .where(and(
                lt(userSessions.endedAt, cutoffDate),
                sql`${userSessions.endedAt} IS NOT NULL`
            ));
        
        // Delete old sessions (ended sessions only)
        await db
            .delete(userSessions)
            .where(and(
                lt(userSessions.endedAt, cutoffDate),
                sql`${userSessions.endedAt} IS NOT NULL`
            ));
        
        result.sessionsDeleted = sessionsCount.count;
        console.log(`Deleted ${result.sessionsDeleted} old ended sessions`);
        
    } catch (err: any) {
        result.errors.push(`Failed to clean user activity data: ${err.message}`);
        console.error('Error cleaning user activity data:', err);
    }
    
    return result;
}

// Can be called via API route or scheduled job
export async function runCleanupJob() {
    console.log('Starting orphaned files cleanup...');
    const filesResult = await cleanupOrphanedFiles(24);
    
    console.log('Starting user activity data cleanup...');
    const activityResult = await cleanupUserActivityData();
    
    return {
        files: filesResult,
        userActivity: activityResult
    };
}
