/**
 * Test mode utilities for bypassing authentication and payment checks during development
 */
import type { User } from "@/types";

export function isTestMode(): boolean {
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
