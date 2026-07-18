/**
 * Single-user identity for the personal build.
 *
 * CardzCheck no longer has signup, login, or multi-tenancy. It runs on one
 * machine for one person, so every request is attributed to this fixed user.
 *
 * This id is the real Supabase auth user that already owns all existing rows
 * (collection_items, business_sales, business_trades, …). It must not be
 * changed casually — every row in the database is keyed to it, and pointing
 * this at a different id would make the app look empty.
 */
export const LOCAL_USER_ID = "67f88f6d-d9ec-4b7e-b556-fabf3ca772be";
export const LOCAL_USER_EMAIL = "maxwellmario97@gmail.com";

/** Shape matching the subset of a Supabase auth user the app actually reads. */
export function getLocalAuthUser() {
  return {
    id: LOCAL_USER_ID,
    email: LOCAL_USER_EMAIL,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-23T22:33:07.531Z",
  };
}
