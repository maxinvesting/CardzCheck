import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { hasActiveBusinessTier } from "@/lib/subscription-tier";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextParam = requestUrl.searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      let next = nextParam ?? "/comps";

      if (!nextParam) {
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
