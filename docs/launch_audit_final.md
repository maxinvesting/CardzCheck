# CardzCheck Launch Audit – FINAL

**Date:** 2026-01-31
**Branch:** feature/major-features-update
**Commit:** 62b40124f7c32cfd1cb73499ec8f869fd91d4e09 (Add Sentry monitoring)

---

## 1) Final Verdict

**Ready to launch?** **YES**

All previously identified blockers have been resolved:

1. ~~**CRITICAL – Pricing language mismatch**~~: **FIXED** - Landing page now correctly shows "$5/month + $20 one-time activation" matching the actual billing model in `lib/stripe.ts`.

2. ~~**MINOR – No backup/recovery documentation**~~: **FIXED** - Added `docs/ops_backup.md` with comprehensive backup/recovery procedures for Supabase database and storage.

---

## 2) Blocker Re-check (Resolved / Missing / Unknown)

### A) Security

| Item | Status | Notes |
|------|--------|-------|
| Security headers present (next.config.js headers()) | **RESOLVED** | X-Content-Type-Options, Referrer-Policy, X-Frame-Options, Permissions-Policy, HSTS (prod only) all present |
| CSP present and not overly restrictive | **RESOLVED** | CSP in report-only mode (appropriate for launch), allows self + https for scripts/styles/fonts/images |
| Rate limiting on /api/analyst | **RESOLVED** | 20 req/min in middleware.ts:48 |
| Rate limiting on /api/identify-card | **RESOLVED** | 10 req/min in middleware.ts:46 |
| Rate limiting on /api/grade-estimate | **RESOLVED** | 10 req/min in middleware.ts:47 |
| Rate limiting on /api/search | **RESOLVED** | 60 req/min in middleware.ts:45 |
| Server-side upload validation (mime + size) | **RESOLVED** | Both identify-card and grade-estimate validate mime types (jpeg, png, webp, gif) and enforce 10MB max |
| Secrets safety (.env ignored) | **RESOLVED** | `.env` in .gitignore:28. Debug route `/api/auth/debug` blocked in production (line 6) |

### B) Data Protection

| Item | Status | Notes |
|------|--------|-------|
| Supabase RLS enabled for collection_items | **RESOLVED** | RLS enabled with auth.uid() policies for SELECT/INSERT/UPDATE/DELETE |
| Supabase RLS enabled for watchlist | **RESOLVED** | RLS enabled with auth.uid() policies for all operations |
| Supabase RLS enabled for analyst_threads | **RESOLVED** | RLS enabled with auth.uid() policies for all operations |
| Supabase RLS enabled for analyst_messages | **RESOLVED** | RLS enabled with thread ownership check |
| Supabase RLS enabled for subscriptions | **RESOLVED** | RLS enabled, SELECT only for auth.uid() (writes are server-only) |
| Supabase RLS enabled for usage | **RESOLVED** | RLS enabled, SELECT only for auth.uid() (writes are server-only) |
| Users table RLS | **RESOLVED** | RLS enabled with owner read/update only. No DELETE policy (blocked by default). Server manages sensitive fields |
| Storage RLS for card-images | **RESOLVED** | RLS enabled with user-prefixed paths (auth.uid()/%%) for all operations |

### C) Reliability

| Item | Status | Notes |
|------|--------|-------|
| Error monitoring configured (Sentry) | **RESOLVED** | Sentry integrated via `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`. Production-only, filters sensitive data |
| Logging gated in production | **RESOLVED** | `lib/logging.ts` disables debug logging when `NODE_ENV=production`. IDs are redacted to last 6 chars |
| Backup/recovery strategy documented | **RESOLVED** | `docs/ops_backup.md` documents Supabase automatic backups, PITR, manual exports, and disaster recovery checklist |

### D) Legal & Trust

| Item | Status | Notes |
|------|--------|-------|
| Terms page exists and renders | **RESOLVED** | `app/terms/page.tsx` - comprehensive ToS with disclaimers for pricing estimates and grade estimates |
| Privacy page exists and renders | **RESOLVED** | `app/privacy/page.tsx` - comprehensive privacy policy covering data collection, third-party services, user rights |
| Pages linked in footer/navigation | **RESOLVED** | Links in Sidebar.tsx:355-371 and landing page footer app/page.tsx:269-274 |
| Landing page pricing consistent with billing | **RESOLVED** | Landing page now shows "$5/month + $20 one-time activation" matching actual Stripe billing model |

---

## 3) Evidence

### RESOLVED Items

#### Security Headers
- **File(s):** `next.config.js:32-71`
- **Verified:** Headers function returns array of security headers applied to all routes (`:path*`). HSTS added conditionally for production.

#### Rate Limiting
- **File(s):** `middleware.ts:44-49`, `lib/api-rate-limiter.ts:40-45`
- **Verified:** Rate limits defined for all 4 AI/search endpoints. Middleware checks limits on each request and returns 429 with Retry-After header when exceeded.

#### Upload Validation
- **File(s):** `app/api/identify-card/route.ts:5-6,24-90`, `app/api/grade-estimate/route.ts:4-5,17-90`
- **Verified:** Both endpoints define ALLOWED_MIME_TYPES (jpeg, png, webp, gif) and MAX_IMAGE_SIZE_BYTES (10MB). Validation applied to both base64 and URL inputs.

#### Secrets Safety
- **File(s):** `.gitignore:28`, `app/api/auth/debug/route.ts:5-11`
- **Verified:** `.env` is git-ignored. Debug endpoint returns 404 in production (`NODE_ENV !== "development"` check at line 6).

#### Supabase RLS
- **File(s):**
  - `supabase/migrations/20250127_collection_items.sql:22-42`
  - `supabase/migrations/20250126_watchlist_subscriptions.sql:45-65,96-102,122-127`
  - `supabase/migrations/20240126_analyst_threads.sql:44-97`
  - `supabase/migrations/20250220_launch_hardening_rls_storage.sql:1-112`
- **Verified:** All user-owned tables have RLS enabled with `auth.uid() = user_id` policies. Storage bucket has user-prefixed path policies.

#### Sentry Monitoring
- **File(s):** `sentry.client.config.ts`, `sentry.server.config.ts`, `next.config.js:74-96`
- **Verified:** Sentry initialized with production-only flag, trace sampling at 10%, sensitive data filtering (request body, cookies, auth headers removed), tunnel route for ad-blocker bypass.

#### Logging
- **File(s):** `lib/logging.ts:1-26`
- **Verified:** `isDebugLoggingEnabled()` returns false when `NODE_ENV === "production"`. `logDebug` is a no-op in production. `redactId()` helper for ID masking.

#### Terms/Privacy Pages
- **File(s):** `app/terms/page.tsx`, `app/privacy/page.tsx`
- **Verified:** Both pages exist with comprehensive legal content. Terms includes grade estimation and pricing disclaimers. Privacy covers data collection, third parties (Supabase, Stripe, OpenAI), user rights.

#### Footer Links
- **File(s):** `components/Sidebar.tsx:354-371`, `app/page.tsx:268-275`
- **Verified:** Both sidebar (logged-in users) and landing page footer (visitors) include Terms and Privacy links.

### PREVIOUSLY MISSING Items (Now Fixed)

#### Pricing Mismatch - **FIXED**
- **File(s):** `app/page.tsx:46-52, 170-251`
- **What was fixed:** Updated hero to show "$5/month" instead of "$20 once". Updated pricing section to show "$5/month + $20 one-time activation" with "Cancel anytime" messaging.

#### Backup Documentation - **FIXED**
- **File(s):** `docs/ops_backup.md`
- **What was added:** Comprehensive backup/recovery documentation covering Supabase automatic backups, PITR, manual exports, storage backups, user data exports (GDPR/CCPA), and disaster recovery checklist.

---

## 4) Manual Production Test Script

Estimated time: ~20-30 minutes

### Pre-flight
- [ ] Confirm you're testing on staging/preview URL (not localhost)
- [ ] Have two separate browser sessions ready (or use incognito for second user)

### Auth + Persistence
1. [ ] Sign up with a new email address
2. [ ] Verify email if required, complete login
3. [ ] Navigate to Collection → Add a card manually
4. [ ] Close browser, reopen, verify card persists

### Cross-User Access Attempt
5. [ ] Note the collection item ID from first user (via Network tab or DB)
6. [ ] In second browser, sign up as a different user
7. [ ] Attempt to access first user's collection via direct API:
   ```bash
   curl -H "Authorization: Bearer <user2_token>" \
     https://your-app.vercel.app/api/collection/<user1_item_id>
   ```
8. [ ] Verify 401/403 response (not 200 with data)

### Rate Limit Trigger Test
9. [ ] Run 15 rapid requests to /api/identify-card (limit is 10/min):
   ```bash
   for i in {1..15}; do
     curl -X POST https://your-app.vercel.app/api/identify-card \
       -H "Content-Type: application/json" \
       -d '{"imageUrl":"data:image/png;base64,iVBORw0KGgo="}' &
   done
   ```
10. [ ] Verify later requests return 429 with Retry-After header

### Upload Rejection Test
11. [ ] Test oversized file (>10MB): Attempt to upload large image via identify-card
12. [ ] Test invalid mime: Send `data:application/pdf;base64,...` to identify-card
13. [ ] Verify both return 400 with appropriate error message

### Verify Headers (Browser DevTools)
14. [ ] Open DevTools → Network tab
15. [ ] Navigate to any page, check response headers for:
    - [ ] `X-Content-Type-Options: nosniff`
    - [ ] `X-Frame-Options: DENY`
    - [ ] `Referrer-Policy: strict-origin-when-cross-origin`
    - [ ] `Strict-Transport-Security` (production only)
    - [ ] `Content-Security-Policy-Report-Only` (should be present)

### Grade Estimator Not in Collection Add Flow
16. [ ] Go to Collection page
17. [ ] Click "Add Card" button
18. [ ] Verify no grade estimation option appears in the modal
19. [ ] Grade Estimator is a separate standalone feature (/grade-estimator)

### Pricing Page Review
20. [ ] Visit landing page (logged out)
21. [ ] Verify pricing section shows "$5/month + $20 one-time activation"
22. [ ] Click "Upgrade to Pro" → verify Stripe checkout shows matching amounts

---

## 5) Final Recommendation

### Can I safely open this to:

| Audience | Recommendation | Reasoning |
|----------|----------------|-----------|
| **Private beta users** | **YES** | All security controls in place, pricing is accurate, legal pages exist. |
| **Public users** | **YES** | All blockers resolved. Security, data protection, and legal compliance verified. |
| **Paid users** | **YES** | Pricing language now matches billing model. Rate limiting protects against abuse. RLS prevents data leakage. |

### Remaining Nice-to-Have (Non-Blocking):

1. **LATER:** Enforce CSP after reviewing report-only telemetry (currently in report-only mode which is appropriate for launch)

This codebase is ready for public launch. Security posture is solid, RLS is comprehensive, rate limiting is active, pricing is transparent, and legal pages are in place.
