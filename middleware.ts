import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Rate-limit configuration
// Limits are per-IP + per-user-id (anon if unauthenticated).
// ---------------------------------------------------------------------------
const RATE_LIMITS: Record<string, { limit: number; windowSec: number }> = {
  "/api/search":               { limit: 60, windowSec: 60 },
  "/api/identify-card":        { limit: 10, windowSec: 60 },
  "/api/grade-estimate":       { limit: 10, windowSec: 60 },
  "/api/analyst":              { limit: 20, windowSec: 60 },
  // Collection writes — prevents automated scraping of collection-add endpoint
  "/api/collection":           { limit: 30, windowSec: 60 },
  // Bulk Mode — generous limits since processing is batched server-side
  "/api/bulk/batches":         { limit: 30, windowSec: 60 },   // list + create
  "/api/bulk/batches/process": { limit: 5,  windowSec: 60 },   // AI-heavy; tight limit
};

// ---------------------------------------------------------------------------
// Upstash Redis-backed limiter (distributed, works across Vercel instances)
// Lazily initialised on first cold start that has credentials.
// ---------------------------------------------------------------------------
let _redis: Redis | null = null;
const _limiters = new Map<string, Ratelimit>();

function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

function getUpstashLimiter(pathname: string): Ratelimit | null {
  const config = RATE_LIMITS[pathname];
  if (!config) return null;
  const redis = getRedis();
  if (!redis) return null;

  let limiter = _limiters.get(pathname);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.limit, `${config.windowSec} s`),
      prefix: `rl${pathname.replace(/\//g, ":")}`,
      analytics: false,
    });
    _limiters.set(pathname, limiter);
  }
  return limiter;
}

// ---------------------------------------------------------------------------
// In-memory fallback — only used when Upstash is not configured.
// NOT distributed: each Vercel instance has its own store. Fine for local dev,
// insufficient for production. A warning is logged if this path is hit in prod.
// ---------------------------------------------------------------------------
const _memStore = new Map<string, number[]>();

function inMemoryRateLimit(
  pathname: string,
  key: string
): { limited: boolean; retryAfterSeconds: number } {
  const config = RATE_LIMITS[pathname];
  if (!config) return { limited: false, retryAfterSeconds: 0 };

  const now = Date.now();
  const windowMs = config.windowSec * 1000;
  const timestamps = (_memStore.get(key) ?? []).filter((t) => t > now - windowMs);

  if (timestamps.length >= config.limit) {
    const oldest = timestamps[0] ?? now;
    return {
      limited: true,
      retryAfterSeconds: Math.ceil(Math.max(windowMs - (now - oldest), 0) / 1000),
    };
  }

  timestamps.push(now);
  _memStore.set(key, timestamps);
  return { limited: false, retryAfterSeconds: 0 };
}

// ---------------------------------------------------------------------------
// IP extraction
// ---------------------------------------------------------------------------
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

// ---------------------------------------------------------------------------
// Main rate-limit check — tries Upstash first, falls back to in-memory
// ---------------------------------------------------------------------------
async function checkRateLimit(
  request: NextRequest,
  userId: string | null
): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  const { pathname } = request.nextUrl;
  if (!RATE_LIMITS[pathname]) return { limited: false, retryAfterSeconds: 0 };

  const key = `${getClientIp(request)}:${userId ?? "anon"}`;
  const limiter = getUpstashLimiter(pathname);

  if (limiter) {
    try {
      const { success, reset } = await limiter.limit(key);
      return {
        limited: !success,
        retryAfterSeconds: success ? 0 : Math.ceil(Math.max(reset - Date.now(), 0) / 1000),
      };
    } catch (err) {
      console.error("[ratelimit] Upstash error, falling back to in-memory:", err);
    }
  } else if (process.env.NODE_ENV === "production") {
    // Surface clearly in Vercel logs so the operator knows to fix it
    console.error(
      "[SECURITY][ratelimit] CRITICAL: Rate limiting is in-memory only. " +
      "Configure UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN for distributed rate limiting."
    );
  }

  return inMemoryRateLimit(pathname, key);
}

// ---------------------------------------------------------------------------
// Middleware entry point
// ---------------------------------------------------------------------------
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes already perform auth checks in their handlers.
  // Skipping session refresh here avoids an extra auth round-trip per API request.
  if (pathname.startsWith("/api/")) {
    const apiRateLimit = await checkRateLimit(request, null);
    if (apiRateLimit.limited) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          message: "Too many requests. Please retry after a short wait.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(apiRateLimit.retryAfterSeconds || 60),
          },
        }
      );
    }
    return NextResponse.next();
  }

  const { response, userId } = await updateSession(request);
  const rateLimit = await checkRateLimit(request, userId);

  if (rateLimit.limited) {
    const limitedResponse = NextResponse.json(
      {
        error: "Rate limit exceeded",
        message: "Too many requests. Please retry after a short wait.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds || 60),
        },
      }
    );

    // Preserve session cookies on 429 responses
    response.cookies.getAll().forEach((cookie) => {
      limitedResponse.cookies.set(cookie);
    });

    return limitedResponse;
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
