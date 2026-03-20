/**
 * eBay OAuth 2.0 — Authorization Code flow
 *
 * Used for user-level selling APIs (Sell Inventory, Sell Fulfillment).
 * Different from the client-credentials flow in lib/ebay/browse-api.ts
 * which is for app-level Browse API access only.
 */

import type { EbayTokenResponse, EbayUserIdentity } from "./types";

const EBAY_OAUTH_BASE =
  process.env.EBAY_ENVIRONMENT === "sandbox"
    ? "https://auth.sandbox.ebay.com/oauth2/authorize"
    : "https://auth.ebay.com/oauth2/authorize";

const EBAY_TOKEN_BASE =
  process.env.EBAY_ENVIRONMENT === "sandbox"
    ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
    : "https://api.ebay.com/identity/v1/oauth2/token";

const EBAY_REVOKE_URL =
  process.env.EBAY_ENVIRONMENT === "sandbox"
    ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token_revoke"
    : "https://api.ebay.com/identity/v1/oauth2/token_revoke";

const EBAY_IDENTITY_URL =
  process.env.EBAY_ENVIRONMENT === "sandbox"
    ? "https://apiz.sandbox.ebay.com/commerce/identity/v1/user/"
    : "https://apiz.ebay.com/commerce/identity/v1/user/";

export const EBAY_SCOPES = [
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.account.readonly",
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
  "https://api.ebay.com/oauth/api_scope/buy.order.readonly",
].join(" ");

/**
 * Returns true if the account's granted scopes are missing buy.order.readonly,
 * meaning the user needs to re-authorize to enable purchase tracking.
 */
export function needsBuyerScope(grantedScopes: string[]): boolean {
  return !grantedScopes.includes(
    "https://api.ebay.com/oauth/api_scope/buy.order.readonly"
  );
}

function getCredentials(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const redirectUri = process.env.EBAY_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_REDIRECT_URI must be set"
    );
  }
  return { clientId, clientSecret, redirectUri };
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

/**
 * Build the eBay consent URL to redirect the user to.
 * `state` should be a CSRF token stored in the session.
 */
export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = getCredentials();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: EBAY_SCOPES,
    state,
  });

  return `${EBAY_OAUTH_BASE}?${params.toString()}`;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCode(code: string): Promise<EbayTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getCredentials();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(EBAY_TOKEN_BASE, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`eBay token exchange failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<EbayTokenResponse>;
}

/**
 * Refresh an expired access token using the refresh token.
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<Pick<EbayTokenResponse, "access_token" | "expires_in">> {
  const { clientId, clientSecret } = getCredentials();

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: EBAY_SCOPES,
  });

  const res = await fetch(EBAY_TOKEN_BASE, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`eBay token refresh failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as EbayTokenResponse;
  return { access_token: data.access_token, expires_in: data.expires_in };
}

/**
 * Revoke an access or refresh token (called on disconnect).
 */
export async function revokeToken(token: string, tokenType: "access_token" | "refresh_token"): Promise<void> {
  const { clientId, clientSecret } = getCredentials();

  const body = new URLSearchParams({
    token,
    token_type_hint: tokenType,
  });

  await fetch(EBAY_REVOKE_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  }).catch(() => {
    // Best-effort — proceed with local deletion even if eBay revocation fails
  });
}

/**
 * Fetch the eBay user's identity (username + userId) using a valid access token.
 */
export async function fetchEbayIdentity(accessToken: string): Promise<EbayUserIdentity> {
  const res = await fetch(EBAY_IDENTITY_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`eBay identity fetch failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { userId?: string; username?: string };
  return {
    userId: data.userId ?? "",
    username: data.username ?? "",
  };
}
