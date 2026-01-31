import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

type RateLimitConfig = {
  limit: number;
  windowMs: number;
};

type RateLimitResult = {
  limited: boolean;
  retryAfterSeconds?: number;
};

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  "/api/search": { limit: 60, windowMs: 60_000 },
  "/api/identify-card": { limit: 10, windowMs: 60_000 },
  "/api/grade-estimate": { limit: 10, windowMs: 60_000 },
  "/api/analyst": { limit: 20, windowMs: 60_000 },
};

const RATE_LIMIT_STORE = new Map<string, number[]>();

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim();
  }
  return request.headers.get("x-real-ip") ?? request.ip ?? "unknown";
}

function checkRateLimit(request: NextRequest, userId: string | null): RateLimitResult {
  const config = RATE_LIMITS[request.nextUrl.pathname];
  if (!config) {
    return { limited: false };
  }

  const now = Date.now();
  const key = `${getClientIp(request)}:${userId ?? "anon"}`;
  const windowStart = now - config.windowMs;
  const timestamps = RATE_LIMIT_STORE.get(key) ?? [];
  const recent = timestamps.filter((timestamp) => timestamp > windowStart);

  if (recent.length >= config.limit) {
    const oldest = recent[0] ?? now;
    const retryAfterMs = Math.max(config.windowMs - (now - oldest), 0);
    return { limited: true, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
  }

  recent.push(now);
  RATE_LIMIT_STORE.set(key, recent);
  return { limited: false };
}

export async function middleware(request: NextRequest) {
  const { response, userId } = await updateSession(request);
  const rateLimit = checkRateLimit(request, userId);

  if (rateLimit.limited) {
    const limitedResponse = NextResponse.json(
      {
        error: "Rate limit exceeded",
        message: "Too many requests. Please retry after a short wait.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds ?? 60),
        },
      }
    );

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
     * - api routes that don't need auth
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
