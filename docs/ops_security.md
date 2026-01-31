# Ops Security Notes

## Launch hardening (headers + logging)

- Security headers are set in `next.config.js` for all routes, including:
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Frame-Options: DENY`
  - `Permissions-Policy` with sensitive APIs disabled
  - `Strict-Transport-Security` in production only
- Content Security Policy is currently shipped in **report-only** mode to
  collect telemetry without breaking the app or Supabase auth. **TODO:** review
  CSP reports and enforce once the policy is confirmed safe.

### Logging policy

- Debug logging is disabled in production (`NODE_ENV=production`).
- Logs must never include raw user identifiers or sensitive card details.
  Use redaction (e.g., last 6 characters) for IDs and avoid full item payloads.
