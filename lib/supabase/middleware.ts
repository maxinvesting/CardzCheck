import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isTestMode } from "@/lib/test-mode";
import { logDebug } from "@/lib/logging";

export async function updateSession(request: NextRequest) {
  // Bypass auth checks in test mode
  if (isTestMode()) {
    logDebug("🧪 TEST MODE: Bypassing authentication checks");
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired - this is critical for maintaining the session
  const { data: { session } } = await supabase.auth.getSession();

  // Get user after session refresh
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Debug logging
  if (request.nextUrl.pathname.startsWith("/dashboard") ||
      request.nextUrl.pathname.startsWith("/collection") ||
      request.nextUrl.pathname.startsWith("/settings") ||
      request.nextUrl.pathname.startsWith("/analyst")) {
    logDebug("Middleware check:", {
      path: request.nextUrl.pathname,
      hasSession: !!session,
      hasUser: !!user,
      cookies: request.cookies.getAll().map(c => c.name),
    });
  }

  // Protected routes
  const protectedPaths = ["/dashboard", "/collection", "/account", "/settings", "/analyst"];
  const isProtectedPath = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (isProtectedPath && !user) {
    logDebug("Redirecting to login - no user found");
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
