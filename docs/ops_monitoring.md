# Error Monitoring Setup

CardzCheck uses [Sentry](https://sentry.io) for production error monitoring.

## Environment Variables

Set these in your hosting platform (Vercel, etc.):

| Variable | Required | Description |
|----------|----------|-------------|
| `SENTRY_DSN` | Yes | Server-side Sentry DSN (from Sentry project settings) |
| `NEXT_PUBLIC_SENTRY_DSN` | Yes | Client-side Sentry DSN (same value as SENTRY_DSN) |
| `SENTRY_ORG` | For source maps | Your Sentry organization slug |
| `SENTRY_PROJECT` | For source maps | Your Sentry project slug |
| `SENTRY_AUTH_TOKEN` | For source maps | Auth token for uploading source maps |

## Getting Your Sentry DSN

1. Go to [sentry.io](https://sentry.io) and create an account (free tier available)
2. Create a new project, select "Next.js" as the platform
3. Copy the DSN from the project settings (Settings → Client Keys)
4. Add both `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` with the same value

## What Gets Captured

- **Client-side errors**: Unhandled JavaScript exceptions, React errors
- **Server-side errors**: API route errors, server component errors
- **Edge runtime errors**: Middleware errors

## Privacy & Security

The Sentry configuration filters out sensitive data:
- Request bodies are not logged
- Cookies and authorization headers are stripped
- Query parameters are removed from breadcrumbs

## Testing the Integration

### Check Configuration Status

```bash
curl http://localhost:3000/api/sentry-test
```

Response shows if Sentry is configured.

### Trigger a Test Error (Development Only)

```bash
curl -X POST http://localhost:3000/api/sentry-test
```

This sends a test error to Sentry. Check your Sentry dashboard to verify it appears.

### Enable Test Endpoint in Production

If you need to test in production, temporarily set:
```
ALLOW_SENTRY_TEST=true
```

**Remove this after testing!**

## Sentry Dashboard

Once configured, errors appear in your Sentry dashboard with:
- Stack traces
- Browser/device info
- Request path and method
- Route type (App Router, API route, etc.)

## Tunnel Route

Browser requests to Sentry are tunneled through `/monitoring` to avoid ad-blockers. This is configured automatically in `next.config.js`.

## Disabling in Development

Sentry is automatically disabled in development (`NODE_ENV !== 'production'`). Errors will still be logged to the console.
