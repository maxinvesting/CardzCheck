import { createBrowserClient } from "@supabase/ssr";

function getBrowserStorage() {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

type SupabaseLockFn = (name: string, acquireTimeout: number, fn: () => Promise<unknown>) => Promise<unknown>;

export function createClient() {
  const noOpLock: SupabaseLockFn = async (_name, _acquireTimeout, fn) => await fn();

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: getBrowserStorage(),
        // Avoid browser lock-manager deadlocks seen in some webviews/embedded browsers.
        lock: noOpLock,
      },
    }
  );
}
