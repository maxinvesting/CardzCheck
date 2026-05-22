import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabasePublicEnv } from "@/lib/supabase/env";

type LockFunc = (
  name: string,
  acquireTimeout: number,
  fn: () => Promise<unknown>
) => Promise<unknown>;

/** Avoid Navigator LockManager races during Next.js HMR / Strict Mode in dev. */
const devLockNoOp: LockFunc = async (_name, _acquireTimeout, fn) => fn();

let browserClient: SupabaseClient | undefined;

export function createClient() {
  if (browserClient) {
    return browserClient;
  }

  const { url, anonKey } = requireSupabasePublicEnv();

  browserClient = createBrowserClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== "undefined" ? window.localStorage : undefined,
        ...(process.env.NODE_ENV === "development" ? { lock: devLockNoOp } : {}),
      },
    }
  );

  return browserClient;
}
