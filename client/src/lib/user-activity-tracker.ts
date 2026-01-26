// ⚠️ BETA IMPLEMENTATION - Production-ready for initial rollout
// Requires monitoring under real load conditions
// Event volumes and query performance should be validated in production

import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';

// Activity tracking configuration with volume control
const ACTIVITY_CONFIG = {
  IDLE_TIMEOUT: 5 * 60 * 1000, // 5 minutes
  HEARTBEAT_INTERVAL: 30 * 1000, // 30 seconds
  BATCH_INTERVAL: 15 * 1000, // 15 seconds (reduced frequency)
  MAX_BATCH_SIZE: 100, // Increased but capped
  
  // Event deduplication
  ROUTE_CHANGE_DEBOUNCE: 1000, // 1 second
  SCROLL_THROTTLE: 500, // 500ms
  TYPING_DEBOUNCE: 1000, // 1 second
  
  // Volume limits
  MAX_EVENTS_PER_HOUR: 1000,
  MAX_EVENTS_PER_SESSION: 5000,
  
  // Event filtering
  IGNORED_EVENTS: [
    'mousemove',
    'scroll', // Will be throttled instead
    'pointermove'
  ],
  
  // Sensitive data protection
  SENSITIVE_INPUT_TYPES: [
    'password',
    'credit-card',
    'ssn'
  ],
  
  // Observability settings
  HEALTH_REPORT_INTERVAL: 60 * 1000, // 1 minute
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY_BASE: 1000 // 1 second base delay
};

// Activity event types
export type ActivityEventType = 
  | 'page_visit'
  | 'user_action'
  | 'form_interaction'
  | 'search_query'
  | 'idle_start'
  | 'idle_end'
  | 'session_start'
  | 'session_end'
  | 'page_hidden'
  | 'page_visible'
  | 'route_change';

// Activity event structure
export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  timestamp: Date;
  url: string;
  title: string;
  userId?: string;
  tenantId?: string;
  metadata?: Record<string, any>;
  sessionId: string;
}

// Session information
interface UserSession {
  id: string;
  startTime: Date;
  lastActivity: Date;
  isActive: boolean;
  pageVisits: number;
  actionsCount: number;
  idleTime: number;
}

// Activity tracker store
const [store, setStore] = createStore({
  currentSession: null as UserSession | null,
  activityEvents: [] as ActivityEvent[],
  isIdle: false,
  lastActivityTime: Date.now()
});

// Signal for reactive updates
const [isTracking, setIsTracking] = createSignal(false);

export class UserActivityTracker {
  private heartbeatInterval: number | null = null;
  private batchInterval: number | null = null;
  private idleTimeout: number | null = null;
  private healthReportInterval: number | null = null;
  
  // Kill switch check - reads from Vite environment variables
  private isTrackingEnabled(): boolean {
    // Check environment variable from Vite build process
    const killSwitch = import.meta.env.VITE_USER_ACTIVITY_TRACKING === 'false';
    return !killSwitch;
  }
  
  // Event volume control
  private eventCounter: Map<string, number> = new Map();
  private lastEventTimes: Map<string, number> = new Map();
  private throttledEvents: Map<string, number> = new Map();
  
  // Health analytics
  private healthMetrics = {
    droppedEvents: 0,
    successfulRetries: 0,
    failedRetries: 0,
    totalBatchesSent: 0,
    totalEventsProcessed: 0,
    averageBatchSize: 0,
    serverRejectionReasons: new Map<string, number>(),
    lastHealthReport: Date.now()
  };
  
  // Retry management
  private pendingRetries: Map<string, { attempts: number, events: ActivityEvent[] }> = new Map();

  constructor() {
    this.initializeSession();
  }

  private initializeSession() {
    const sessionId = this.generateSessionId();
    setStore('currentSession', {
      id: sessionId,
      startTime: new Date(),
      lastActivity: new Date(),
      isActive: true,
      pageVisits: 0,
      actionsCount: 0,
      idleTime: 0
    });
    
    this.trackEvent('session_start', {
      userAgent: navigator.userAgent,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  public startTracking() {
    if (isTracking()) return;
    
    // Check kill switch
    if (!this.isTrackingEnabled()) {
      console.log('🎯 User activity tracking disabled by kill switch');
      return;
    }

    setIsTracking(true);
    
    // Setup intervals
    this.setupHeartbeat();
    this.setupBatchProcessing();
    this.setupHealthReporting();
    this.setupActivityListeners();
    
    // Initial page visit
    this.trackPageVisit();
    
    console.log('🎯 User activity tracking started');
  }

  public stopTracking() {
    if (!isTracking()) return;

    setIsTracking(false);
    
    // Cleanup intervals
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.batchInterval) clearInterval(this.batchInterval);
    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    if (this.healthReportInterval) clearInterval(this.healthReportInterval);
    
    // Remove event listeners
    this.removeActivityListeners();
    
    // Final health report
    this.reportHealthMetrics();
    
    // End session
    this.trackEvent('session_end');
  }

  private setupHeartbeat() {
    this.heartbeatInterval = window.setInterval(() => {
      if (!store.isIdle) {
        this.updateLastActivity();
      }
    }, ACTIVITY_CONFIG.HEARTBEAT_INTERVAL);
  }

  private setupBatchProcessing() {
    this.batchInterval = window.setInterval(() => {
      this.processBatch();
    }, ACTIVITY_CONFIG.BATCH_INTERVAL);
  }

  private setupHealthReporting() {
    this.healthReportInterval = window.setInterval(() => {
      this.reportHealthMetrics();
    }, ACTIVITY_CONFIG.HEALTH_REPORT_INTERVAL);
  }

  private reportHealthMetrics() {
    const now = Date.now();
    
    // Calculate average batch size
    if (this.healthMetrics.totalBatchesSent > 0) {
      this.healthMetrics.averageBatchSize = 
        Math.round(this.healthMetrics.totalEventsProcessed / this.healthMetrics.totalBatchesSent);
    }
    
    // Report to console in development
    if (typeof window !== 'undefined' && (window as any).ENV?.NODE_ENV === 'development') {
      console.group('📊 User Activity Tracker Health Report');
      console.log('Dropped Events:', this.healthMetrics.droppedEvents);
      console.log('Successful Retries:', this.healthMetrics.successfulRetries);
      console.log('Failed Retries:', this.healthMetrics.failedRetries);
      console.log('Average Batch Size:', this.healthMetrics.averageBatchSize);
      console.log('Total Events Processed:', this.healthMetrics.totalEventsProcessed);
      console.log('Server Rejection Reasons:', Object.fromEntries(this.healthMetrics.serverRejectionReasons));
      console.groupEnd();
    }
    
    // Could also send to monitoring service
    this.healthMetrics.lastHealthReport = now;
  }

  private setupActivityListeners() {
    // Mouse movements
    document.addEventListener('mousemove', this.handleUserActivity.bind(this));
    document.addEventListener('mousedown', this.handleUserActivity.bind(this));
    
    // Keyboard input
    document.addEventListener('keydown', this.handleUserActivity.bind(this));
    
    // Touch events
    document.addEventListener('touchstart', this.handleUserActivity.bind(this));
    document.addEventListener('touchmove', this.handleUserActivity.bind(this));
    
    // Scroll events
    document.addEventListener('scroll', this.handleUserActivity.bind(this));
    
    // Visibility change (tab switching)
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    
    // Before unload (page close/navigation)
    window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));
  }

  private removeActivityListeners() {
    document.removeEventListener('mousemove', this.handleUserActivity.bind(this));
    document.removeEventListener('mousedown', this.handleUserActivity.bind(this));
    document.removeEventListener('keydown', this.handleUserActivity.bind(this));
    document.removeEventListener('touchstart', this.handleUserActivity.bind(this));
    document.removeEventListener('touchmove', this.handleUserActivity.bind(this));
    document.removeEventListener('scroll', this.handleUserActivity.bind(this));
    document.removeEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    window.removeEventListener('beforeunload', this.handleBeforeUnload.bind(this));
  }

  private handleUserActivity() {
    // Check hourly limits
    if (this.shouldLimitEvents()) {
      return;
    }
    
    this.updateLastActivity();
    
    if (store.isIdle) {
      this.endIdlePeriod();
    }
  }

  private shouldLimitEvents(): boolean {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    // Clean up old counters
    this.cleanupOldEvents(oneHourAgo);
    
    // Check hourly limit
    const hourlyCount = Array.from(this.eventCounter.values())
      .reduce((sum, count) => sum + count, 0);
    
    if (hourlyCount >= ACTIVITY_CONFIG.MAX_EVENTS_PER_HOUR) {
      return true;
    }
    
    return false;
  }

  private cleanupOldEvents(cutoffTime: number) {
    for (const [eventType, lastTime] of this.lastEventTimes.entries()) {
      if (lastTime < cutoffTime) {
        this.eventCounter.delete(eventType);
        this.lastEventTimes.delete(eventType);
      }
    }
  }

  private shouldTrackEvent(eventType: string, key?: string): boolean {
    const now = Date.now();
    const eventKey = key || eventType;
    
    // Check if event type should be ignored
    if (ACTIVITY_CONFIG.IGNORED_EVENTS.includes(eventType)) {
      return false;
    }
    
    // Throttling for high-frequency events
    if (eventType === 'scroll') {
      const lastScroll = this.throttledEvents.get('scroll') || 0;
      if (now - lastScroll < ACTIVITY_CONFIG.SCROLL_THROTTLE) {
        return false;
      }
      this.throttledEvents.set('scroll', now);
    }
    
    // Debouncing for route changes
    if (eventType === 'route_change') {
      const lastRouteChange = this.lastEventTimes.get('route_change') || 0;
      if (now - lastRouteChange < ACTIVITY_CONFIG.ROUTE_CHANGE_DEBOUNCE) {
        return false;
      }
    }
    
    // Update counters
    const currentCount = this.eventCounter.get(eventKey) || 0;
    if (currentCount >= ACTIVITY_CONFIG.MAX_EVENTS_PER_SESSION) {
      return false;
    }
    
    this.eventCounter.set(eventKey, currentCount + 1);
    this.lastEventTimes.set(eventKey, now);
    
    return true;
  }

  private handleVisibilityChange() {
    if (document.hidden) {
      this.trackEvent('page_hidden');
    } else {
      this.trackEvent('page_visible');
      this.updateLastActivity();
    }
  }

  private handleBeforeUnload() {
    this.stopTracking();
  }

  private updateLastActivity() {
    const now = Date.now();
    setStore('lastActivityTime', now);
    
    if (store.currentSession) {
      setStore('currentSession', 'lastActivity', new Date());
      setStore('currentSession', 'actionsCount', store.currentSession.actionsCount + 1);
    }
    
    // Reset idle timeout
    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    this.idleTimeout = window.setTimeout(() => {
      this.startIdlePeriod();
    }, ACTIVITY_CONFIG.IDLE_TIMEOUT);
  }

  private startIdlePeriod() {
    if (!store.isIdle) {
      setStore('isIdle', true);
      this.trackEvent('idle_start');
    }
  }

  private endIdlePeriod() {
    if (store.isIdle) {
      setStore('isIdle', false);
      this.trackEvent('idle_end');
    }
  }

  public trackPageVisit(url?: string, title?: string) {
    if (!this.shouldTrackEvent('page_visit', url)) {
      return;
    }
    
    const eventData = {
      url: url || window.location.href,
      title: title || document.title,
      referrer: document.referrer
    };
    
    this.trackEvent('page_visit', eventData);
    
    if (store.currentSession) {
      setStore('currentSession', 'pageVisits', store.currentSession.pageVisits + 1);
    }
  }

  public trackUserAction(action: string, metadata?: Record<string, any>) {
    this.trackEvent('user_action', {
      action,
      ...metadata
    });
  }

  public trackFormInteraction(formName: string, fieldName: string, eventType: string, element?: HTMLInputElement) {
    // Skip sensitive data
    if (element && ACTIVITY_CONFIG.SENSITIVE_INPUT_TYPES.includes(element.type)) {
      return;
    }
    
    // Skip if event should be throttled
    const eventKey = `${formName}:${fieldName}:${eventType}`;
    if (!this.shouldTrackEvent('form_interaction', eventKey)) {
      return;
    }
    
    this.trackEvent('form_interaction', {
      formName,
      fieldName,
      eventType // focus, blur, change, submit
    });
  }

  public trackSearchQuery(query: string, resultsCount?: number) {
    this.trackEvent('search_query', {
      query,
      resultsCount
    });
  }

  private trackEvent(type: ActivityEventType, metadata?: Record<string, any>) {
    const event: ActivityEvent = {
      id: this.generateEventId(),
      type,
      timestamp: new Date(),
      url: window.location.href,
      title: document.title,
      sessionId: store.currentSession?.id || '',
      metadata
    };

    // Add to batch
    setStore('activityEvents', [...store.activityEvents, event]);

    // Send immediately for critical events
    if (['session_start', 'session_end', 'idle_start', 'idle_end'].includes(type)) {
      this.sendEvents([event]);
    }
  }

  private processBatch() {
    if (store.activityEvents.length === 0) return;

    const eventsToSend = store.activityEvents.slice(0, ACTIVITY_CONFIG.MAX_BATCH_SIZE);
    const remainingEvents = store.activityEvents.slice(ACTIVITY_CONFIG.MAX_BATCH_SIZE);

    setStore('activityEvents', remainingEvents);
    this.sendEvents(eventsToSend);
  }

  private async sendEvents(events: ActivityEvent[], isRetry: boolean = false) {
    try {
      this.healthMetrics.totalBatchesSent++;
      this.healthMetrics.totalEventsProcessed += events.length;
      
      const response = await fetch('/api/user-activity/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ events })
      });

      if (!response.ok) {
        const errorText = await response.text();
        const reason = `HTTP ${response.status}: ${errorText.substring(0, 100)}`;
        
        // Track server rejection reasons
        const currentCount = this.healthMetrics.serverRejectionReasons.get(reason) || 0;
        this.healthMetrics.serverRejectionReasons.set(reason, currentCount + 1);
        
        console.warn('Failed to send activity events:', reason);
        
        // Handle retry logic
        if (!isRetry && response.status >= 500) {
          this.scheduleRetry(events);
        } else {
          // Permanent failure - drop events but track metrics
          this.healthMetrics.droppedEvents += events.length;
        }
      } else {
        // Success
        if (isRetry) {
          this.healthMetrics.successfulRetries++;
          // Remove from pending retries
          const batchKey = events.map(e => e.id).join(',');
          this.pendingRetries.delete(batchKey);
        }
      }
    } catch (error) {
      console.warn('Network error sending activity events:', error);
      
      // Handle retry logic for network errors
      if (!isRetry) {
        this.scheduleRetry(events);
      } else {
        this.healthMetrics.failedRetries++;
        this.healthMetrics.droppedEvents += events.length;
      }
    }
  }

  private scheduleRetry(events: ActivityEvent[]) {
    const batchKey = events.map(e => e.id).join(',');
    const retryInfo = this.pendingRetries.get(batchKey) || { attempts: 0, events };
    
    if (retryInfo.attempts < ACTIVITY_CONFIG.MAX_RETRY_ATTEMPTS) {
      retryInfo.attempts++;
      this.pendingRetries.set(batchKey, retryInfo);
      
      const delay = ACTIVITY_CONFIG.RETRY_DELAY_BASE * Math.pow(2, retryInfo.attempts - 1);
      setTimeout(() => {
        this.sendEvents(events, true);
      }, delay);
    } else {
      // Max retries exceeded - drop events
      this.healthMetrics.droppedEvents += events.length;
      this.pendingRetries.delete(batchKey);
    }
  }

  // Get current tracking state
  public getState() {
    return {
      isTracking: isTracking(),
      isIdle: store.isIdle,
      session: store.currentSession,
      pendingEvents: store.activityEvents.length,
      isEnabled: this.isTrackingEnabled(),
      healthMetrics: { ...this.healthMetrics }
    };
  }

  // Public method to check if tracking is enabled
  public isCurrentlyEnabled(): boolean {
    return this.isTrackingEnabled();
  }

  // Manual session reset (for logout scenarios)
  public resetSession() {
    this.stopTracking();
    setStore('activityEvents', []);
    setStore('isIdle', false);
    this.initializeSession();
    this.startTracking();
  }
}

// Singleton instance
export const userActivityTracker = new UserActivityTracker();

// Auto-start tracking when module loads
if (typeof window !== 'undefined') {
  userActivityTracker.startTracking();
}

// Cleanup on module unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    userActivityTracker.stopTracking();
  });
}

export default userActivityTracker;