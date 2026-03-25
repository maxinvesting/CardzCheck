import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { hasBusinessWorkspaceAccess } from "@/lib/business/workspace-access";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextParam = requestUrl.searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      let next = nextParam ?? "/dashboard";

      if (!nextParam) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const hasBusinessAccess = await hasBusinessWorkspaceAccess(
            supabase as any,
            user.id
          );
          if (hasBusinessAccess) {
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
