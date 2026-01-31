import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  checkRateLimit,
  rateLimitResponse,
  rateLimitHeaders,
  RATE_LIMITS,
} from "@/lib/api-rate-limiter";

// Endpoints that need rate limiting
const RATE_LIMITED_ENDPOINTS = [
  "/api/identify-card",
  "/api/grade-estimate",
  "/api/analyst",
  "/api/search",
];

function getClientIP(request: NextRequest): string {
  // Vercel/Cloudflare provide these headers
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  // Fallback for local development
  return "127.0.0.1";
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Check if this is a rate-limited API endpoint
  const rateLimitedEndpoint = RATE_LIMITED_ENDPOINTS.find((ep) =>
    pathname.startsWith(ep)
  );

  if (rateLimitedEndpoint) {
    const ip = getClientIP(request);

    // Try to get user ID from cookie (for logged-in users)
    // This provides more granular rate limiting
    let userId: string | undefined;
    const supabaseAuthCookie = request.cookies.get("sb-access-token")?.value;
    if (supabaseAuthCookie) {
      try {
        // Extract user ID from JWT payload (base64 decode middle part)
        const parts = supabaseAuthCookie.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          userId = payload.sub;
        }
      } catch {
        // Ignore parse errors - will use IP-only limiting
      }
    }

    const result = checkRateLimit(rateLimitedEndpoint, ip, userId);

    if (!result.allowed) {
      return rateLimitResponse(result, rateLimitedEndpoint);
    }

    // Add rate limit headers to successful responses
    const response = await updateSession(request);
    const config = RATE_LIMITS[rateLimitedEndpoint];
    const headers = rateLimitHeaders(result, config);

    // Add headers to response
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  }

  // Non-rate-limited routes: just handle session
  return await updateSession(request);
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
