import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { hasActiveBusinessTier } from "@/lib/subscription-tier";

function sanitizeNextPath(nextParam: string | null): string | null {
  if (!nextParam) return null;

  const trimmed = nextParam.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;

  try {
    const parsed = new URL(trimmed, "http://localhost");
    if (parsed.origin !== "http://localhost") {
      return null;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextParam = requestUrl.searchParams.get("next");
  const safeNextPath = sanitizeNextPath(nextParam);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      let next = safeNextPath ?? "/dashboard";

      if (!safeNextPath) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data: sub } = await supabase
            .from("subscriptions")
            .select("tier, status, current_period_end")
            .eq("user_id", user.id)
            .maybeSingle();

          if (hasActiveBusinessTier(sub)) {
            next = "/business";
          }
        }
      }

      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  // Return the user to an error page with some instructions
  return NextResponse.redirect(new URL("/login?error=auth", requestUrl.origin));
}
