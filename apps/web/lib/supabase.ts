import { createClient } from "@supabase/supabase-js";
import { publicConfig } from "./env";

let browserClient: ReturnType<typeof createClient> | null = null;

export function getBrowserSupabase() {
  if (!publicConfig.supabaseUrl || !publicConfig.supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  if (!browserClient) {
    browserClient = createClient(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey, {
      auth: { persistSession: false },
    });
  }

  return browserClient;
}

export function getAdminSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
