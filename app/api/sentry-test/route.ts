import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

/**
 * Test endpoint for verifying Sentry error tracking.
 * Only available in development or when explicitly enabled.
 *
 * GET /api/sentry-test - Returns status
 * POST /api/sentry-test - Throws a test error to verify Sentry captures it
 */

export async function GET() {
  const isEnabled = process.env.NODE_ENV === "production";
  const hasDsn = !!process.env.SENTRY_DSN;

  return NextResponse.json({
    status: "ok",
    sentry: {
      enabled: isEnabled,
      configured: hasDsn,
      message: hasDsn
        ? "Sentry is configured. POST to this endpoint to trigger a test error."
        : "SENTRY_DSN not set. Configure it in your environment variables.",
    },
  });
}

export async function POST() {
  // Only allow test errors in development or with explicit flag
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_SENTRY_TEST !== "true"
  ) {
    return NextResponse.json(
      { error: "Test endpoint disabled in production" },
      { status: 403 }
    );
  }

  const testError = new Error(
    "Sentry test error - this is intentional for verification"
  );

  // Capture the error with Sentry
  Sentry.captureException(testError, {
    tags: {
      test: "true",
      source: "sentry-test-endpoint",
    },
  });

  // Flush to ensure the error is sent immediately
  await Sentry.flush(2000);

  return NextResponse.json({
    status: "error_sent",
    message: "Test error captured and sent to Sentry. Check your Sentry dashboard.",
  });
}
