/**
 * Logger utility with environment-based log levels
 * 
 * Usage:
 *   import { logger } from '../helpers/logger'
 *   logger.debug('Debug message', { data })
 *   logger.info('Info message')
 *   logger.warn('Warning message')
 *   logger.error('Error message', error)
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none'

interface LoggerConfig {
  level: LogLevel
  enableConsole: boolean
}

class Logger {
  private config: LoggerConfig

  constructor() {
    // Default: production mode (only errors)
    this.config = {
      level: this.getLogLevel(),
      enableConsole: this.shouldEnableConsole()
    }
  }

  private getLogLevel(): LogLevel {
    // Check environment variable (set via wrangler.jsonc or .dev.vars)
    if (typeof process !== 'undefined' && process.env) {
      const envLevel = process.env.LOG_LEVEL?.toLowerCase()
      if (envLevel === 'debug' || envLevel === 'info' || envLevel === 'warn' || envLevel === 'error' || envLevel === 'none') {
        return envLevel
      }
    }
    
    // Default to 'error' in production, 'debug' in development
    return 'error'
  }

  private shouldEnableConsole(): boolean {
    // Disable console in production unless explicitly enabled
    if (typeof process !== 'undefined' && process.env) {
      return process.env.ENABLE_CONSOLE_LOGS === 'true'
    }
    return false
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enableConsole) {
      return false
    }

    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'none']
    const currentLevelIndex = levels.indexOf(this.config.level)
    const messageLevelIndex = levels.indexOf(level)
    
    return messageLevelIndex >= currentLevelIndex
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.debug(`[DEBUG] ${message}`, ...args)
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.info(`[INFO] ${message}`, ...args)
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, ...args)
    }
  }

  error(message: string, error?: any, ...args: any[]): void {
    if (this.shouldLog('error')) {
      if (error instanceof Error) {
        console.error(`[ERROR] ${message}`, {
          message: error.message,
          stack: error.stack,
          ...args
        })
      } else {
        console.error(`[ERROR] ${message}`, error, ...args)
      }
    }
  }

  // For sensitive data that should never be logged in production
  debugSensitive(message: string, data: any): void {
    if (this.shouldLog('debug')) {
      console.debug(`[DEBUG-SENSITIVE] ${message}`, this.sanitize(data))
    }
  }

  private sanitize(data: any): any {
    if (typeof data === 'object' && data !== null) {
      const sanitized: any = Array.isArray(data) ? [] : {}
      for (const key in data) {
        const lowerKey = key.toLowerCase()
        // Redact sensitive fields
        if (lowerKey.includes('password') || lowerKey.includes('token') || lowerKey.includes('secret') || lowerKey.includes('key')) {
          sanitized[key] = '[REDACTED]'
        } else if (typeof data[key] === 'object') {
          sanitized[key] = this.sanitize(data[key])
        } else {
          sanitized[key] = data[key]
        }
      }
      return sanitized
    }
    return data
  }
}

// Singleton instance
export const logger = new Logger()

// Client-side logger (for browser JavaScript)
export const clientLogger = {
  debug: (message: string, ...args: any[]) => {
    // Only log in development (check if URL contains localhost or has debug flag)
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.search.includes('debug=true'))) {
      console.debug(`[CLIENT-DEBUG] ${message}`, ...args)
    }
  },
  info: (message: string, ...args: any[]) => {
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.search.includes('debug=true'))) {
      console.info(`[CLIENT-INFO] ${message}`, ...args)
    }
  },
  warn: (message: string, ...args: any[]) => {
    if (typeof window !== 'undefined') {
      console.warn(`[CLIENT-WARN] ${message}`, ...args)
    }
  },
  error: (message: string, error?: any) => {
    if (typeof window !== 'undefined') {
      console.error(`[CLIENT-ERROR] ${message}`, error)
    }
  }
}
