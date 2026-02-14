/**
 * Authentication API Routes
 * 
 * Provides endpoints for Firebase authentication integration
 */

import { Hono } from 'hono'
import type { AppEnv } from '../types/bindings'
import { requireFirebaseAuth } from '../middleware/auth'
import { logger } from '../helpers/logger'

const authApi = new Hono<AppEnv>()

/**
 * GET /api/auth/me
 * Get current user information
 */
authApi.get('/api/auth/me', requireFirebaseAuth, async (c) => {
  const user = c.get('user')
  
  if (!user) {
    return c.json({
      success: false,
      error: 'User not found in context',
      errorCode: 'NO_USER'
    }, 500)
  }
  
  logger.debug('👤 User info request:', user)
  
  return c.json({
    success: true,
    user: {
      uid: user.uid,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      displayName: user.displayName
    }
  })
})

/**
 * POST /api/auth/verify
 * Verify Firebase token and sync user data
 * Called after first login to ensure user exists in database
 */
authApi.post('/api/auth/verify', requireFirebaseAuth, async (c) => {
  const user = c.get('user')
  
  if (!user) {
    return c.json({
      success: false,
      error: 'Authentication failed',
      errorCode: 'NO_USER'
    }, 401)
  }
  
  // Check if user is pending (first login)
  const dbUser = await c.env.DB.prepare(`
    SELECT firebase_uid, email FROM users WHERE firebase_uid = ?
  `).bind(user.uid).first()
  
  if (dbUser && dbUser.firebase_uid === 'PENDING_ADMIN') {
    // Update pending admin with actual Firebase UID
    await c.env.DB.prepare(`
      UPDATE users SET firebase_uid = ?, last_login_at = CURRENT_TIMESTAMP
      WHERE email = ?
    `).bind(user.uid, user.email).run()
    
    logger.info('✅ Admin user UID updated:', {
      email: user.email,
      uid: user.uid
    })
  }
  
  return c.json({
    success: true,
    message: 'User verified',
    user: {
      uid: user.uid,
      email: user.email,
      role: user.role
    }
  })
})

/**
 * POST /api/auth/logout
 * Server-side logout (optional - mainly handled client-side)
 */
authApi.post('/api/auth/logout', async (c) => {
  // Server-side logout logic if needed
  // For Firebase, logout is primarily client-side
  
  return c.json({
    success: true,
    message: 'Logged out successfully'
  })
})

export default authApi
