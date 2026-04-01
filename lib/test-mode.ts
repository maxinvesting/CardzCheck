/**
 * Test mode utilities for bypassing authentication and payment checks during development.
 *
 * SECURITY: Test mode is ALWAYS disabled in production regardless of the env var value.
 * The NEXT_PUBLIC_TEST_MODE env var must never be set to "true" in a production deployment.
 */
import type { User } from "@/types";

export function isTestMode(): boolean {
  // Hard production guard — cannot be overridden by env var
  if (process.env.NODE_ENV === "production") {
    if (process.env.NEXT_PUBLIC_TEST_MODE === "true") {
      const msg =
        "[SECURITY] CRITICAL: NEXT_PUBLIC_TEST_MODE=true in production! " +
        "Disable immediately. Test mode bypasses authentication checks.";
      console.error(msg);
      if (typeof window === "undefined") {
        // Server-side: throw to halt the request
        throw new Error(msg);
      }
    }
    return false;
  }

  return process.env.NEXT_PUBLIC_TEST_MODE === "true";
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
