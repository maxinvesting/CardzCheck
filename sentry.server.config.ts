import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Only enable in production
  enabled: process.env.NODE_ENV === "production",

  // Performance monitoring sample rate
  tracesSampleRate: 0.1,

  // Filter out sensitive data from error reports
  beforeSend(event) {
    // Remove request body data to avoid logging sensitive payloads
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
      // Remove authorization headers
      if (event.request.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
    }

    // Remove any sensitive context
    if (event.contexts?.response) {
      delete event.contexts.response;
    }

    return event;
  },

  // Ignore common non-actionable errors
  ignoreErrors: [
    "NEXT_NOT_FOUND",
    "NEXT_REDIRECT",
  ],
});
