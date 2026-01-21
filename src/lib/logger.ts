/**
 * Structured Logger
 * 
 * Provides consistent logging across the application.
 * Use logger.info/debug/warn/error instead of console.log.
 * 
 * In production, debug logs are suppressed unless LOG_LEVEL=debug.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

// Default to 'info' in production, 'debug' in development
const currentLogLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) ||
    (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

interface Logger {
    debug: (msg: string, data?: Record<string, any>) => void;
    info: (msg: string, data?: Record<string, any>) => void;
    warn: (msg: string, data?: Record<string, any>) => void;
    error: (msg: string, data?: Record<string, any>) => void;
}

/**
 * Create a logger with a specific prefix
 */
export function createLogger(prefix: string): Logger {
    const shouldLog = (level: LogLevel): boolean => {
        return LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel];
    };

    const log = (level: LogLevel, message: string, data?: Record<string, any>) => {
        if (!shouldLog(level)) return;

        const timestamp = new Date().toISOString();
        const logPrefix = `[${timestamp}] [${prefix}] [${level.toUpperCase()}]`;
        const logData = data ? ` ${JSON.stringify(data)}` : '';

        if (level === 'error') {
            console.error(`${logPrefix} ${message}${logData}`);
        } else if (level === 'warn') {
            console.warn(`${logPrefix} ${message}${logData}`);
        } else {
            console.log(`${logPrefix} ${message}${logData}`);
        }
    };

    return {
        debug: (msg, data) => log('debug', msg, data),
        info: (msg, data) => log('info', msg, data),
        warn: (msg, data) => log('warn', msg, data),
        error: (msg, data) => log('error', msg, data),
    };
}

// Default loggers for common modules
export const customerPortalLogger = createLogger('CustomerPortal');
export const ordersLogger = createLogger('Orders');
export const telegramLogger = createLogger('Telegram');
export const authLogger = createLogger('Auth');
export const paymentLogger = createLogger('Payment');
export const backupLogger = createLogger('Backup');
export const cleanupLogger = createLogger('Cleanup');
export const schedulerLogger = createLogger('Scheduler');

// Default logger for general use
export const logger = createLogger('App');


