// ==========================================
// R2UrlHelper: Utility for generating R2 public URLs
// ==========================================

/**
 * Get R2 public URL from environment or fallback
 * @param env - Cloudflare environment bindings
 * @returns R2 public URL
 */
export function getR2PublicUrl(env: { R2_PUBLIC_URL?: string }): string {
  return env.R2_PUBLIC_URL || 'https://pub-300562464768499b8fcaee903d0f9861.r2.dev';
}

/**
 * Generate full R2 public URL for a given key
 * @param env - Cloudflare environment bindings
 * @param r2Key - R2 object key
 * @returns Full R2 public URL
 */
export function buildR2PublicUrl(env: { R2_PUBLIC_URL?: string }, r2Key: string): string {
  const baseUrl = getR2PublicUrl(env);
  return `${baseUrl}/${r2Key}`;
}
