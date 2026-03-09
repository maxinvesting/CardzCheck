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

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isTestMode } from "@/lib/test-mode";
import {
  getSupabaseServiceRoleKey,
  requireSupabasePublicEnv,
} from "@/lib/supabase/env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function createClient() {
  // In test mode, return a mock client that always returns test user
  if (isTestMode()) {
    return {
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: null,
        }),
        getSession: async () => ({
          data: { session: null },
          error: null,
        }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    } as any;
  }

  const cookieStore = await cookies();
  const { url, anonKey } = requireSupabasePublicEnv();

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  );
}

export async function createServiceClient() {
  const cookieStore = await cookies();
  const { url } = requireSupabasePublicEnv();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  if (!serviceRoleKey) {
    throw new Error("Supabase service role env var is missing. Set SUPABASE_SERVICE_ROLE_KEY and restart the dev server.");
  }

  return createServerClient(
    url,
    serviceRoleKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignored
          }
        },
      },
    }
  );
}
