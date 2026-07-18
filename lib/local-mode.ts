/**
 * Single-user / personal build switch.
 *
 * CardzCheck was originally a multi-tenant SaaS with free/business/business_pro
 * subscription tiers enforced through lib/access.ts. It now runs as personal
 * software on a local machine, so every paid feature is unlocked and no
 * subscription is required.
 *
 * This is deliberately NOT lib/test-mode.ts. Test mode also stubs out
 * authentication and returns a fake `test-user-id`, which would hide the real
 * Supabase account's data. Unlimited access keeps real auth and the real user
 * id intact — it only removes the entitlement checks layered on top.
 *
 * Defaults to ON. Set NEXT_PUBLIC_UNLIMITED_ACCESS=false to restore the
 * original tier gating (e.g. if this is ever hosted publicly again).
 */
export function isUnlimitedAccess(): boolean {
  return process.env.NEXT_PUBLIC_UNLIMITED_ACCESS !== "false";
}
