import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
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
