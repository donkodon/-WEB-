// ==========================================
// ImageUrlHelper: Utility for converting between R2 paths and full URLs
// ==========================================

/**
 * Get IMAGE_UPLOAD_API_URL from environment or fallback
 * @param env - Cloudflare environment bindings
 * @returns Image upload API URL
 */
export function getImageUploadApiUrl(env: { IMAGE_UPLOAD_API_URL?: string }): string {
  return env.IMAGE_UPLOAD_API_URL || 'https://image-upload-api.jinkedon2.workers.dev';
}

export class ImageUrlHelper {
  // Default fallback URL (will be overridden by environment variable)
  static readonly DEFAULT_WORKERS_BASE_URL = 'https://image-upload-api.jinkedon2.workers.dev';
  
  /**
   * Convert R2 path to full URL
   * @param r2Path - R2 path (e.g., "test_company/1025L280001/uuid.jpg")
   * @param baseUrl - Optional base URL (defaults to environment variable or fallback)
   * @returns Full URL (e.g., "https://image-upload-api.jinkedon2.workers.dev/test_company/1025L280001/uuid.jpg")
   */
  static toFullUrl(r2Path: string, baseUrl?: string): string {
    if (!r2Path) return '';
    // If already a full URL, return as-is
    if (r2Path.startsWith('http://') || r2Path.startsWith('https://')) {
      return r2Path;
    }
    const workersBaseUrl = baseUrl || this.DEFAULT_WORKERS_BASE_URL;
    return `${workersBaseUrl}/${r2Path}`;
  }
  
  /**
   * Convert full URL to R2 path
   * @param fullUrl - Full URL (e.g., "https://image-upload-api.jinkedon2.workers.dev/test_company/1025L280001/uuid.jpg")
   * @returns R2 path (e.g., "test_company/1025L280001/uuid.jpg")
   */
  static toR2Path(fullUrl: string): string {
    if (!fullUrl) return '';
    // If already an R2 path (no http://), return as-is
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
      return fullUrl;
    }
    try {
      const url = new URL(fullUrl);
      // Remove leading '/' from pathname
      return url.pathname.substring(1);
    } catch (e) {
      console.error(' Failed to parse URL:', fullUrl, e);
      return fullUrl;
    }
  }
  
  /**
   * Convert array of full URLs to R2 paths
   * @param fullUrls - Array of full URLs
   * @returns Array of R2 paths
   */
  static toR2Paths(fullUrls: string[]): string[] {
    return fullUrls.map(url => this.toR2Path(url));
  }
  
  /**
   * Convert array of R2 paths to full URLs
   * @param r2Paths - Array of R2 paths
   * @returns Array of full URLs
   */
  static toFullUrls(r2Paths: string[]): string[] {
    return r2Paths.map(path => this.toFullUrl(path));
  }
}
