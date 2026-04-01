/**
 * Authenticated eBay API client
 *
 * Reads the user's OAuth token from ebay_accounts, auto-refreshes
 * on 401 or when the token is within 5 minutes of expiry.
 */

import { createClient } from "@/lib/supabase/server";
import { refreshAccessToken } from "./oauth";

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

const EBAY_API_BASE =
  process.env.EBAY_ENVIRONMENT === "sandbox"
    ? "https://api.sandbox.ebay.com"
    : "https://api.ebay.com";

export async function getValidToken(userId: string): Promise<string> {
  const supabase = await createClient();

  const { data: account, error } = await supabase
    .from("ebay_accounts")
    .select("access_token, refresh_token, access_token_expires_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  if (!account) throw new Error("No connected eBay account found. Please connect your eBay account in Business Settings.");

  const expiresAt = new Date(account.access_token_expires_at).getTime();
  const needsRefresh = Date.now() >= expiresAt - TOKEN_EXPIRY_BUFFER_MS;

  if (!needsRefresh) {
    return account.access_token;
  }

  // Refresh the token
  const refreshed = await refreshAccessToken(account.refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  await supabase
    .from("ebay_accounts")
    .update({
      access_token: refreshed.access_token,
      access_token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return refreshed.access_token;
}

type FetchOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

/**
 * Make an authenticated request to the eBay API.
 * On 401, refreshes the token once and retries.
 */
export async function ebayFetch(
  userId: string,
  path: string,
  options: FetchOptions = {}
): Promise<Response> {
  const token = await getValidToken(userId);
  const url = path.startsWith("http") ? path : `${EBAY_API_BASE}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    ...options.headers,
  };

  const res = await fetch(url, { ...options, headers });

  // On 401, try refreshing once and retrying
  if (res.status === 401) {
    const supabase = await createClient();
    const { data: account } = await supabase
      .from("ebay_accounts")
      .select("refresh_token")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    if (!account) return res;

    const refreshed = await refreshAccessToken(account.refresh_token);
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

    await supabase
      .from("ebay_accounts")
      .update({
        access_token: refreshed.access_token,
        access_token_expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return fetch(url, {
      ...options,
      headers: {
        ...headers,
        Authorization: `Bearer ${refreshed.access_token}`,
      },
    });
  }

  return res;
}

/**
 * ebayFetch wrapper that throws on non-OK responses with the eBay error body.
 */
export async function ebayRequest<T>(
  userId: string,
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const res = await ebayFetch(userId, path, options);

  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new Error(`eBay API error ${res.status} at ${path}: ${body}`);
  }

  const text = await res.text();
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}
