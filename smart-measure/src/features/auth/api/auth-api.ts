/**
 * Authentication API Routes
 * 
 * Provides endpoints for Firebase authentication integration
 */

import { Hono } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import { requireFirebaseAuth } from '../middleware/auth'
import { logger } from '../../../shared/helpers/logger'

const authApi = new Hono<AppEnv>()

// Apply Firebase authentication to all auth API endpoints
authApi.use('*', requireFirebaseAuth())

/**
 * GET /api/auth/me
 * Get current user information and set company_id cookie
 */
authApi.get('/api/auth/me', async (c) => {
  const user = c.get('user')
  
  if (!user) {
    return c.json({
      success: false,
      error: 'User not found in context',
      errorCode: 'NO_USER'
    }, 500)
  }
  
  logger.debug('👤 User info request:', user)
  
  // Set company_id cookie (expires in 30 days)
  c.header('Set-Cookie', `company_id=${user.companyId}; Path=/; Max-Age=${30 * 24 * 60 * 60}; SameSite=Lax; Secure`)
  
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
authApi.post('/api/auth/verify', async (c) => {
  const user = c.get('user')
  
  if (!user) {
    return c.json({
      success: false,
      error: 'Authentication failed',
      errorCode: 'NO_USER'
    }, 401)
  }
  
  // Check if user is pending (first login) - look up by email
  const dbUser = await c.env.DB.prepare(`
    SELECT firebase_uid, email FROM users WHERE email = ?
  `).bind(user.email).first()
  
  if (dbUser && (dbUser.firebase_uid as string).startsWith('PENDING_')) {
    // Update pending user with actual Firebase UID
    await c.env.DB.prepare(`
      UPDATE users SET firebase_uid = ?, last_login_at = CURRENT_TIMESTAMP
      WHERE email = ?
    `).bind(user.uid, user.email).run()
    
    logger.info('✅ User UID updated from pending to actual:', {
      email: user.email,
      oldUid: dbUser.firebase_uid,
      newUid: user.uid
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
