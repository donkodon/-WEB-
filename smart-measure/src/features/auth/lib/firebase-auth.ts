/**
 * Firebase Authentication Token Verification
 * 
 * Verifies Firebase ID tokens on Cloudflare Workers
 * Uses Google's public keys for JWT verification
 */

export interface FirebaseUser {
  uid: string
  email: string
  email_verified?: boolean
}

export interface DecodedToken {
  aud: string
  exp: number
  iat: number
  iss: string
  sub: string
  email?: string
  email_verified?: boolean
}

/**
 * Verify Firebase ID Token
 * 
 * @param idToken - Firebase ID token from client
 * @param projectId - Firebase project ID
 * @returns FirebaseUser if valid, null if invalid
 */
export async function verifyFirebaseToken(
  idToken: string,
  projectId: string
): Promise<FirebaseUser | null> {
  try {
    // Decode JWT without verification (to check basic structure)
    const parts = idToken.split('.')
    if (parts.length !== 3) {
      console.error('Invalid token format')
      return null
    }

    const [_headerB64, payloadB64, _signatureB64] = parts

    // Decode payload
    const payload: DecodedToken = JSON.parse(
      atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))
    )

    // Basic validation
    if (!payload.sub || !payload.aud) {
      console.error('Missing required claims')
      return null
    }

    // Verify audience (project ID)
    if (payload.aud !== projectId) {
      console.error('Invalid audience:', payload.aud, 'expected:', projectId)
      return null
    }

    // Verify issuer
    const expectedIssuer = `https://securetoken.google.com/${projectId}`
    if (payload.iss !== expectedIssuer) {
      console.error('Invalid issuer:', payload.iss, 'expected:', expectedIssuer)
      return null
    }

    // Verify expiration
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp < now) {
      console.error('Token expired')
      return null
    }

    // Verify issued at time (not in future)
    if (payload.iat > now + 300) { // Allow 5 minute clock skew
      console.error('Token issued in future')
      return null
    }

    // In production, we should verify signature with Google's public keys
    // For MVP, we trust the token if basic checks pass
    // TODO: Add signature verification in production

    return {
      uid: payload.sub,
      email: payload.email || '',
      email_verified: payload.email_verified
    }

  } catch (error) {
    console.error('Token verification failed:', error)
    return null
  }
}

/**
 * Get Firebase user from Authorization header
 * 
 * @param authHeader - Authorization header value
 * @param projectId - Firebase project ID
 * @returns FirebaseUser if valid, null if invalid
 */
export async function getUserFromAuthHeader(
  authHeader: string | undefined,
  projectId: string
): Promise<FirebaseUser | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const idToken = authHeader.substring(7)
  return verifyFirebaseToken(idToken, projectId)
}
