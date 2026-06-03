import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isTestMode } from "@/lib/test-mode";
import {
  getMissingSupabasePublicEnvMessage,
  getSupabasePublicEnv,
} from "@/lib/supabase/env";

const PROTECTED_PATHS = [
  "/dashboard",
  "/collection",
  "/watchlist",
  "/business",
  "/account",
  "/settings",
  "/analyst",
];

type RedirectRule = {
  from: string;
  to: string;
};

// Post PR C2b: the only canonical nav is /business/*. Legacy personal-mode
// paths redirect to their business equivalent for any logged-in user. This
// keeps old bookmarks, email links, and external referrers working.
const LEGACY_TO_BUSINESS_REDIRECTS: RedirectRule[] = [
  { from: "/comps", to: "/business/comps" },
  { from: "/grade-hub", to: "/business/grade-hub" },
  { from: "/grade-probability", to: "/business/grade-hub" },
  { from: "/grade-estimator", to: "/business/grade-hub" },
  { from: "/analyst", to: "/business/consultant" },
  { from: "/dashboard", to: "/business" },
  { from: "/collection", to: "/business/ledger" },
  { from: "/watchlist", to: "/business/ledger" },
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function findRedirect(pathname: string, rules: RedirectRule[]): string | null {
  for (const rule of rules) {
    if (pathname === rule.from) {
      return rule.to;
    }
    if (pathname.startsWith(`${rule.from}/`)) {
      return `${rule.to}${pathname.slice(rule.from.length)}`;
    }
  }
  return null;
}

export async function updateSession(request: NextRequest) {
  if (isTestMode()) {
    return { response: NextResponse.next({ request }), userId: null };
  }

  const pathname = request.nextUrl.pathname;
  let supabaseResponse = NextResponse.next({ request });

  const supabasePublicEnv = getSupabasePublicEnv();
  if (!supabasePublicEnv) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[middleware] ${getMissingSupabasePublicEnvMessage()}`);
    }
    return { response: supabaseResponse, userId: null };
  }

  const supabase = createServerClient(
    supabasePublicEnv.url,
    supabasePublicEnv.anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Use getClaims() instead of getUser() for auth in middleware.
  //
  // getUser() makes a network round-trip to the Supabase Auth server on EVERY
  // request to validate the token — adding latency to every navigation.
  //
  // getClaims() verifies the JWT *locally* (signature + expiry) when the project
  // uses asymmetric JWT signing keys, eliminating that round-trip. If the token
  // is symmetric (legacy HS256) or WebCrypto is unavailable, it transparently
  // falls back to getUser(), so this is never less safe. It also still calls
  // getSession() internally, preserving auth-cookie refresh (token rotation).
  const {
    data: claimsData,
  } = await supabase.auth.getClaims();

  // `sub` is the authenticated user id. Absent claims == unauthenticated.
  const userId = claimsData?.claims?.sub ?? null;

  const isProtected = PROTECTED_PATHS.some((path) => matchesPrefix(pathname, path));

  if (isProtected && !userId) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return { response: NextResponse.redirect(url), userId: null };
  }

  if (!userId) {
    return { response: supabaseResponse, userId: null };
  }

  // Allow invite acceptance flow before the user is a business member.
  if (matchesPrefix(pathname, "/business/invite")) {
    return { response: supabaseResponse, userId };
  }

  // Single nav post PR C2b: rewrite any legacy personal-mode path to its
  // business equivalent regardless of subscription tier. The receiving
  // /business/* route still gates features per tier via lib/access.ts.
  const redirectPath = findRedirect(pathname, LEGACY_TO_BUSINESS_REDIRECTS);
  if (redirectPath) {
    const url = request.nextUrl.clone();
    url.pathname = redirectPath;
    return { response: NextResponse.redirect(url), userId };
  }

  return { response: supabaseResponse, userId };
}
