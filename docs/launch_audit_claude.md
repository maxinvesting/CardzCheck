# CardzCheck Launch Audit (Claude) - post-hardening

**Date:** 2026-01-31
**Current branch:** feature/major-features-update
**Commit:** 4865e69 feat: major features update – collection, comps, grade estimate, smart search

---

## 1) Verdict

**Ready to launch?** CONDITIONAL

### Top 5 Remaining Blockers

1. **No Security Headers or CSP configured** - `next.config.js` has no `headers()` function; app ships without X-Frame-Options, X-Content-Type-Options, CSP, or HSTS.
2. **No terms/privacy pages exist** - No `/terms`, `/privacy`, or `/legal` routes found. Footer links missing. Required for launch.
3. **No Sentry or error monitoring configured** - No production error tracking. Console.log statements are unfiltered by NODE_ENV.
4. **`users` table RLS status unknown** - No migration in repo creates `users` table with RLS. Likely Supabase Auth creates it, but RLS policies must be verified in Supabase dashboard.
5. **Rate limiting only on eBay scraper** - No request-level rate limiting on AI endpoints (`/api/analyst`, `/api/identify-card`, `/api/grade-estimate`). Abuse possible.

### Top 5 Remaining Risks (non-blockers)

1. **Logging leaks potential sensitive data** - Console logs include user IDs, card details, eBay queries. No prod-gating or redaction.
2. **No server-side file validation on `/api/identify-card`** - Accepts any `imageUrl` string. No mime-type or size check on server for fetched URLs.
3. **Storage bucket `card-images` not in migrations** - Code falls back to base64 if bucket doesn't exist. Storage bucket policies not verifiable from repo.
4. **Test mode bypasses all auth** - `NEXT_PUBLIC_TEST_MODE=true` bypasses authentication. Ensure never enabled in production.
5. **No backup/recovery plan documented** - No evidence of documented backup strategy for Supabase data.

---

## 2) Checklist Status

### A) Core Flows

| Item | Status | Notes |
|------|--------|-------|
| Auth | **DONE** | OAuth flow via Supabase, middleware protects routes (`middleware.ts:4-20`) |
| Collection add/edit/delete + persistence | **DONE** | Full CRUD in `app/api/collection/route.ts`, RLS on `collection_items` table |
| Watchlist add/delete + persistence | **DONE** | Full CRUD in `app/api/watchlist/route.ts`, RLS on `watchlist` table |
| Grading estimator only in grading flow | **DONE** | `/api/grade-estimate` called from `app/grade-estimator/page.tsx` and `app/comps/page.tsx` (after card upload only) |
| CMV uses comps (not cost basis) | **DONE** | `lib/values.ts:74-79` - `getCollectionValuePerCard` returns CMV only, no cost-basis fallback |
| Smart search relevance + manual fallback CTA | **DONE** | `lib/smartSearch/index.ts` with scoring; fallback UI shown when results empty |

### B) Security

| Item | Status | Notes |
|------|--------|-------|
| Secrets: service_role not in client | **DONE** | `SUPABASE_SERVICE_ROLE_KEY` only in `lib/supabase/server.ts:61` (server-only) |
| Secrets: no committed keys | **DONE** | `.env` in `.gitignore`, not tracked. `.env.example` has placeholders only. |
| Secrets: safe env usage | **DONE** | All secrets accessed via `process.env` server-side |
| Supabase RLS enabled + user isolation | **PARTIAL** | RLS enabled for: `collection_items`, `watchlist`, `subscriptions`, `usage`, `analyst_threads`, `analyst_messages`. **`users` table not in migrations - verify in Supabase dashboard.** |
| Storage bucket policies | **UNKNOWN** | `card-images` bucket referenced in code. No storage policy migrations in repo. Must verify in Supabase dashboard. |
| Rate limiting on AI/comps endpoints | **MISSING** | Only eBay scraper has rate limiting (`lib/ebay/rate-limiter.ts`). No rate limiting on `/api/analyst`, `/api/identify-card`, `/api/grade-estimate`. |
| Upload validation: server-side mime + size | **PARTIAL** | Client-side validation in `CardUploader.tsx:19-27` (10MB, image/* check). Server accepts any `imageUrl` string without validation. |
| Security headers + CSP | **MISSING** | `next.config.js` has no `headers()` function. No CSP, X-Frame-Options, HSTS configured. |

### C) Reliability

| Item | Status | Notes |
|------|--------|-------|
| Error monitoring (Sentry) | **MISSING** | No Sentry or similar configured. No packages in dependencies. |
| Logging does not leak sensitive data | **MISSING** | Console.log statements throughout codebase, not gated by NODE_ENV. User IDs, queries logged. |
| Backups / recovery plan | **UNKNOWN** | No documentation found. Supabase may have automatic backups on paid plans. |

### D) Legal / Trust

| Item | Status | Notes |
|------|--------|-------|
| Terms / Privacy / disclaimers present | **MISSING** | No `/terms`, `/privacy` pages. Footer in `app/page.tsx` has no legal links. |
| Pricing/claims consistent with billing | **DONE** | Landing page shows "$20 once" for Pro, matches `STRIPE_ACTIVATION_PRICE_ID` pattern in `.env.example`. Free tier = 3 searches, 5 collection cards, matches `LIMITS` in `types/index.ts`. |

---

## 3) Evidence

### Items Marked DONE

**Auth**
- Files: `middleware.ts`, `lib/supabase/middleware.ts`, `app/api/auth/callback/route.ts`
- What I saw: Middleware checks auth for all routes except static files. OAuth callback exchanges code for session.

**Collection persistence**
- Files: `app/api/collection/route.ts`, `supabase/migrations/20250127_collection_items.sql`
- What I saw: Full CRUD (GET/POST/DELETE/PATCH), RLS enabled with SELECT/INSERT/UPDATE/DELETE policies for `auth.uid() = user_id`.

**Watchlist persistence**
- Files: `app/api/watchlist/route.ts`, `supabase/migrations/20250126_watchlist_subscriptions.sql`
- What I saw: Full CRUD operations, RLS enabled with 4 policies enforcing user isolation.

**Grading estimator only in grading flow**
- Files: `app/grade-estimator/page.tsx:30-34`, `app/comps/page.tsx:571-578`
- What I saw: Grade estimate button only appears after card upload/identification. Not shown in collection flow.

**CMV uses comps**
- Files: `lib/values.ts:74-79`
- What I saw: `getCollectionValuePerCard()` returns `est_cmv` only, returns 0 if not available. No cost-basis fallback for collection value.

**service_role not in client**
- Files: `lib/supabase/server.ts:56-79`, `lib/supabase/client.ts`
- What I saw: Client uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Service role only in `createServiceClient()` which is server-only.

**No committed secrets**
- Files: `.gitignore:27-28`, `.env.example`
- What I saw: `.env` and `.env*.local` in gitignore. `git ls-files` confirms no .env tracked.

### Items Marked MISSING/UNKNOWN

**Security headers + CSP**
- What's missing: `next.config.js` only has `images.remotePatterns`. No `headers()` async function.
- Best first fix: Add headers to `next.config.js`:
```js
async headers() {
  return [{
    source: '/:path*',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
    ]
  }]
}
```

**Terms / Privacy pages**
- What's missing: No routes at `/terms`, `/privacy`. Footer has no legal links.
- Best first fix: Create `app/terms/page.tsx` and `app/privacy/page.tsx` with basic policies. Add links to footer.

**Rate limiting on AI endpoints**
- What's missing: No middleware or in-route rate limiting for `/api/analyst`, `/api/identify-card`, `/api/grade-estimate`.
- Best first fix: Add user-based rate limiting using Supabase `usage` table, similar to existing search limits.

**Error monitoring**
- What's missing: No Sentry, LogRocket, or similar configured.
- Best first fix: `npm install @sentry/nextjs` and configure `sentry.client.config.ts` / `sentry.server.config.ts`.

**Logging redaction**
- What's missing: Console.log statements throughout without NODE_ENV gating.
- Best first fix: Create a logger utility that only logs in development, or redacts sensitive fields.

**`users` table RLS**
- What's unclear: Table likely created by Supabase Auth trigger. No migration in repo.
- Best first fix: Verify in Supabase dashboard that `users` table has RLS enabled with `auth.uid() = id` policies.

**Storage bucket policies**
- What's unclear: `card-images` bucket referenced but no policy migrations.
- Best first fix: In Supabase dashboard, ensure bucket has policies restricting upload/read to authenticated users with path scoping.

---

## 4) Manual Test Script (Tonight)

Estimated time: 30 minutes

### Setup
- Create 2 test accounts: `testuser1@test.com` and `testuser2@test.com`
- Have browser dev tools open (Network + Console tabs)

### Authentication & Session Persistence
1. [ ] Sign up with `testuser1@test.com`
2. [ ] Verify redirect to `/comps?welcome=true`
3. [ ] Add a card to collection
4. [ ] Refresh page - verify card still there
5. [ ] Close browser, reopen - verify still logged in
6. [ ] Log out, log back in - verify collection persists

### Collection CRUD
1. [ ] Add 3 cards via search + "Add to Collection"
2. [ ] Verify all 3 appear in `/collection`
3. [ ] Edit one card (change notes or purchase price)
4. [ ] Delete one card
5. [ ] Verify changes persist after refresh

### Watchlist (Pro feature)
1. [ ] Navigate to `/watchlist` as free user - verify upgrade prompt
2. [ ] Upgrade to Pro (use test Stripe card `4242...`)
3. [ ] Add a card to watchlist
4. [ ] Refresh - verify card persists
5. [ ] Delete from watchlist - verify removal

### Cross-User Access Attempt
1. [ ] In browser 1, logged in as `testuser1`, note a collection item ID from Network tab
2. [ ] In browser 2, logged in as `testuser2`
3. [ ] Try to access `testuser1`'s collection via API:
   ```
   fetch('/api/collection?id=<testuser1-item-id>', {method: 'DELETE'})
   ```
4. [ ] Verify deletion fails (RLS blocks it)
5. [ ] Verify `testuser1`'s card still exists

### Grade Estimator Placement
1. [ ] Go to `/collection` - verify NO grade estimate button
2. [ ] Go to `/comps`, upload a card photo
3. [ ] After identification, verify "Estimate Grade" button appears
4. [ ] Go to `/grade-estimator` - verify full grade estimation flow works

### Rate Limiting (eBay)
1. [ ] Perform 5 searches rapidly
2. [ ] Observe console for rate limiting messages
3. [ ] Verify graceful degradation (fallback URL shown if blocked)

### Upload Validation (Client-side)
1. [ ] Try to upload a 15MB image - verify rejection message
2. [ ] Try to upload a `.txt` file - verify rejection message
3. [ ] Upload a valid 2MB JPEG - verify success

### Headers/CSP Check
1. [ ] Use browser dev tools Network tab
2. [ ] Check response headers for any page
3. [ ] Document which security headers are present/missing:
   - [ ] X-Frame-Options
   - [ ] X-Content-Type-Options
   - [ ] Content-Security-Policy
   - [ ] Strict-Transport-Security

### Legal Pages Check
1. [ ] Navigate to `/terms` - note if 404
2. [ ] Navigate to `/privacy` - note if 404
3. [ ] Check footer for legal links

---

## 5) Quick Commands

### Lint/Typecheck/Build
```bash
# Install dependencies
npm install

# Type check
npm run lint

# Build (will catch type errors)
npm run build
```

### Run Tests (if any)
```bash
npm test
```

### Verify .env not committed
```bash
git ls-files | grep -E "^\.env"
# Should return nothing
```

### Check for hardcoded secrets (quick scan)
```bash
grep -r "sk-ant-api\|sk_live\|sk_test" --include="*.ts" --include="*.tsx" .
# Should return nothing or only .env.example with placeholders
```

### Local rate limit test (eBay scraper)
```bash
# Make 5 rapid requests - observe rate limiting
for i in {1..5}; do
  curl -s "http://localhost:3000/api/search?player=jordan&format=v2" | head -c 100
  echo ""
done
```

### Check security headers (after deployment)
```bash
curl -I https://your-production-url.com | grep -E "X-Frame|X-Content-Type|Content-Security|Strict-Transport"
```

---

## Summary

The codebase has solid foundations for core functionality with RLS properly implemented on most user-facing tables. However, **launch should be conditional** on addressing:

1. Adding security headers + basic CSP in `next.config.js`
2. Creating Terms and Privacy pages with footer links
3. Adding rate limiting to AI endpoints (or accept the cost risk)
4. Verifying `users` table RLS in Supabase dashboard
5. Optionally configuring Sentry for production error monitoring

The cross-user isolation via RLS on `collection_items`, `watchlist`, `analyst_threads`, and `analyst_messages` is properly configured, which is the most critical security control.
