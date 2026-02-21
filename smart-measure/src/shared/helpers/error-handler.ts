/**
 * Secure Error Handler for Production
 * 
 * This module provides safe error handling that:
 * - Prevents leaking sensitive information (stack traces, DB schemas, file paths)
 * - Logs full error details server-side for debugging
 * - Returns generic error messages to clients in production
 */
import { logger } from './logger'

export interface SafeErrorResponse {
  success: false;
  error: string;
  errorCode?: string;
}

/**
 * Determine if we're in development mode
 * In production, this should return false
 */
function isDevelopment(): boolean {
  // Check if we're in local development
  // In production (Cloudflare Pages), this should be false
  return typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
}

/**
 * Safe error codes for client communication
 */
export enum ErrorCode {
  // Generic errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  
  // Database errors
  DB_ERROR = 'DB_ERROR',
  DB_QUERY_FAILED = 'DB_QUERY_FAILED',
  
  // Resource errors
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_EXISTS = 'RESOURCE_EXISTS',
  
  // External API errors
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  
  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  MISSING_PARAMETER = 'MISSING_PARAMETER'
}

/**
 * Generic error messages that are safe to expose
 */
const SAFE_ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.INTERNAL_ERROR]: 'An internal error occurred. Please try again later.',
  [ErrorCode.INVALID_REQUEST]: 'Invalid request. Please check your input.',
  [ErrorCode.NOT_FOUND]: 'The requested resource was not found.',
  [ErrorCode.UNAUTHORIZED]: 'You are not authorized to perform this action.',
  [ErrorCode.DB_ERROR]: 'Database operation failed. Please try again.',
  [ErrorCode.DB_QUERY_FAILED]: 'Failed to retrieve data. Please try again.',
  [ErrorCode.RESOURCE_NOT_FOUND]: 'The requested resource was not found.',
  [ErrorCode.RESOURCE_EXISTS]: 'The resource already exists.',
  [ErrorCode.EXTERNAL_API_ERROR]: 'External service is unavailable. Please try again later.',
  [ErrorCode.UPLOAD_FAILED]: 'File upload failed. Please try again.',
  [ErrorCode.VALIDATION_ERROR]: 'Invalid input data. Please check your submission.',
  [ErrorCode.MISSING_PARAMETER]: 'Required parameter is missing.'
};

/**
 * Get a safe error message for a given error code
 */
function getSafeErrorMessage(errorCode: ErrorCode): string {
  return SAFE_ERROR_MESSAGES[errorCode] || SAFE_ERROR_MESSAGES[ErrorCode.INTERNAL_ERROR];
}

/**
 * Create a safe error response for production
 * 
 * @param error - The original error object
 * @param errorCode - Standardized error code
 * @param customMessage - Optional custom message (sanitized)
 * @returns Safe error response object
 */
export function createSafeErrorResponse(
  error: unknown,
  errorCode: ErrorCode = ErrorCode.INTERNAL_ERROR,
  customMessage?: string
): SafeErrorResponse {
  // Log full error details server-side (visible in Cloudflare logs)
  logger.error('❌ Error occurred:', {
    errorCode,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString()
  });
  
  // In development mode, return more details for debugging
  if (isDevelopment()) {
    return {
      success: false,
      error: customMessage || (error instanceof Error ? error.message : String(error)),
      errorCode,
    };
  }
  
  // In production, return only safe generic message
  return {
    success: false,
    error: customMessage || getSafeErrorMessage(errorCode),
    errorCode
  };
}

/**
 * Extract safe error message from known error types
 * Sanitizes error messages that might contain sensitive info
 */
export function sanitizeErrorMessage(message: string): string {
  // Remove common sensitive patterns
  return message
    .replace(/\/[\w\/\-_.]+\.ts/g, '[file]')  // Remove file paths
    .replace(/\/[\w\/\-_.]+\//g, '[path]/')   // Remove directory paths
    .replace(/at\s+.*\(.*:\d+:\d+\)/g, '')    // Remove stack trace lines
    .replace(/\s+/g, ' ')                      // Normalize whitespace
    .trim();
}

/**
 * Log error details securely (server-side only)
 */
export function logError(
  context: string,
  error: unknown,
  additionalInfo?: Record<string, unknown>
): void {
  logger.error(`❌ [${context}] Error:`, {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...additionalInfo,
    timestamp: new Date().toISOString()
  });
}
