/**
 * Edge-compatible rate limiter for API endpoints.
 * Uses in-memory storage (works for single instance; for multi-instance use Redis/KV).
 * Keys by IP + optional user ID.
 */

interface RateLimitConfig {
  /** Max requests allowed in the window */
  maxRequests: number;
  /** Window size in seconds */
  windowSecs: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store for rate limits (per-instance)
// For production with multiple instances, consider Vercel KV or Upstash Redis
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically (every 60 seconds)
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 60_000;

function cleanupStaleEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;

  lastCleanup = now;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}

// Rate limit configurations per endpoint
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  "/api/identify-card": { maxRequests: 10, windowSecs: 60 },
  "/api/grade-estimate": { maxRequests: 10, windowSecs: 60 },
  "/api/analyst": { maxRequests: 20, windowSecs: 60 },
  "/api/search": { maxRequests: 60, windowSecs: 60 },
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSecs: number;
}

/**
 * Check rate limit for a request.
 * @param endpoint - The API endpoint path (e.g., "/api/identify-card")
 * @param ip - Client IP address
 * @param userId - Optional user ID for more granular limiting
 */
export function checkRateLimit(
  endpoint: string,
  ip: string,
  userId?: string
): RateLimitResult {
  // Run cleanup if needed
  cleanupStaleEntries();

  const config = RATE_LIMITS[endpoint];
  if (!config) {
    // No rate limit configured for this endpoint
    return { allowed: true, remaining: Infinity, resetAt: 0, retryAfterSecs: 0 };
  }

  // Build key: endpoint + ip + optional userId
  const keyParts = [endpoint, ip];
  if (userId) keyParts.push(userId);
  const key = keyParts.join(":");

  const now = Date.now();
  const windowMs = config.windowSecs * 1000;

  let entry = rateLimitStore.get(key);

  // If no entry or window expired, create new window
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 0,
      resetAt: now + windowMs,
    };
  }

  // Increment count
  entry.count += 1;
  rateLimitStore.set(key, entry);

  const remaining = Math.max(0, config.maxRequests - entry.count);
  const retryAfterSecs = Math.ceil((entry.resetAt - now) / 1000);

  if (entry.count > config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfterSecs,
    };
  }

  return {
    allowed: true,
    remaining,
    resetAt: entry.resetAt,
    retryAfterSecs: 0,
  };
}

/**
 * Build rate limit response headers
 */
export function rateLimitHeaders(result: RateLimitResult, config?: RateLimitConfig): HeadersInit {
  const headers: HeadersInit = {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
  };

  if (config) {
    headers["X-RateLimit-Limit"] = String(config.maxRequests);
  }

  if (!result.allowed) {
    headers["Retry-After"] = String(result.retryAfterSecs);
  }

  return headers;
}

/**
 * Create a 429 response with proper headers
 */
export function rateLimitResponse(result: RateLimitResult, endpoint: string): Response {
  const config = RATE_LIMITS[endpoint];

  return new Response(
    JSON.stringify({
      error: "rate_limit_exceeded",
      message: `Too many requests. Please retry after ${result.retryAfterSecs} seconds.`,
      retryAfter: result.retryAfterSecs,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        ...rateLimitHeaders(result, config),
      },
    }
  );
}
