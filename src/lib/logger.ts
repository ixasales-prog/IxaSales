/**
 * Structured Logging Utility
 * Provides consistent logging with levels and structured data
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, any>;
  error?: Error;
}

class Logger {
  private minLevel: LogLevel;
  private context: Record<string, any>;

  constructor(minLevel: LogLevel = LogLevel.INFO) {
    this.minLevel = minLevel;
    this.context = {};
  }

  /**
   * Set default context for all logs
   */
  setContext(context: Record<string, any>) {
    this.context = { ...this.context, ...context };
  }

  /**
   * Clear context
   */
  clearContext() {
    this.context = {};
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: Record<string, any>) {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, any>) {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, any>) {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error, context?: Record<string, any>) {
    this.log(LogLevel.ERROR, message, { ...context, error: this.formatError(error) });
  }

  /**
   * Internal log method
   */
  private log(level: LogLevel, message: string, context?: Record<string, any>) {
    if (level < this.minLevel) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: { ...this.context, ...context },
    };

    const formatted = this.formatLog(entry);
    
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formatted);
        break;
      case LogLevel.INFO:
        console.info(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.ERROR:
        console.error(formatted);
        break;
    }
  }

  /**
   * Format log entry for output
   */
  private formatLog(entry: LogEntry): string {
    const levelName = LogLevel[entry.level];
    const contextStr = entry.context && Object.keys(entry.context).length > 0
      ? ` ${JSON.stringify(entry.context)}`
      : '';

    return `[${entry.timestamp}] [${levelName}] ${entry.message}${contextStr}`;
  }

  /**
   * Format error for logging
   */
  private formatError(error?: Error): Record<string, any> | undefined {
    if (!error) return undefined;

    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, any>): Logger {
    const childLogger = new Logger(this.minLevel);
    childLogger.setContext({ ...this.context, ...context });
    return childLogger;
  }
}

// Create default logger instance
export const logger = new Logger(
  process.env.LOG_LEVEL === 'debug' ? LogLevel.DEBUG :
  process.env.LOG_LEVEL === 'warn' ? LogLevel.WARN :
  process.env.LOG_LEVEL === 'error' ? LogLevel.ERROR :
  LogLevel.INFO
);

// Payroll-specific logger with context
export const payrollLogger = logger.child({ module: 'payroll' });

// Auth-specific logger with context
export const authLogger = logger.child({ module: 'auth' });

// Customer Portal logger with context
export const customerPortalLogger = logger.child({ module: 'customer-portal' });

/**
 * Create a logger for a specific service
 */
export function createServiceLogger(serviceName: string): Logger {
  return logger.child({ service: serviceName });
}

/**
 * Log payroll operation
 */
export function logPayrollOperation(
  operation: string,
  details: Record<string, any>,
  level: LogLevel = LogLevel.INFO
) {
  const logContext = {
    operation,
    ...details,
  };

  switch (level) {
    case LogLevel.DEBUG:
      payrollLogger.debug(`Payroll operation: ${operation}`, logContext);
      break;
    case LogLevel.INFO:
      payrollLogger.info(`Payroll operation: ${operation}`, logContext);
      break;
    case LogLevel.WARN:
      payrollLogger.warn(`Payroll operation: ${operation}`, logContext);
      break;
    case LogLevel.ERROR:
      payrollLogger.error(`Payroll operation: ${operation}`, undefined, logContext);
      break;
  }
}
