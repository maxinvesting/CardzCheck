import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isTestMode } from "@/lib/test-mode";
import {
  getMissingSupabasePublicEnvMessage,
  getSupabasePublicEnv,
} from "@/lib/supabase/env";

const PROTECTED_PATHS = ["/dashboard", "/collection", "/account", "/settings", "/analyst"];

function isProtected(pathname: string) {
  return PROTECTED_PATHS.some((p) => pathname.startsWith(p));
}

export async function updateSession(request: NextRequest) {
  if (isTestMode()) {
    return { response: NextResponse.next({ request }), userId: null };
  }

  const supabasePublicEnv = getSupabasePublicEnv();
  if (!supabasePublicEnv) {
    console.error(getMissingSupabasePublicEnvMessage());
    if (isProtected(request.nextUrl.pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", request.nextUrl.pathname);
      return { response: NextResponse.redirect(url), userId: null };
    }
    return { response: NextResponse.next({ request }), userId: null };
  }

  // Per Supabase SSR docs: supabaseResponse must be the response returned,
  // and cookies must be set on both request and response so session is forwarded.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    supabasePublicEnv.url,
    supabasePublicEnv.anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Set on request so downstream server components see the refreshed session
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Rebuild response with updated request cookies
          supabaseResponse = NextResponse.next({ request });
          // Set on response so browser receives updated cookies
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Do not add any logic between createServerClient and getUser().
  // getUser() refreshes the session and sets updated cookies via setAll above.
  const { data: { user } } = await supabase.auth.getUser();

  if (isProtected(request.nextUrl.pathname) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", request.nextUrl.pathname);
    return { response: NextResponse.redirect(url), userId: null };
  }

  return { response: supabaseResponse, userId: user?.id ?? null };
}
