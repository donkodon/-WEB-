/**
 * Authentication Guard
 * 
 * Protects dashboard pages from unauthorized access
 * Manages authentication state and token refresh
 */

import { auth, onAuthStateChanged, signOut } from './firebase-config.js'

let currentUser = null
let tokenRefreshInterval = null

// Initialize authentication state
function initAuthGuard() {
  window.logger && window.logger.debug('🔐 Initializing authentication guard...')
  
  // Check if on login page
  const isLoginPage = window.location.pathname === '/login.html' || 
                      window.location.pathname === '/firebase-login' ||
                      window.location.pathname === '/legacy-login'
  
  // Monitor auth state
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // User is logged in
      currentUser = user
      window.logger && window.logger.debug('✅ User authenticated:', user.email)
      
      try {
        // Get and store fresh token
        const idToken = await user.getIdToken(true) // Force refresh
        localStorage.setItem('firebase_token', idToken)
        localStorage.setItem('user_email', user.email)
        localStorage.setItem('user_uid', user.uid)
        
        // Update UI with user info
        updateUserInfo(user)
        
        // Setup token refresh (every 50 minutes)
        setupTokenRefresh(user)
        
        // Redirect to dashboard if on login page
        if (isLoginPage) {
          window.logger && window.logger.debug('📍 Redirecting to dashboard...')
          window.location.href = '/dashboard'
        }
        
      } catch (error) {
        window.logger && window.logger.error('❌ Token refresh error:', error)
        handleAuthError()
      }
      
    } else {
      // User is not logged in
      currentUser = null
      window.logger && window.logger.debug('⚠️ No authenticated user')
      
      // Clear stored tokens
      localStorage.removeItem('firebase_token')
      localStorage.removeItem('user_email')
      localStorage.removeItem('user_uid')
      
      // Redirect to login if not already there
      if (!isLoginPage) {
        window.logger && window.logger.debug('📍 Redirecting to login...')
        window.location.href = '/firebase-login'
      }
    }
  })
}

// Update UI with user information
function updateUserInfo(user) {
  const userEmailEl = document.getElementById('userEmail')
  const userNameEl = document.getElementById('userName')
  const userAvatarEl = document.getElementById('userAvatar')
  
  if (userEmailEl) {
    userEmailEl.textContent = user.email
  }
  
  if (userNameEl) {
    userNameEl.textContent = user.displayName || user.email.split('@')[0]
  }
  
  if (userAvatarEl && user.photoURL) {
    userAvatarEl.src = user.photoURL
  }
}

// Setup automatic token refresh
function setupTokenRefresh(user) {
  // Clear existing interval
  if (tokenRefreshInterval) {
    clearInterval(tokenRefreshInterval)
  }
  
  // Refresh token every 50 minutes (tokens expire after 1 hour)
  tokenRefreshInterval = setInterval(async () => {
    try {
      window.logger && window.logger.debug('🔄 Refreshing authentication token...')
      const newToken = await user.getIdToken(true)
      localStorage.setItem('firebase_token', newToken)
      window.logger && window.logger.debug('✅ Token refreshed successfully')
    } catch (error) {
      window.logger && window.logger.error('❌ Token refresh failed:', error)
      handleAuthError()
    }
  }, 50 * 60 * 1000) // 50 minutes
}

// Handle authentication errors
function handleAuthError() {
  window.logger && window.logger.error('⛔ Authentication error - logging out')
  handleLogout()
}

// Logout handler
window.handleLogout = async function() {
  try {
    window.logger && window.logger.debug('🚪 Logging out...')
    
    // Clear refresh interval
    if (tokenRefreshInterval) {
      clearInterval(tokenRefreshInterval)
    }
    
    // Sign out from Firebase
    await signOut(auth)
    
    // Clear local storage
    localStorage.removeItem('firebase_token')
    localStorage.removeItem('user_email')
    localStorage.removeItem('user_uid')
    
    window.logger && window.logger.debug('✅ Logged out successfully')
    
    // Redirect to login
    window.location.href = '/firebase-login'
    
  } catch (error) {
    window.logger && window.logger.error('❌ Logout error:', error)
    alert('ログアウトに失敗しました')
  }
}

// Authenticated fetch wrapper
window.authenticatedFetch = async function(url, options = {}) {
  const token = localStorage.getItem('firebase_token')
  
  if (!token) {
    window.logger && window.logger.error('❌ No authentication token found')
    throw new Error('認証トークンがありません。再ログインしてください。')
  }
  
  // Add Authorization header
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`
  }
  
  try {
    window.logger && window.logger.debug('🔐 Sending authenticated request to:', url)
    window.logger && window.logger.debug('🔑 Token (first 20 chars):', token.substring(0, 20) + '...')
    
    const response = await fetch(url, {
      ...options,
      headers
    })
    
    window.logger && window.logger.debug('📡 Response status:', response.status)
    
    // Log error responses
    if (!response.ok) {
      const errorBody = await response.clone().text()
      window.logger && window.logger.error('❌ API Error Response:', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody
      })
    }
    
    // Handle 401 Unauthorized
    if (response.status === 401) {
      window.logger && window.logger.error('⛔ 401 Unauthorized - token may be expired')
      
      // Try to refresh token
      if (currentUser) {
        try {
          const newToken = await currentUser.getIdToken(true)
          localStorage.setItem('firebase_token', newToken)
          
          // Retry request with new token
          headers.Authorization = `Bearer ${newToken}`
          return fetch(url, { ...options, headers })
          
        } catch (refreshError) {
          window.logger && window.logger.error('❌ Token refresh failed:', refreshError)
          handleAuthError()
          throw new Error('認証エラー。再ログインしてください。')
        }
      } else {
        handleAuthError()
        throw new Error('認証エラー。再ログインしてください。')
      }
    }
    
    return response
    
  } catch (error) {
    window.logger && window.logger.error('❌ Fetch error:', error)
    throw error
  }
}

// Get current user
window.getCurrentUser = function() {
  return currentUser
}

// Export current user for other modules
export { currentUser }

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuthGuard)
} else {
  initAuthGuard()
}
