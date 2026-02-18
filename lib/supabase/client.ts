import { createBrowserClient } from "@supabase/ssr";
import {
  getMissingSupabasePublicEnvMessage,
  getSupabasePublicEnv,
} from "@/lib/supabase/env";

function getBrowserStorage() {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

type SupabaseLockFn = (name: string, acquireTimeout: number, fn: () => Promise<unknown>) => Promise<unknown>;
let hasWarnedMissingEnv = false;

export function createClient() {
  const supabasePublicEnv = getSupabasePublicEnv();
  const hasEnv = Boolean(supabasePublicEnv);

  const noOpLock: SupabaseLockFn = async (_name, _acquireTimeout, fn) => await fn();
  const disabledFetch: typeof fetch = async () => {
    throw new Error(getMissingSupabasePublicEnvMessage());
  };

  if (!hasEnv && typeof window !== "undefined" && !hasWarnedMissingEnv) {
    hasWarnedMissingEnv = true;
    console.warn(getMissingSupabasePublicEnvMessage());
  }

  return createBrowserClient(
    supabasePublicEnv?.url ?? "https://placeholder.supabase.co",
    supabasePublicEnv?.anonKey ?? "missing-env-anon-key",
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: getBrowserStorage(),
        // Avoid browser lock-manager deadlocks seen in some webviews/embedded browsers.
        lock: noOpLock,
      },
      global: hasEnv
        ? undefined
        : {
            // Fail fast with a clear message instead of hard-crashing during render.
            fetch: disabledFetch,
          },
    }
  );
}
