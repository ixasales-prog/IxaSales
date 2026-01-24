/**
 * User Session Cleanup Job
 * 
 * Automatically ends stale user sessions and cleans up old activity data.
 * Runs periodically to maintain data hygiene and prevent ghost sessions.
 */

import { db } from '../db';
import { userSessions, userActivityEvents } from '../db/schema/users';
import { eq, and, lt, sql } from 'drizzle-orm';
import { CronJob } from 'cron';

// Configuration
const CONFIG = {
  // Session timeout - automatically end sessions after inactivity
  SESSION_INACTIVITY_TIMEOUT_MINUTES: 30,
  
  // Data retention - delete old activity events
  ACTIVITY_RETENTION_DAYS: 90,
  
  // Session cleanup - delete old ended sessions  
  SESSION_RETENTION_DAYS: 180,
  
  // Run every hour
  CRON_SCHEDULE: '0 * * * *'
};

let cleanupJob: CronJob | null = null;

export function initializeSessionCleanup() {
  if (cleanupJob) {
    console.log('[SessionCleanup] Job already running');
    return;
  }

  console.log('[SessionCleanup] Initializing session cleanup job');
  
  cleanupJob = new CronJob(CONFIG.CRON_SCHEDULE, async () => {
    try {
      console.log('[SessionCleanup] Running cleanup job...');
      
      // 1. End stale active sessions
      await endStaleSessions();
      
      // 2. Delete old activity events
      await deleteOldActivityEvents();
      
      // 3. Delete old ended sessions
      await deleteOldSessions();
      
      console.log('[SessionCleanup] Cleanup job completed successfully');
    } catch (error) {
      console.error('[SessionCleanup] Error during cleanup:', error);
    }
  });

  cleanupJob.start();
  console.log('[SessionCleanup] Job started successfully');
}

export function stopSessionCleanup() {
  if (cleanupJob) {
    cleanupJob.stop();
    cleanupJob = null;
    console.log('[SessionCleanup] Job stopped');
  }
}

async function endStaleSessions() {
  const cutoffTime = new Date(Date.now() - CONFIG.SESSION_INACTIVITY_TIMEOUT_MINUTES * 60 * 1000);
  
  // Find active sessions with no recent activity
  const staleSessions = await db
    .select({
      id: userSessions.id,
      userId: userSessions.userId,
      startedAt: userSessions.startedAt,
      lastActivity: userSessions.updatedAt
    })
    .from(userSessions)
    .where(and(
      eq(userSessions.isActive, true),
      lt(userSessions.updatedAt, cutoffTime)
    ));
  
  if (staleSessions.length === 0) {
    console.log('[SessionCleanup] No stale sessions found');
    return;
  }
  
  console.log(`[SessionCleanup] Ending ${staleSessions.length} stale sessions`);
  
  // End each stale session
  for (const session of staleSessions) {
    try {
      const durationMs = Date.now() - new Date(session.startedAt).getTime();
      const duration = `${Math.floor(durationMs / 1000)} seconds`;
      
      await db
        .update(userSessions)
        .set({
          isActive: false,
          endedAt: new Date(),
          duration,
          endedReason: 'timeout',
          updatedAt: new Date()
        })
        .where(eq(userSessions.id, session.id));
        
      console.log(`[SessionCleanup] Ended session ${session.id} for user ${session.userId} (duration: ${duration})`);
    } catch (error) {
      console.error(`[SessionCleanup] Failed to end session ${session.id}:`, error);
    }
  }
}

async function deleteOldActivityEvents() {
  const cutoffTime = new Date(Date.now() - CONFIG.ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  
  // Count events to be deleted
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(userActivityEvents)
    .where(lt(userActivityEvents.timestamp, cutoffTime));
  
  const count = Number(countResult?.count || 0);
  
  if (count === 0) {
    console.log('[SessionCleanup] No old activity events to delete');
    return;
  }
  
  console.log(`[SessionCleanup] Deleting ${count} activity events older than ${CONFIG.ACTIVITY_RETENTION_DAYS} days`);
  
  // Delete old events
  await db
    .delete(userActivityEvents)
    .where(lt(userActivityEvents.timestamp, cutoffTime));
    
  console.log(`[SessionCleanup] Deleted ${count} old activity events`);
}

async function deleteOldSessions() {
  const cutoffTime = new Date(Date.now() - CONFIG.SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  
  // Count sessions to be deleted
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(userSessions)
    .where(and(
      eq(userSessions.isActive, false),
      lt(userSessions.endedAt, cutoffTime)
    ));
  
  const count = Number(countResult?.count || 0);
  
  if (count === 0) {
    console.log('[SessionCleanup] No old sessions to delete');
    return;
  }
  
  console.log(`[SessionCleanup] Deleting ${count} sessions older than ${CONFIG.SESSION_RETENTION_DAYS} days`);
  
  // Delete old sessions (events will cascade delete due to foreign key)
  await db
    .delete(userSessions)
    .where(and(
      eq(userSessions.isActive, false),
      lt(userSessions.endedAt, cutoffTime)
    ));
    
  console.log(`[SessionCleanup] Deleted ${count} old sessions`);
}

// For manual testing
export async function runCleanupNow() {
  console.log('[SessionCleanup] Manual cleanup initiated');
  await endStaleSessions();
  await deleteOldActivityEvents();
  await deleteOldSessions();
  console.log('[SessionCleanup] Manual cleanup completed');
}