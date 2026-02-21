/**
 * Authentication Middleware
 * 
 * Provides protection for admin and debug endpoints
 * Supports both API key auth (legacy) and Firebase Authentication
 */

import { Context, Next } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import { logger } from '../../../shared/helpers/logger'
import { getUserFromAuthHeader } from '../lib/firebase-auth'

// Extend Context to include user information
export interface AuthContext {
  user?: {
    uid: string
    email: string
    role: string
    companyId: string
    displayName?: string
  }
}

/**
 * Check if request has valid admin authentication
 * 
 * Security methods (in order of priority):
 * 1. API Key in Authorization header: "Bearer YOUR_ADMIN_API_KEY"
 * 2. API Key in X-Admin-Key header
 * 3. Environment variable ADMIN_API_KEY must be set
 */
function isAuthenticated(c: Context<AppEnv>): boolean {
  const adminApiKey = c.env.ADMIN_API_KEY;
  
  // If ADMIN_API_KEY is not configured, deny all admin access
  if (!adminApiKey || adminApiKey === 'your-secure-admin-key-here') {
    logger.warn('⚠️ ADMIN_API_KEY not configured - admin endpoints are disabled');
    return false;
  }
  
  // Check Authorization header (Bearer token)
  const authHeader = c.req.header('Authorization');
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '').trim();
    if (token === adminApiKey) {
      return true;
    }
  }
  
  // Check X-Admin-Key header
  const adminKeyHeader = c.req.header('X-Admin-Key');
  if (adminKeyHeader && adminKeyHeader === adminApiKey) {
    return true;
  }
  
  return false;
}

/**
 * Middleware to protect admin endpoints
 * 
 * Usage:
 * ```typescript
 * admin.get('/api/admin/sensitive', requireAdmin, async (c) => { ... })
 * ```
 */
export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  if (!isAuthenticated(c)) {
    logger.warn('🚫 Unauthorized admin access attempt:', {
      path: c.req.path,
      method: c.req.method,
      ip: c.req.header('CF-Connecting-IP') || 'unknown'
    });
    
    return c.json({
      success: false,
      error: 'Unauthorized. Admin API key required.',
      errorCode: 'UNAUTHORIZED'
    }, 401);
  }
  
  await next();
}

/**
 * Middleware to protect debug endpoints (less strict than admin)
 * Allows access in development mode OR with valid admin key
 * 
 * Usage:
 * ```typescript
 * admin.get('/debug/info', requireDebugAccess, async (c) => { ... })
 * ```
 */
export async function requireDebugAccess(c: Context<AppEnv>, next: Next) {
  // Allow in development mode (local only)
  const isDevelopment = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
  
  if (isDevelopment) {
    await next();
    return;
  }
  
  // In production, require admin authentication
  if (!isAuthenticated(c)) {
    logger.warn('🚫 Unauthorized debug access attempt:', {
      path: c.req.path,
      method: c.req.method,
      ip: c.req.header('CF-Connecting-IP') || 'unknown'
    });
    
    return c.json({
      success: false,
      error: 'Unauthorized. Admin API key required for debug endpoints in production.',
      errorCode: 'UNAUTHORIZED'
    }, 401);
  }
  
  await next();
}

/**
 * Middleware to prevent dangerous operations via GET requests
 * Forces POST/DELETE methods for destructive actions
 * 
 * Usage:
 * ```typescript
 * admin.get('/api/admin/delete-all', preventGetMethod, async (c) => { ... })
 * ```
 */
export async function preventGetMethod(c: Context<AppEnv>, next: Next) {
  if (c.req.method === 'GET') {
    logger.warn('🚫 Blocked dangerous GET request:', {
      path: c.req.path,
      ip: c.req.header('CF-Connecting-IP') || 'unknown'
    });
    
    return c.json({
      success: false,
      error: 'This operation requires POST or DELETE method for safety.',
      errorCode: 'METHOD_NOT_ALLOWED'
    }, 405);
  }
  
  await next();
}

// ==========================================
// Firebase Authentication Middleware
// ==========================================

/**
 * Middleware to require Firebase authentication
 * Verifies Firebase ID token and loads user info from database
 * 
 * Usage:
 * ```typescript
 * app.get('/api/protected', requireFirebaseAuth, async (c) => {
 *   const user = c.get('user')
 *   return c.json({ message: `Hello ${user.email}` })
 * })
 * ```
 */
export async function requireFirebaseAuth(c: Context<AppEnv>, next: Next) {
  const authHeader = c.req.header('Authorization')
  
  // Get FIREBASE_PROJECT_ID from env bindings (set via Cloudflare Pages dashboard or .dev.vars)
  const projectId = c.env.FIREBASE_PROJECT_ID || 'saisunsatsuei-950cf'

  if (!projectId) {
    logger.error('❌ FIREBASE_PROJECT_ID not configured in environment')
    return c.json({
      success: false,
      error: 'Firebase authentication not configured',
      errorCode: 'CONFIG_ERROR'
    }, 500)
  }

  logger.debug('🔐 Firebase auth check:', {
    hasAuthHeader: !!authHeader,
    projectId: projectId,
    path: c.req.path
  })

  // Verify Firebase token
  const firebaseUser = await getUserFromAuthHeader(authHeader, projectId)
  
  if (!firebaseUser) {
    logger.warn('🚫 Invalid Firebase token:', {
      path: c.req.path,
      method: c.req.method,
      ip: c.req.header('CF-Connecting-IP') || 'unknown'
    })
    
    return c.json({
      success: false,
      error: 'Unauthorized. Valid Firebase token required.',
      errorCode: 'UNAUTHORIZED'
    }, 401)
  }

  // Load user info from database (try by firebase_uid first)
  let dbUser = await c.env.DB.prepare(`
    SELECT * FROM users WHERE firebase_uid = ? AND is_active = 1
  `).bind(firebaseUser.uid).first()

  // If not found by UID, try by email (for PENDING users)
  if (!dbUser) {
    dbUser = await c.env.DB.prepare(`
      SELECT * FROM users WHERE email = ? AND is_active = 1
    `).bind(firebaseUser.email).first()
    
    // If found by email and is PENDING, update the UID
    if (dbUser && (dbUser.firebase_uid as string)?.startsWith('PENDING')) {
      logger.info('🔄 Updating PENDING user with Firebase UID:', {
        email: firebaseUser.email,
        oldUid: dbUser.firebase_uid,
        newUid: firebaseUser.uid
      })
      
      await c.env.DB.prepare(`
        UPDATE users SET firebase_uid = ?, last_login_at = CURRENT_TIMESTAMP WHERE email = ?
      `).bind(firebaseUser.uid, firebaseUser.email).run()
      
      // Reload user data
      dbUser = await c.env.DB.prepare(`
        SELECT * FROM users WHERE firebase_uid = ? AND is_active = 1
      `).bind(firebaseUser.uid).first()
    }
  }

  if (!dbUser) {
    logger.warn('🚫 User not found in database:', {
      uid: firebaseUser.uid,
      email: firebaseUser.email
    })
    
    return c.json({
      success: false,
      error: 'User not found or inactive',
      errorCode: 'USER_NOT_FOUND'
    }, 403)
  }

  // Update last login time (if not already updated above)
  if (!(dbUser.firebase_uid as string)?.startsWith('PENDING')) {
    await c.env.DB.prepare(`
      UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE firebase_uid = ?
    `).bind(firebaseUser.uid).run()
  }

  // Set user context
  c.set('user', {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    role: dbUser.role as string,
    companyId: dbUser.company_id as string,
    displayName: dbUser.display_name as string | undefined
  })

  await next()
}

/**
 * Middleware to require specific role(s)
 * Must be used after requireFirebaseAuth
 * 
 * Usage:
 * ```typescript
 * app.delete('/api/products/:sku', requireFirebaseAuth, requireRole('admin'), async (c) => { ... })
 * app.post('/api/upload', requireFirebaseAuth, requireRole('admin', 'staff'), async (c) => { ... })
 * ```
 */
export function requireRole(...allowedRoles: string[]) {
  return async (c: Context<AppEnv>, next: Next) => {
    const user = c.get('user') as AuthContext['user']
    
    if (!user) {
      logger.error('❌ requireRole called without user context. Use requireFirebaseAuth first.')
      return c.json({
        success: false,
        error: 'Authentication required',
        errorCode: 'UNAUTHORIZED'
      }, 401)
    }

    if (!allowedRoles.includes(user.role)) {
      logger.warn('🚫 Insufficient permissions:', {
        uid: user.uid,
        role: user.role,
        required: allowedRoles,
        path: c.req.path
      })
      
      return c.json({
        success: false,
        error: `This action requires one of these roles: ${allowedRoles.join(', ')}`,
        errorCode: 'FORBIDDEN',
        userRole: user.role,
        requiredRoles: allowedRoles
      }, 403)
    }

    await next()
  }
}
