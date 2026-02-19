import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isTestMode } from "@/lib/test-mode";
import { hasActiveBusinessTier } from "@/lib/subscription-tier";

const PROTECTED_PATHS = [
  "/dashboard",
  "/collection",
  "/watchlist",
  "/business",
  "/account",
  "/settings",
  "/analyst",
];
const BUSINESS_ONLY_REDIRECT_PATHS = ["/collection", "/watchlist"];
const BUSINESS_REQUIRED_PATHS = ["/business"];

export async function updateSession(request: NextRequest) {
  if (isTestMode()) {
    return { response: NextResponse.next({ request }), userId: null };
  }

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
          // Must set on request AND rebuild response — required by Supabase SSR
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isProtected = PROTECTED_PATHS.some((p) =>
    request.nextUrl.pathname.startsWith(p)
  );

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", request.nextUrl.pathname);
    return { response: NextResponse.redirect(url), userId: null };
  }

  const isBusinessOnlyPath = BUSINESS_ONLY_REDIRECT_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );
  const isBusinessRequiredPath = BUSINESS_REQUIRED_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  const shouldCheckBusinessTier = Boolean(
    user && (isBusinessOnlyPath || isBusinessRequiredPath)
  );

  if (shouldCheckBusinessTier && user) {
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("tier, status, current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();

    const hasBusinessTier = hasActiveBusinessTier(subscription);

    if (isBusinessOnlyPath && hasBusinessTier) {
      const url = request.nextUrl.clone();
      url.pathname = "/business";
      url.searchParams.set("notice", "business_mode");
      return { response: NextResponse.redirect(url), userId: user.id };
    }

    if (isBusinessRequiredPath && !hasBusinessTier) {
      const url = request.nextUrl.clone();
      url.pathname = "/account";
      url.searchParams.set("notice", "business_required");
      return { response: NextResponse.redirect(url), userId: user.id };
    }
  }

  return { response: supabaseResponse, userId: user?.id ?? null };
}
