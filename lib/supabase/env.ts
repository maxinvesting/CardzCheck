const SUPABASE_URL_ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"] as const;
const SUPABASE_ANON_KEY_ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY"] as const;
const SUPABASE_SERVICE_ROLE_ENV_KEYS = ["SUPABASE_SERVICE_ROLE_KEY"] as const;

function readFirstNonEmptyEnv(envKeys: readonly string[]): string | null {
  for (const envKey of envKeys) {
    const rawValue = process.env[envKey];
    if (typeof rawValue === "string" && rawValue.trim().length > 0) {
      return rawValue.trim();
    }
  }
  return null;
}

export function getSupabasePublicEnv() {
  const url = readFirstNonEmptyEnv(SUPABASE_URL_ENV_KEYS);
  const anonKey = readFirstNonEmptyEnv(SUPABASE_ANON_KEY_ENV_KEYS);

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

export function requireSupabasePublicEnv() {
  const supabasePublicEnv = getSupabasePublicEnv();
  if (!supabasePublicEnv) {
    throw new Error(getMissingSupabasePublicEnvMessage());
  }
  return supabasePublicEnv;
}

export function getSupabaseServiceRoleKey() {
  return readFirstNonEmptyEnv(SUPABASE_SERVICE_ROLE_ENV_KEYS);
}

export function getMissingSupabasePublicEnvMessage() {
  return "Supabase env vars are missing. Set one URL key (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL) and one anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY), then restart the dev server.";
}
