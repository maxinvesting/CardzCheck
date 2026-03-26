"use client";

import { createClient } from "@/lib/supabase/client";
import type { User } from "@/types";

const CACHE_TTL_MS = 30_000;

let cachedUser: User | null | undefined;
let cachedAt = 0;
let inflight: Promise<User | null> | null = null;

export function clearCurrentUserCache(): void {
  cachedUser = undefined;
  cachedAt = 0;
  inflight = null;
}

export async function getCurrentUserCached(options?: {
  force?: boolean;
}): Promise<User | null> {
  const force = options?.force === true;
  const now = Date.now();

  if (!force && cachedUser !== undefined && now - cachedAt < CACHE_TTL_MS) {
    return cachedUser;
  }

  if (!force && inflight) {
    return inflight;
  }

  inflight = (async () => {
    const supabase = createClient();
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !authUser) {
      cachedUser = null;
      cachedAt = Date.now();
      return null;
    }

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", authUser.id)
      .single();

    if (error || !data) {
      // Preserve previous cache on transient failures.
      if (cachedUser !== undefined) {
        return cachedUser;
      }
      return null;
    }

    cachedUser = data as User;
    cachedAt = Date.now();
    return cachedUser;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
