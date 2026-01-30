// Rate limiting for eBay API and scraper requests

import type { RateLimitState } from "./types";

// Rate limit configuration
const MIN_REQUEST_INTERVAL_MS = 2000; // 2 seconds between requests
const BACKOFF_BASE_MS = 5000; // 5 second base backoff
const MAX_BACKOFF_MS = 300000; // 5 minute max backoff
const ERROR_DECAY_MS = 60000; // Reset error count after 1 minute of success

// Global rate limit state
const rateLimitState: Record<string, RateLimitState> = {
  browse_api: { lastRequestTime: 0, consecutiveErrors: 0 },
  scraper: { lastRequestTime: 0, consecutiveErrors: 0 },
};

/**
 * Check if we should wait before making a request
 */
export function shouldWait(endpoint: "browse_api" | "scraper"): number {
  const state = rateLimitState[endpoint];
  const now = Date.now();

  // Check if we're blocked
  if (state.blockedUntil && now < state.blockedUntil) {
    return state.blockedUntil - now;
  }

  // Check minimum interval
  const timeSinceLastRequest = now - state.lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
    return MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;
  }

  return 0;
}

/**
 * Wait for rate limit if needed
 */
export async function waitForRateLimit(endpoint: "browse_api" | "scraper"): Promise<void> {
  const waitTime = shouldWait(endpoint);
  if (waitTime > 0) {
    console.log(`⏳ Rate limiting: waiting ${waitTime}ms before ${endpoint} request`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  // Update last request time
  rateLimitState[endpoint].lastRequestTime = Date.now();
}

/**
 * Record a successful request (resets error backoff)
 */
export function recordSuccess(endpoint: "browse_api" | "scraper"): void {
  const state = rateLimitState[endpoint];

  // Decay errors after successful request
  if (state.consecutiveErrors > 0) {
    state.consecutiveErrors = Math.max(0, state.consecutiveErrors - 1);
  }

  // Clear block
  state.blockedUntil = undefined;
}

/**
 * Record an error (increases backoff)
 */
export function recordError(endpoint: "browse_api" | "scraper", statusCode?: number): void {
  const state = rateLimitState[endpoint];
  state.consecutiveErrors++;

  // Calculate backoff
  const backoffMs = Math.min(
    BACKOFF_BASE_MS * Math.pow(2, state.consecutiveErrors - 1),
    MAX_BACKOFF_MS
  );

  // Extended backoff for rate limit responses
  if (statusCode === 429 || statusCode === 403) {
    state.blockedUntil = Date.now() + backoffMs * 2;
  } else {
    state.blockedUntil = Date.now() + backoffMs;
  }

  console.log(`⚠️ Rate limit: ${endpoint} blocked for ${backoffMs}ms (errors: ${state.consecutiveErrors})`);
}

/**
 * Check if we're currently rate limited
 */
export function isRateLimited(endpoint: "browse_api" | "scraper"): boolean {
  const state = rateLimitState[endpoint];
  return state.blockedUntil !== undefined && Date.now() < state.blockedUntil;
}

/**
 * Get current rate limit state (for debugging)
 */
export function getRateLimitState(): Record<string, RateLimitState> {
  return { ...rateLimitState };
}

/**
 * Reset rate limit state (for testing)
 */
export function resetRateLimitState(): void {
  rateLimitState.browse_api = { lastRequestTime: 0, consecutiveErrors: 0 };
  rateLimitState.scraper = { lastRequestTime: 0, consecutiveErrors: 0 };
}
