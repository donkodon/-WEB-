/**
 * Secure CORS Configuration
 * 
 * Replaces wildcard CORS with strict origin whitelist
 */

import { cors } from 'hono/cors'
import type { _Context } from 'hono'
import type { _AppEnv } from '../../types/bindings'
import { logger } from '../helpers/logger'

/**
 * Allowed origins whitelist
 * Add your production domains here
 */
const ALLOWED_ORIGINS = [
  'https://smart-measure.pages.dev',
  'https://smart-measure-production.pages.dev',
  'https://measure-master-api.jinkedon2.workers.dev',
  // Mobile app API
  'https://measure-master-api.jinkedon2.workers.dev',
  // Image upload API
  'https://image-upload-api.jinkedon2.workers.dev',
  // Local development
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:8788',
  'http://127.0.0.1:8788'
];

/**
 * Check if origin is allowed
 */
function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  
  // Exact match
  if (ALLOWED_ORIGINS.includes(origin)) {
    return true;
  }
  
  // Allow Cloudflare Pages preview deployments
  // Format: https://<hash>.smart-measure.pages.dev
  if (origin.match(/^https:\/\/[a-z0-9-]+\.smart-measure\.pages\.dev$/)) {
    return true;
  }
  
  // Allow local development with any port
  if (origin.match(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/)) {
    return true;
  }
  
  return false;
}

/**
 * Secure CORS middleware with origin whitelist
 * 
 * Usage:
 * ```typescript
 * app.use('/*', secureCors())
 * ```
 */
export function secureCors() {
  return cors({
    origin: (origin, c) => {
      // If no origin header, allow (same-origin request)
      if (!origin) {
        return origin || '*';
      }
      
      // Check if origin is in whitelist
      if (isOriginAllowed(origin)) {
        return origin;
      }
      
      // Log unauthorized CORS attempt
      logger.warn('🚫 Blocked CORS request from unauthorized origin:', {
        origin,
        path: c.req.path,
        method: c.req.method,
        ip: c.req.header('CF-Connecting-IP') || 'unknown'
      });
      
      // Return null to block the request (type assertion required by Hono CORS middleware)
      return null as unknown as string;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
    exposeHeaders: ['Content-Length', 'Content-Type'],
    maxAge: 600,
    credentials: true
  });
}

/**
 * API-specific CORS middleware (more permissive for public APIs)
 * 
 * Usage:
 * ```typescript
 * app.use('/api/public/*', apiCors())
 * ```
 */
export function apiCors() {
  return cors({
    origin: (origin, c) => {
      if (!origin) {
        return origin || '*';
      }
      
      if (isOriginAllowed(origin)) {
        return origin;
      }
      
      // For public API endpoints, log but allow
      logger.info('ℹ️ CORS request from external origin:', {
        origin,
        path: c.req.path,
        method: c.req.method
      });
      
      return origin;
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    maxAge: 600
  });
}

/**
 * Add allowed origin dynamically (for runtime configuration)
 */
export function addAllowedOrigin(origin: string): void {
  if (!ALLOWED_ORIGINS.includes(origin)) {
    ALLOWED_ORIGINS.push(origin);
    logger.info('✅ Added allowed origin:', origin);
  }
}

/**
 * Get current allowed origins (for debugging)
 */
export function getAllowedOrigins(): string[] {
  return [...ALLOWED_ORIGINS];
}
