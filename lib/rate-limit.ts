/**
 * Distributed rate limiter — the single source of truth for rate limiting.
 *
 * Uses Upstash Redis with a sliding window algorithm.
 * Sliding window prevents the burst attacks that fixed-window allows at the
 * boundary of two windows (e.g., 60 req at 0:59 + 60 req at 1:00 = 120 in 2 sec).
 *
 * Distributed: all Vercel instances share the same Redis counter, so limits are
 * enforced across the entire fleet — unlike the previous in-memory implementation
 * which was per-instance and reset on every deploy.
 *
 * Keying strategy:
 *   - Authenticated:   key = "user:<userId>"  (identity-based, not IP-based)
 *   - Unauthenticated: key = "ip:<clientIp>"  (best-effort for anonymous traffic)
 *   Keying by user ID when available means a user can't escape limits by
 *   rotating IPs, proxies, or VPNs.
 *
 * Required env vars (set in Vercel dashboard or .env.local):
 *   UPSTASH_REDIS_REST_URL    — from https://console.upstash.com
 *   UPSTASH_REDIS_REST_TOKEN  — from https://console.upstash.com
 *
 * Fallback behavior:
 *   - If Upstash env vars are missing: logs a warning and falls back to the
 *     in-memory limiter in middleware.ts (suitable for local dev without Redis).
 *   - If a Redis call fails at runtime: fails OPEN (allows the request) and
 *     logs the error. A Redis outage should not take down the app.
 *
 * Analytics:
 *   Upstash analytics=true surfaces request counts and block rates in the
 *   Upstash dashboard — useful for tuning limits and spotting abuse patterns.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Endpoint limit configuration
// ---------------------------------------------------------------------------

/**
 * Sliding-window rate limits per endpoint.
 * Add new entries here when adding new AI/expensive API routes.
 * The middleware enforces these for all matching paths.
 */
export const ENDPOINT_RATE_LIMITS = {
  // Search — high limit, relatively cheap operation
  "/api/search":                { requests: 60,  window: "1 m" },
  // AI / ML endpoints — expensive, limit tightly
  "/api/identify-card":         { requests: 10,  window: "1 m" },
  "/api/grade-estimate":        { requests: 10,  window: "1 m" },
  "/api/grade-estimate/start":  { requests: 10,  window: "1 m" },
  "/api/analyst":               { requests: 20,  window: "1 m" },
  "/api/business/consultant":   { requests: 20,  window: "1 m" },
  // Expensive resolvers that fan out to external eBay scraping / Browse API
  "/api/grading/pre-submission-analysis": { requests: 10, window: "1 m" },
  "/api/grade-estimator/value":           { requests: 20, window: "1 m" },
  "/api/cards/search":                    { requests: 30, window: "1 m" },
} as const satisfies Record<string, { requests: number; window: string }>;

export type RateLimitedEndpoint = keyof typeof ENDPOINT_RATE_LIMITS;

// ---------------------------------------------------------------------------
// Redis + Ratelimit instance management
// ---------------------------------------------------------------------------

// Lazily initialized — avoids errors at import time if env vars are missing
let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }
  // Reuse singleton across invocations within the same serverless instance
  if (!_redis) {
    _redis = Redis.fromEnv();
  }
  return _redis;
}

// One Ratelimit instance per endpoint (created on first use)
const _limiters = new Map<string, Ratelimit>();

function getLimiter(endpoint: string): Ratelimit | null {
  const config = ENDPOINT_RATE_LIMITS[endpoint as RateLimitedEndpoint];
  if (!config) return null;

  const redis = getRedis();
  if (!redis) {
    // No Redis configured — caller falls back to in-memory limiter
    return null;
  }

  if (!_limiters.has(endpoint)) {
    _limiters.set(
      endpoint,
      new Ratelimit({
        redis,
        // Sliding window: fair, no boundary bursts, accurate over time
        limiter: Ratelimit.slidingWindow(config.requests, config.window),
        // Namespace keys: "cz:rl:/api/search" etc.
        prefix: `cz:rl:${endpoint}`,
        // Surface hit/miss rates in the Upstash console
        analytics: true,
      })
    );
  }

  return _limiters.get(endpoint)!;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RateLimitCheck {
  /** Whether the request is within the allowed limit */
  allowed: boolean;
  /** Remaining requests in the current window */
  remaining: number;
  /** Unix timestamp (ms) when the current window resets */
  resetAt: number;
  /** Seconds until the client can retry (0 when allowed) */
  retryAfterSecs: number;
  /** True when Upstash is not configured — middleware uses in-memory fallback */
  usingFallback: boolean;
}

/**
 * Check whether an endpoint request is within rate limits.
 *
 * @param endpoint - API path, e.g. "/api/search"
 * @param ip       - Client IP (from x-forwarded-for or x-real-ip)
 * @param userId   - Authenticated user ID if available; preferred key when present
 *
 * @returns RateLimitCheck — caller should return 429 when `allowed` is false
 */
export async function checkDistributedRateLimit(
  endpoint: string,
  ip: string,
  userId?: string | null
): Promise<RateLimitCheck> {
  const limiter = getLimiter(endpoint);

  // No limiter = Upstash not configured or unknown endpoint
  if (!limiter) {
    return {
      allowed: true,
      remaining: Infinity,
      resetAt: 0,
      retryAfterSecs: 0,
      usingFallback: true,
    };
  }

  // Prefer user ID over IP: prevents limit bypass via proxy rotation
  const identifier = userId ? `user:${userId}` : `ip:${ip}`;

  try {
    const result = await limiter.limit(identifier);
    const retryAfterSecs = result.success
      ? 0
      : Math.max(0, Math.ceil((result.reset - Date.now()) / 1000));

    return {
      allowed: result.success,
      remaining: result.remaining,
      resetAt: result.reset,
      retryAfterSecs,
      usingFallback: false,
    };
  } catch (err) {
    // Redis error — fail OPEN so a Redis outage doesn't take down the app.
    // The in-memory middleware limiter still provides some protection.
    console.error(
      "[rate-limit] Upstash Redis call failed — failing open:",
      err instanceof Error ? err.message : String(err)
    );
    return {
      allowed: true,
      remaining: 0,
      resetAt: 0,
      retryAfterSecs: 0,
      usingFallback: true,
    };
  }
}

/**
 * Returns standard rate limit HTTP headers for a response.
 * Always include these so clients can implement backoff.
 */
export function buildRateLimitHeaders(
  check: RateLimitCheck,
  endpoint: string
): HeadersInit {
  const config = ENDPOINT_RATE_LIMITS[endpoint as RateLimitedEndpoint];
  const headers: Record<string, string> = {
    "X-RateLimit-Remaining": String(Math.max(0, check.remaining === Infinity ? 999 : check.remaining)),
    "X-RateLimit-Reset": String(Math.floor(check.resetAt / 1000)),
  };

  if (config) {
    headers["X-RateLimit-Limit"] = String(config.requests);
  }

  if (!check.allowed) {
    headers["Retry-After"] = String(check.retryAfterSecs);
  }

  return headers;
}
