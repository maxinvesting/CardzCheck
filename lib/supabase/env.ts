// IMPORTANT: NEXT_PUBLIC_* vars must be referenced with literal dot-notation for
// Next.js to bake them into the client bundle at build time. Dynamic string-key
// lookups like process.env["NEXT_PUBLIC_SUPABASE_URL"] do NOT work in the browser.

function firstNonEmpty(...values: (string | undefined)[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

export function getSupabasePublicEnv() {
  // Literal references — required for Next.js static replacement in client bundle
  const url = firstNonEmpty(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_URL
  );
  const anonKey = firstNonEmpty(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_ANON_KEY
  );

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

export function getSupabaseServiceRoleKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
}

export function getMissingSupabasePublicEnvMessage() {
  return "Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment, then redeploy.";
}
