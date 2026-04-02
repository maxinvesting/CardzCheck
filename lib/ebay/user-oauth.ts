/**
 * eBay OAuth utilities for user-linked accounts.
 *
 * The app eBay credentials (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET) are used to
 * run the Authorization Code flow. The resulting per-user access and refresh
 * tokens are stored in `public.users` and NEVER returned to the client.
 *
 * Access tokens expire after 2 hours; refresh tokens last 18 months.
 */

const EBAY_OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_AUTH_URL = "https://auth.ebay.com/oauth2/authorize";

export const EBAY_USER_SCOPES = [
  "https://api.ebay.com/oauth/api_scope/sell.inventory.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
].join(" ");

function getCredentials() {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("EBAY_CLIENT_ID and EBAY_CLIENT_SECRET must be set");
  }
  return { clientId, clientSecret };
}

function getBaseCredentials(clientId: string, clientSecret: string) {
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

/**
 * Build the eBay authorization URL to redirect the user to.
 * `state` should be a CSRF token (e.g. userId hash) validated on callback.
 */
export function buildEbayAuthUrl(state: string): string {
  const { clientId } = getCredentials();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/ebay/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: EBAY_USER_SCOPES,
    state,
  });

  return `${EBAY_AUTH_URL}?${params.toString()}`;
}

export interface EbayUserTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds until access_token expires
  token_type: string;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCodeForTokens(code: string): Promise<EbayUserTokens> {
  const { clientId, clientSecret } = getCredentials();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/ebay/callback`;
  const credentials = getBaseCredentials(clientId, clientSecret);

  const res = await fetch(EBAY_OAUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay token exchange failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<EbayUserTokens>;
}

/**
 * Refresh an expiring access token using the stored refresh token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<EbayUserTokens> {
  const { clientId, clientSecret } = getCredentials();
  const credentials = getBaseCredentials(clientId, clientSecret);

  const res = await fetch(EBAY_OAUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: EBAY_USER_SCOPES,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay token refresh failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<EbayUserTokens>;
}

/**
 * Fetch the eBay username for the authenticated user (used to confirm connection).
 */
export async function fetchEbayUsername(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://apiz.ebay.com/commerce/identity/v1/user/", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.username as string | undefined) ?? null;
  } catch {
    return null;
  }
}

export type EbayUserRow = {
  ebay_oauth_access_token: string | null;
  ebay_oauth_refresh_token: string | null;
  ebay_oauth_token_expires_at: string | null;
  ebay_oauth_connected_username: string | null;
};

/**
 * Get a valid eBay access token for the user, refreshing if necessary.
 * Returns null if the user has no connected eBay account.
 *
 * Call this before every eBay API call that needs user-level auth.
 */
export async function getValidUserAccessToken(
  supabase: any, // typed as any to avoid circular imports
  userId: string
): Promise<string | null> {
  const { data: userData, error } = await supabase
    .from("users")
    .select(
      "ebay_oauth_access_token, ebay_oauth_refresh_token, ebay_oauth_token_expires_at"
    )
    .eq("id", userId)
    .maybeSingle();

  if (error || !userData) return null;

  const row = userData as EbayUserRow;
  if (!row.ebay_oauth_access_token || !row.ebay_oauth_refresh_token) return null;

  // Check if access token is still valid (with 5-min buffer)
  const expiresAt = row.ebay_oauth_token_expires_at
    ? new Date(row.ebay_oauth_token_expires_at).getTime()
    : 0;
  const nowMs = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  if (expiresAt > nowMs + fiveMinutes) {
    // Token still valid
    return row.ebay_oauth_access_token;
  }

  // Token expired or expiring soon — refresh
  try {
    const refreshed = await refreshAccessToken(row.ebay_oauth_refresh_token);
    const newExpiresAt = new Date(nowMs + refreshed.expires_in * 1000).toISOString();

    await supabase
      .from("users")
      .update({
        ebay_oauth_access_token: refreshed.access_token,
        ebay_oauth_token_expires_at: newExpiresAt,
        ...(refreshed.refresh_token
          ? { ebay_oauth_refresh_token: refreshed.refresh_token }
          : {}),
      })
      .eq("id", userId);

    return refreshed.access_token;
  } catch (err) {
    console.error("Failed to refresh eBay access token:", err);
    return null;
  }
}

/**
 * Exponential backoff helper for eBay rate-limited calls.
 */
export async function withEbayBackoff<T>(
  fn: () => Promise<Response>,
  maxRetries = 3
): Promise<Response> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    const res = await fn();
    if (res.status !== 429) return res;
    attempt++;
    if (attempt > maxRetries) return res;
    const delay = Math.pow(2, attempt) * 500; // 1s, 2s, 4s
    console.warn(`eBay rate limited (429). Retrying in ${delay}ms (attempt ${attempt})...`);
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error("eBay API rate limit exceeded after max retries");
}
