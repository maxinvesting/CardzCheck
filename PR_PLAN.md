# PR Plan: Scoped Commits (P0 → P1 → P2)

## Branch
- Create: `release/instant-add-comps-tests` (or similar)

---

## Commit 1 — Priority 0: Instant Add-to-Collection UX + stock image + CMV "Calculating…" + identity persistence

**Scope:** Instant add flow, stock image badge, CMV "Calculating…" state, structured `parallel_type` / `card_number` persistence and related API.

| File | Action |
|------|--------|
| `app/api/collection/route.ts` | Add (parallel_type, card_number in insert) |
| `app/api/identify-card/route.ts` | Add (card-identity + validation refactor) |
| `app/collection/page.tsx` | Add (collection UX) |
| `components/CollectionGrid.tsx` | Add (stock badge, Calculating, getEstCmv, primary_image) |
| `components/AddCardModalNew.tsx` | Add |
| `components/ConfirmAddCardModal.tsx` | Add |
| `components/CardUploader.tsx` | Add |
| `components/FeaturedSearchCard.tsx` | Add (parallel_variant) |
| `lib/cmv.ts` | Add (est_cmv, retry unavailable, parallelFromNotes, dual-signal fallback) |
| `lib/values.ts` | Add (getEstCmv, totalDisplayValue null, coerce helpers) |
| `lib/formatters.ts` | Add (new: formatCurrency, formatPct, computeGainLoss) |
| `types/index.ts` | Add P0 hunks only (CollectionItem parallel_type, card_number, est_cmv, card_images, primary_image, CardImage, etc.; CardIdentity) |
| `supabase/migrations/20260207_collection_parallel_cardnumber.sql` | Add |
| `lib/card-identity/` | Add (all — used by identify-card) |
| `lib/identify-card-validation.ts` | Add (new) |
| `components/AddCardModal.tsx` | Delete (replaced by AddCardModalNew) |

---

## Commit 2 — Priority 1: Comps matching fixes

**Scope:** PASS cascade, query-time negative keywords, card number extraction, scoring penalty.

| File | Action |
|------|--------|
| `lib/smartSearch/parseQuery.ts` | Add |
| `lib/smartSearch/filterCandidates.ts` | Add |
| `lib/smartSearch/scoreCandidates.ts` | Add |
| `lib/smartSearch/normalize.ts` | Add |
| `lib/smartSearch/types.ts` | Add |
| `lib/smartSearch/index.ts` | Add |
| `lib/smart-search-parser.ts` | Add |
| `app/api/search/route.ts` | Add |
| `app/api/collection/search/route.ts` | Add |
| `app/api/watchlist/search/route.ts` | Add |
| `app/comps/page.tsx` | Add |
| `app/watchlist/page.tsx` | Add |
| `lib/ebay/dual-signal.ts` | Add |
| `lib/ebay/browse-api.ts` | Add |
| `lib/ebay/utils.ts` | Add |
| `lib/ebay/set-taxonomy.ts` | Add (new) |
| `types/index.ts` | Add remaining hunks (SearchResult _passUsed, _totalPasses) |
| `components/CollectionSmartSearch.tsx` | Delete |
| `components/SearchBar.tsx` | Delete |
| `components/WatchlistSmartSearch.tsx` | Delete |

---

## Commit 3 — Priority 2: Tests

**Scope:** Tests for P0/P1 behaviors.

| File | Action |
|------|--------|
| `lib/__tests__/values.spec.ts` | Add |
| `lib/smartSearch/__tests__/filterAndScore.spec.ts` | Add |
| `lib/smartSearch/__tests__/normalize.spec.ts` | Add |
| `lib/smartSearch/__tests__/parseQuery.spec.ts` | Add |
| `lib/__tests__/comps-matching-fixes.spec.ts` | Add (new) |
| `lib/__tests__/comps-to-collection-pipeline.spec.ts` | Add (new) |
| `lib/smartSearch/__tests__/smart-search-harness.test.ts` | Add (new) |
| `lib/__tests__/card-search.spec.ts` | Add (new) |
| `lib/__tests__/cmv-wiring.spec.ts` | Add (new) |

---

## Excluded (noise / out of scope)

- `app/(new)/privacy/page.tsx`, `app/(new)/terms/page.tsx` (deleted)
- `app/analyst-setup/`, `app/api/analyst/*`
- `app/api/grade-estimate/route.ts`, `grade-estimate/start`, `status`, `grade-estimator/history`
- `app/cards/`, `app/api/cards/`, `app/api/dev/`, `app/api/recent-searches/`, `app/api/typeahead/`
- `app/dashboard/page.tsx`, `app/grade-estimator/page.tsx`
- `components/Header.tsx`, `Sidebar.tsx`, dashboard/* (ActivityFeed, CollectionMetricsCard, etc.)
- `components/CardDetailsForm.tsx`, `CardImageGallery.tsx`, `CardPicker*.tsx`, `RecentSearchesPanel.tsx`, `Compact*`, `grading/`, `ui/`
- `copy/`, `docs/*`, `CARD_PROFILE_IMPLEMENTATION.md`, `COMPS_SEARCH_IMPROVEMENTS.md`
- `lib/access.ts`, `lib/ai/*`, `middleware.ts`
- `package.json`, `package-lock.json` (include only if build fails without)
- Other migrations (20250131, 20250201, 20260203*, 20260205)
- `components/GradeEstimateDisplay.tsx` (deleted)
