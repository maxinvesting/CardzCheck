/**
 * Server-side Supabase clients — SERVER ONLY.
 * Do not import this file from client components ("use client").
 *
 * createClient()        — Uses the anon key + the user's session cookie.
 *                         Subject to Row-Level Security (RLS) policies.
 *                         Use for all normal user-scoped database operations.
 *
 * createServiceClient() — Uses the service role key, bypasses ALL RLS.
 *                         Use only when:
 *                           - No user session is available (Stripe/eBay webhooks)
 *                           - Admin operations that intentionally cross user boundaries
 *                           - Writing usage counters that need elevated access
 *                         Do NOT use where the anon client + RLS would suffice.
 *                         Do NOT expose service client results directly to user input.
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getLocalAuthUser } from "@/lib/single-user";
import {
  getSupabaseServiceRoleKey,
  requireSupabasePublicEnv,
} from "@/lib/supabase/env";

/**
 * Personal build: there is no login, so there is no session cookie and no user
 * JWT for RLS to key off. `createClient()` therefore returns a service-role
 * client (RLS bypassed) whose `auth` reports the fixed local user.
 *
 * This is what lets all ~140 API routes keep their existing
 * `const { data: { user } } = await supabase.auth.getUser()` preamble without
 * being rewritten one by one.
 *
 * This is only safe because the app is single-user and local. Do not host this
 * build publicly — every request would be treated as the owner.
 */
export async function createClient() {
  const client = await createServiceClient();
  const localUser = getLocalAuthUser();

  client.auth.getUser = (async () => ({
    data: { user: localUser },
    error: null,
  })) as unknown as typeof client.auth.getUser;

  client.auth.getSession = (async () => ({
    data: { session: { user: localUser } },
    error: null,
  })) as unknown as typeof client.auth.getSession;

  return client;
}

export async function createServiceClient() {
  if (process.env.NODE_ENV === "production") {
    console.warn("[supabase][service-role] Service client created — RLS bypassed", {
      stack: new Error().stack?.split("\n")[2]?.trim(), // caller info
    });
  }
  const { url } = requireSupabasePublicEnv();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  if (!serviceRoleKey) {
    throw new Error("Supabase service role env var is missing. Set SUPABASE_SERVICE_ROLE_KEY and restart the dev server.");
  }

  // Service-role operations must not inherit end-user auth cookies,
  // otherwise Supabase applies the user JWT and RLS blocks admin writes.
  return createSupabaseClient(
    url,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    }
  );
}
