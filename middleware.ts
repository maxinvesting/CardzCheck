/**
 * Next.js Edge Middleware
 *
 * Responsibilities:
 *  1. Session refresh  — keeps Supabase auth cookies valid (updateSession)
 *  2. Auth enforcement — updateSession redirects unauthenticated users to /login
 *  3. Workspace routing — updateSession redirects business users to /business/*
 *  4. Rate limiting    — distributed sliding-window limits via Upstash Redis
 *
 * RATE LIMITING:
 *   Primary: Upstash Redis (lib/rate-limit.ts) — distributed across all Vercel
 *   instances, atomic, survives redeploys. Requires UPSTASH_REDIS_REST_URL and
 *   UPSTASH_REDIS_REST_TOKEN env vars.
 *
 *   Fallback: In-memory sliding window (below) — used automatically when Upstash
 *   is not configured (e.g. local development). Per-instance only.
 *
 * IP SPOOFING:
 *   On Vercel, x-forwarded-for is set by the platform and cannot be injected by
 *   clients — trusting the first entry is safe. When Upstash is configured, limits
 *   are keyed by user ID (authenticated) or IP (anonymous), preventing bypass via
 *   proxy rotation.
 */

import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  checkDistributedRateLimit,
  buildRateLimitHeaders,
  ENDPOINT_RATE_LIMITS,
} from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// In-memory fallback limiter
// Used when Upstash is not configured (local dev / CI).
// Per-instance and not distributed — do NOT rely on this in production.
// ---------------------------------------------------------------------------

type InMemoryConfig = { limit: number; windowMs: number };

// Mirrors the limits in lib/rate-limit.ts — keep in sync
const INMEMORY_RATE_LIMITS: Record<string, InMemoryConfig> = {
  "/api/search":              { limit: 60, windowMs: 60_000 },
  "/api/identify-card":       { limit: 10, windowMs: 60_000 },
  "/api/grade-estimate":      { limit: 10, windowMs: 60_000 },
  "/api/grade-estimate/start":{ limit: 10, windowMs: 60_000 },
  "/api/analyst":             { limit: 20, windowMs: 60_000 },
  "/api/business/consultant": { limit: 20, windowMs: 60_000 },
};

// Sliding-window store: "endpoint:ip:userId" → sorted array of request timestamps
const INMEMORY_STORE = new Map<string, number[]>();

function getClientIp(request: NextRequest): string {
  // On Vercel, x-forwarded-for is set by the platform — safe to trust
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

type InMemoryResult = { limited: boolean; retryAfterSeconds: number };

function checkInMemoryRateLimit(
  pathname: string,
  ip: string,
  userId: string | null
): InMemoryResult {
  const config = INMEMORY_RATE_LIMITS[pathname];
  if (!config) return { limited: false, retryAfterSeconds: 0 };

  const now = Date.now();
  // Key includes endpoint so limits don't bleed across different routes
  const key = `${pathname}:${ip}:${userId ?? "anon"}`;
  const windowStart = now - config.windowMs;

  const timestamps = INMEMORY_STORE.get(key) ?? [];
  const recent = timestamps.filter((t) => t > windowStart);

  if (recent.length >= config.limit) {
    const oldest = recent[0] ?? now;
    const retryAfterMs = Math.max(config.windowMs - (now - oldest), 0);
    return { limited: true, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
  }

  recent.push(now);
  INMEMORY_STORE.set(key, recent);
  return { limited: false, retryAfterSeconds: 0 };
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export async function middleware(request: NextRequest) {
  // 1. Update Supabase session (handles auth + workspace routing)
  const { response, userId } = await updateSession(request);

  const pathname = request.nextUrl.pathname;
  const ip = getClientIp(request);

  // 2. Check rate limits only for configured endpoints
  const isRateLimitedEndpoint =
    pathname in ENDPOINT_RATE_LIMITS ||
    pathname in INMEMORY_RATE_LIMITS;

  if (isRateLimitedEndpoint) {
    // Try distributed limiter first (Upstash)
    const distributed = await checkDistributedRateLimit(pathname, ip, userId);

    let limited = !distributed.allowed;
    let retryAfterSecs = distributed.retryAfterSecs;

    // If Upstash isn't configured, fall back to in-memory
    if (distributed.usingFallback) {
      const fallback = checkInMemoryRateLimit(pathname, ip, userId);
      limited = fallback.limited;
      retryAfterSecs = fallback.retryAfterSeconds;
    }

    if (limited) {
      const headers = distributed.usingFallback
        ? { "Retry-After": String(retryAfterSecs) }
        : buildRateLimitHeaders(distributed, pathname);

      const limitedResponse = NextResponse.json(
        {
          error: "rate_limit_exceeded",
          message: `Too many requests. Please retry after ${retryAfterSecs} seconds.`,
          retryAfter: retryAfterSecs,
        },
        { status: 429, headers }
      );

      // Forward session cookies so auth state isn't lost on retry
      response.cookies.getAll().forEach((cookie) => {
        limitedResponse.cookies.set(cookie);
      });

      return limitedResponse;
    }

    // Attach rate limit headers to successful responses so clients can backoff gracefully
    if (!distributed.usingFallback) {
      const rlHeaders = buildRateLimitHeaders(distributed, pathname);
      Object.entries(rlHeaders).forEach(([key, value]) => {
        response.headers.set(key, String(value));
      });
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static  (static files)
     * - _next/image   (image optimization)
     * - favicon.ico
     * - public files  (*.svg, *.png, *.jpg, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
