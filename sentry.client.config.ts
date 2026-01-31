import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only enable in production
  enabled: process.env.NODE_ENV === "production",

  // Performance monitoring sample rate
  tracesSampleRate: 0.1,

  // Session replay (disabled by default - can be enabled if needed)
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // Filter out sensitive data from error reports
  beforeSend(event) {
    // Remove any potential PII from breadcrumbs
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
        // Redact potentially sensitive URLs
        if (breadcrumb.data?.url) {
          const url = new URL(breadcrumb.data.url, "http://localhost");
          // Remove query params that might contain sensitive data
          url.search = "";
          breadcrumb.data.url = url.pathname;
        }
        return breadcrumb;
      });
    }

    // Remove request body data to avoid logging sensitive payloads
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
    }

    return event;
  },

  // Ignore common non-actionable errors
  ignoreErrors: [
    // Browser extensions
    "top.GLOBALS",
    // Network errors
    "Network request failed",
    "Failed to fetch",
    "Load failed",
    // User navigation
    "AbortError",
    "ResizeObserver loop",
  ],
});
