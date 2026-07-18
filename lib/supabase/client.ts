import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabasePublicEnv } from "@/lib/supabase/env";
import { getLocalAuthUser } from "@/lib/single-user";

let browserClient: SupabaseClient | undefined;

/**
 * Personal build: there is no login, so the browser has no Supabase session.
 *
 * Two consequences had to be handled together:
 *   1. `auth.getUser()` would return null, and every page's `if (!user)` guard
 *      would push to `/login` — a route that no longer exists.
 *   2. With no user JWT, RLS would reject every client-side query, so pages
 *      that read Supabase directly would render empty.
 *
 * Both are solved by using the service-role key in the browser and reporting
 * the fixed local user from `auth`.
 *
 * ⚠️ SECURITY: this bakes a service-role key (full database access, RLS
 * bypassed) into the client bundle. It is acceptable ONLY because this build
 * runs on localhost for one person. Do NOT expose the dev server beyond this
 * machine, deploy this build, or share the built assets — the Supabase project
 * is internet-facing, and a leaked service key exposes the entire database.
 */
export function createClient() {
  if (browserClient) {
    return browserClient;
  }

  const { url } = requireSupabasePublicEnv();
  const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY is missing. The personal build needs it " +
        "for client-side database access without a login session. Set it in .env.local."
    );
  }

  browserClient = createSupabaseClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const localUser = getLocalAuthUser();

  browserClient.auth.getUser = (async () => ({
    data: { user: localUser },
    error: null,
  })) as unknown as SupabaseClient["auth"]["getUser"];

  browserClient.auth.getSession = (async () => ({
    data: { session: { user: localUser } },
    error: null,
  })) as unknown as SupabaseClient["auth"]["getSession"];

  return browserClient;
}
