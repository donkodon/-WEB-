// Cloudflare AI binding type
export interface CloudflareAI {
  run(model: string, options: any): Promise<any>
}

// Cloudflare Workers Bindings
export type Bindings = {
  DB: D1Database
  FAL_API_KEY?: string
  BRIA_API_KEY?: string
  WITHOUTBG_API_URL?: string
  MOBILE_API_URL?: string
  IMAGE_UPLOAD_API_URL?: string
  R2_PUBLIC_URL?: string // R2 public URL for direct image access
  PRODUCT_IMAGES?: R2Bucket
  AI: CloudflareAI // Cloudflare AI Workers binding
  REPLICATE_API_KEY?: string // Replicate API key for auto-measurement
  ADMIN_API_KEY?: string // Admin API key for protected endpoints
  DEFAULT_GARMENT_CLASS?: string // Default garment class for measurement API
  LOG_LEVEL?: string // Logging level (debug, info, warn, error)
  ENABLE_CONSOLE_LOGS?: string // Enable console logs (true/false)
}

// Re-export Hono types for convenience
export type AppEnv = { Bindings: Bindings }
