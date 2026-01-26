/**
 * Test mode utilities for bypassing authentication and payment checks during development
 */

export function isTestMode(): boolean {
  return process.env.NEXT_PUBLIC_TEST_MODE === "true";
}

/**
 * Returns a mock user object for test mode
 */
export function getTestUser() {
  return {
    id: "test-user-id",
    email: "test@example.com",
    name: "Test User",
    is_paid: true,
    stripe_customer_id: null,
    free_searches_used: 0,
    created_at: new Date().toISOString(),
    plan_selected: true,
  };
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
