import { NextResponse, type NextRequest } from "next/server";
import { LOCAL_USER_ID } from "@/lib/single-user";

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
  const pathname = request.nextUrl.pathname;
  const supabaseResponse = NextResponse.next({ request });

  // Personal build: no login, no session cookie, no auth enforcement. Every
  // request is the single local user, so there is nothing to verify or refresh
  // and no unauthenticated case to redirect.
  const userId = LOCAL_USER_ID;

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
