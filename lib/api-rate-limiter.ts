/**
 * @deprecated Use lib/rate-limit.ts instead.
 *
 * This file previously contained an in-memory rate limiter used only within
 * individual API routes. Rate limiting is now handled at the middleware layer
 * (middleware.ts) using Upstash Redis for distributed enforcement across all
 * Vercel instances.
 *
 * If you need per-route rate limiting beyond what middleware enforces, import
 * from "@/lib/rate-limit" directly.
 *
 * This shim re-exports the new API for backward compatibility.
 */

export {
  checkDistributedRateLimit as checkRateLimit,
  buildRateLimitHeaders as rateLimitHeaders,
  ENDPOINT_RATE_LIMITS as RATE_LIMITS,
} from "@/lib/rate-limit";
