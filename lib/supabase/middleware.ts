import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isTestMode } from "@/lib/test-mode";
import { hasBusinessWorkspaceAccess } from "@/lib/business/workspace-access";

const PROTECTED_PATHS = [
  "/dashboard",
  "/collection",
  "/watchlist",
  "/business",
  "/account",
  "/settings",
  "/analyst",
];

const PERSONAL_WORKSPACE_PATHS = [
  "/dashboard",
  "/collection",
  "/watchlist",
  "/comps",
  "/grade-hub",
  "/grade-probability",
  "/grade-estimator",
  "/help",
  "/shop",
  "/card",
  "/analyst",
];

type RedirectRule = {
  from: string;
  to: string;
};

const PERSONAL_TO_BUSINESS_REDIRECTS: RedirectRule[] = [
  { from: "/comps", to: "/business/comps" },
  { from: "/grade-hub", to: "/business/grade-hub" },
  { from: "/grade-probability", to: "/business/grade-hub" },
  { from: "/grade-estimator", to: "/business/grade-hub" },
  { from: "/analyst", to: "/business/consultant" },
  { from: "/dashboard", to: "/business" },
  { from: "/collection", to: "/business" },
  { from: "/watchlist", to: "/business" },
];

const BUSINESS_TO_PERSONAL_REDIRECTS: RedirectRule[] = [
  { from: "/business/comps", to: "/comps" },
  { from: "/business/grade-hub", to: "/grade-hub" },
  { from: "/business/grade-probability", to: "/grade-hub" },
  { from: "/business/grade-estimator", to: "/grade-hub" },
  { from: "/business/consultant", to: "/analyst" },
  { from: "/business/analyst", to: "/analyst" },
  { from: "/business/settings", to: "/settings" },
  { from: "/business", to: "/dashboard" },
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

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected = PROTECTED_PATHS.some((path) => matchesPrefix(pathname, path));

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return { response: NextResponse.redirect(url), userId: null };
  }

  if (!user) {
    return { response: supabaseResponse, userId: null };
  }

  const shouldResolveWorkspace =
    matchesPrefix(pathname, "/business") ||
    PERSONAL_WORKSPACE_PATHS.some((path) => matchesPrefix(pathname, path));

  // Allow invite acceptance flow before the user is a business member.
  if (matchesPrefix(pathname, "/business/invite")) {
    return { response: supabaseResponse, userId: user.id };
  }

  if (!shouldResolveWorkspace) {
    return { response: supabaseResponse, userId: user.id };
  }

  const hasBusinessTier = await hasBusinessWorkspaceAccess(
    supabase as any,
    user.id
  );

  if (hasBusinessTier) {
    const redirectPath = findRedirect(pathname, PERSONAL_TO_BUSINESS_REDIRECTS);
    if (redirectPath) {
      const url = request.nextUrl.clone();
      url.pathname = redirectPath;
      return { response: NextResponse.redirect(url), userId: user.id };
    }
    return { response: supabaseResponse, userId: user.id };
  }

  if (matchesPrefix(pathname, "/business")) {
    const redirectPath = findRedirect(pathname, BUSINESS_TO_PERSONAL_REDIRECTS) ?? "/dashboard";
    const url = request.nextUrl.clone();
    url.pathname = redirectPath;
    return { response: NextResponse.redirect(url), userId: user.id };
  }

  return { response: supabaseResponse, userId: user.id };
}
