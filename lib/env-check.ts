/**
 * Server startup environment validation.
 *
 * Called from instrumentation.ts on Node.js runtime (once per cold start).
 * Logs CRITICAL errors for missing required secrets — does NOT throw, because
 * throwing here would make Vercel deployment rollbacks impossible. Instead,
 * errors surface in Vercel logs and any connected monitoring (e.g. Sentry).
 *
 * Required vars: the app will fail at runtime if these are absent.
 * Warning vars: features degrade or are disabled without them.
 */

type EnvVar = { name: string; description: string };

const REQUIRED: EnvVar[] = [
  { name: "NEXT_PUBLIC_SUPABASE_URL",    description: "Supabase project URL" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", description: "Supabase anon/public key" },
  { name: "SUPABASE_SERVICE_ROLE_KEY",   description: "Supabase service role key (bypasses RLS — keep secret)" },
  { name: "STRIPE_SECRET_KEY",           description: "Stripe secret key for checkout and billing" },
  { name: "ANTHROPIC_API_KEY",           description: "Anthropic API key for AI grading and analyst features" },
];

const RECOMMENDED: EnvVar[] = [
  { name: "OWNER_EMAIL",              description: "Bootstrap owner email for admin access before DB roles are set" },
  { name: "STRIPE_WEBHOOK_SECRET",    description: "Stripe webhook signing secret (required for billing events)" },
  { name: "EBAY_CLIENT_ID",           description: "eBay OAuth app client ID (required for seller features)" },
  { name: "EBAY_CLIENT_SECRET",       description: "eBay OAuth app client secret (required for seller features)" },
  { name: "EBAY_VERIFICATION_TOKEN",  description: "eBay webhook verification token" },
  { name: "CRON_SECRET",              description: "Secret for protecting cron job endpoints" },
  { name: "UPSTASH_REDIS_REST_URL",   description: "Upstash Redis URL for distributed rate limiting" },
  { name: "UPSTASH_REDIS_REST_TOKEN", description: "Upstash Redis token for distributed rate limiting" },
];

export function validateEnv(): void {
  const missing: string[] = [];

  for (const v of REQUIRED) {
    const value = process.env[v.name];
    if (!value || !value.trim()) {
      missing.push(v.name);
      console.error(`[env-check] ❌ CRITICAL: Missing required env var ${v.name} — ${v.description}`);
    }
  }

  for (const v of RECOMMENDED) {
    const value = process.env[v.name];
    if (!value || !value.trim()) {
      console.warn(`[env-check] ⚠️  WARNING: Missing recommended env var ${v.name} — ${v.description}`);
    }
  }

  if (missing.length > 0) {
    console.error(
      `[env-check] ❌ STARTUP: ${missing.length} required environment variable(s) are not set: ` +
      missing.join(", ") +
      ". Features depending on these vars WILL fail at runtime. " +
      "Set them in the Vercel dashboard under Settings → Environment Variables."
    );
  } else {
    console.log("[env-check] ✅ All required environment variables are present.");
  }

  // Extra guard: warn if test mode is accidentally enabled in production
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_TEST_MODE === "true"
  ) {
    console.error(
      "[env-check] 🚨 SECURITY: NEXT_PUBLIC_TEST_MODE=true is set in PRODUCTION. " +
      "This env var bypasses authentication. Remove it from production immediately."
    );
  }
}
