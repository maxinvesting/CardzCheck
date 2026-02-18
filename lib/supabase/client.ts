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
let hasWarnedMissingEnv = false;

function getMissingEnvMessage() {
  return "Supabase env vars are missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local (or .env) and restart the dev server.";
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasEnv = Boolean(url && anonKey);

  const noOpLock: SupabaseLockFn = async (_name, _acquireTimeout, fn) => await fn();
  const disabledFetch: typeof fetch = async () => {
    throw new Error(getMissingEnvMessage());
  };

  if (!hasEnv && typeof window !== "undefined" && !hasWarnedMissingEnv) {
    hasWarnedMissingEnv = true;
    console.warn(getMissingEnvMessage());
  }

  return createBrowserClient(
    url ?? "https://placeholder.supabase.co",
    anonKey ?? "missing-env-anon-key",
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
