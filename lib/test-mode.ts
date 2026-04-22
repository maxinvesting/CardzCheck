/**
 * Test mode utilities for bypassing authentication and payment checks during development.
 *
 * SECURITY: Test mode MUST only be active in local development.
 * Enabling it in production bypasses all authentication, feature gating, and rate
 * limiting — anyone can access the app as a fully-authenticated Pro user.
 *
 * Set NEXT_PUBLIC_TEST_MODE=true only in .env.local (never in .env.production).
 */
import type { User } from "@/types";

export function isTestMode(): boolean {
  const enabled = process.env.NEXT_PUBLIC_TEST_MODE === "true";

  // Safety guard: refuse to activate test mode in production.
  // This prevents accidental deployments with test mode enabled.
  if (enabled && process.env.NODE_ENV === "production") {
    console.error(
      "[SECURITY] NEXT_PUBLIC_TEST_MODE=true is set in a production environment. " +
        "Test mode bypasses all authentication — it has been disabled. " +
        "Remove this env var from your production deployment immediately."
    );
    return false;
  }

  return enabled;
}

/**
 * Returns a mock user object for test mode
 */
export function getTestUser() {
  const user: User = {
    id: "test-user-id",
    email: "test@example.com",
    name: "Test User",
    business_name: null,
    ebay_store_url: null,
    is_paid: true,
    stripe_customer_id: null,
    free_searches_used: 0,
    created_at: new Date().toISOString(),
    plan_selected: true,
  };
  return user;
}

/**
 * Returns a mock auth user for test mode
 */
export function getTestAuthUser() {
  return {
    id: "test-user-id",
    email: "test@example.com",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  };
}
