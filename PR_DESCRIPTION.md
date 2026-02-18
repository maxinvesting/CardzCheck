# PR: Instant Add-to-Collection UX, Comps Matching Fixes, and Tests

## Summary

This PR bundles three scoped areas of work into a single branch with clear commits:

1. **Priority 0** — Instant add-to-collection UX, stock image rendering, CMV “Calculating…” state, and structured identity persistence (`parallel_type`, `card_number`) with related API and migration.
2. **Priority 1** — Comps matching improvements: PASS cascade (strict → broad → minimal), query-time negative keywords, card number extraction, and scoring/penalty updates.
3. **Priority 2** — New and updated tests for the above behaviors, plus a small test fix for card-identity year-extraction.

---

## Priority 0 — Instant Add + Stock Image + CMV Calculating + Identity Persistence

- **Collection API** (`app/api/collection/route.ts`): Persist `parallel_type` and `card_number` on insert; return structured fields.
- **CollectionGrid**: Primary image with fallback to `image_url`; “Stock” badge when using `image_url` without `primary_image`; CMV “Calculating…” when `getEstCmv(item)` is null; click-through to card detail; formatCurrency/formatPct/computeGainLoss via `lib/formatters`.
- **CMV** (`lib/cmv.ts`): Populate `est_cmv` in result; treat `unavailable` as stale so we retry; derive parallel/insert from notes in `fetchCompsForCard`; dual-signal fallback when sold comps are unavailable.
- **Values** (`lib/values.ts`): `getEstCmv` prefers `estimated_cmv` then `est_cmv` with safe coercion; `totalDisplayValue` nullable; `getCostBasis` uses shared coercion.
- **Identify-card** (`app/api/identify-card/route.ts`): Refactored to use `lib/card-identity` and `lib/identify-card-validation`; returns structured identity (e.g. `parallel_type`, `card_number`).
- **Add flow**: `ConfirmAddCardModal` and `AddCardModalNew` send and display `parallel_type` / `card_number`; `AddCardModal` removed in favor of `AddCardModalNew`.
- **Types**: `CollectionItem` gains `parallel_type`, `card_number`, `est_cmv`, `card_images`, `primary_image`; `CardImage` type added.
- **Migration** (see below): Adds `parallel_type` and `card_number` columns to `collection_items`.

---

## Priority 1 — Comps Matching Fixes

- **smartSearch**: PASS cascade (strict → broad → minimal); query-time negative keywords; card number extraction and locking; scoring weights and penalties; `filterCandidates` / `scoreCandidates` / `normalize` / `parseQuery` / `types` / `index` updated.
- **eBay**: `dual-signal` exposes `passUsed` / `totalPasses`; `browse-api` multi-pass; `utils` (e.g. filterOutliers, extractCardNumbers, titleMatchesGrade); `set-taxonomy` for set classification; `lib/ebay.ts` re-exports `searchEbayDualSignal` for consumers.
- **APIs**: `app/api/search/route.ts`, `app/api/collection/search/route.ts`, `app/api/watchlist/search/route.ts` accept `card_number` / `parallel_type` and use new search pipeline.
- **Pages**: Comps and Watchlist use new search and add-to-collection flow.
- **Removed**: `CollectionSmartSearch`, `SearchBar`, `WatchlistSmartSearch` (replaced by inline flows).

---

## Priority 2 — Tests

- **values.spec**: `getEstCmv`, `totalDisplayValue` null, coercion helpers.
- **smartSearch**: `filterAndScore`, `normalize`, `parseQuery`, and `smart-search-harness` tests.
- **New**: `comps-matching-fixes.spec`, `comps-to-collection-pipeline.spec`, `card-search.spec`, `cmv-wiring.spec`.
- **Fix**: `lib/card-identity/__tests__/year-extraction.spec.ts` — ambiguous year expectation allows `null` or `undefined`.

---

## Migration

| File | Purpose |
|------|--------|
| `supabase/migrations/20260207_collection_parallel_cardnumber.sql` | Adds `parallel_type` (text) and `card_number` (text) to `collection_items`. Supports CMV and identity without parsing free-text notes. |

**Apply (e.g. Supabase CLI):**

```bash
supabase db push
# or apply the file manually in the Supabase dashboard / SQL editor
```

---

## Verification Checklist

- [ ] **Comps search** → Run a comps query (e.g. player + set + parallel); results load with correct pass metadata where applicable.
- [ ] **Add to collection** → From Comps, add a card to collection; card appears in collection **immediately** (instant add).
- [ ] **Collection grid** → New card shows **stock badge** when only `image_url` is set (no `primary_image`).
- [ ] **CMV “Calculating…”** → New card shows “Calculating…” for CMV until a value is available.
- [ ] **Eventual CMV** → After background CMV run (or refresh), card shows a numeric CMV when comps/dual-signal succeed.
- [ ] **Identity persistence** → Add flow and collection API persist and return `parallel_type` and `card_number`; migration applied and columns present.

---

## Not Changed

- No CMV math/formula rewrite (only dual-signal fallback and retry when unavailable).
- No dashboard layout/compact components in this PR.
- No grade-estimator history UI or new grade-estimate API routes.
- No analyst setup, cards profile, or other out-of-scope features.

---

## Commands Run

```bash
# Branch
git checkout -b release/instant-add-comps-tests

# Commit 1 (P0)
git add app/api/collection/route.ts app/api/identify-card/route.ts app/collection/page.tsx \
  components/CollectionGrid.tsx components/AddCardModalNew.tsx components/ConfirmAddCardModal.tsx \
  components/CardUploader.tsx components/FeaturedSearchCard.tsx lib/cmv.ts lib/values.ts \
  lib/formatters.ts types/index.ts supabase/migrations/20260207_collection_parallel_cardnumber.sql \
  lib/card-identity/ lib/identify-card-validation.ts components/AddCardModal.tsx
git commit -m "feat(collection): instant add UX, stock image, CMV Calculating, identity persistence"

# Commit 2 (P1)
git add lib/smartSearch/*.ts lib/smart-search-parser.ts app/api/search/route.ts \
  app/api/collection/search/route.ts app/api/watchlist/search/route.ts \
  app/comps/page.tsx app/watchlist/page.tsx lib/ebay/dual-signal.ts lib/ebay/browse-api.ts \
  lib/ebay/utils.ts lib/ebay/set-taxonomy.ts \
  components/CollectionSmartSearch.tsx components/SearchBar.tsx components/WatchlistSmartSearch.tsx
git commit -m "feat(comps): matching fixes — PASS cascade, negative keywords, card number, scoring"

# Commit 3 (P2)
git add lib/__tests__/values.spec.ts lib/smartSearch/__tests__/*.spec.ts lib/smartSearch/__tests__/*.test.ts \
  lib/__tests__/comps-matching-fixes.spec.ts lib/__tests__/comps-to-collection-pipeline.spec.ts \
  lib/__tests__/card-search.spec.ts lib/__tests__/cmv-wiring.spec.ts lib/ebay.ts
git commit -m "test: add/update tests for collection UX, CMV, and comps matching"

# Test fix
git add lib/card-identity/__tests__/year-extraction.spec.ts
git commit -m "test: fix year-extraction spec to accept null for ambiguous year"
```

**Checks:**

```bash
npm run test -- --run   # 123 passed, 1 skipped (smart-search-harness optional)
npm run build           # Passes when only PR commits are in tree; uncommitted WIP (e.g. app/api/dev, lib/grading) may introduce type errors until fixed or stashed
```

`npm run lint` (next lint) has a known project-directory issue in this repo; not fixed in this PR.

---

## Post-merge checklist (deployment)

1. **Migration**  
   - Apply `supabase/migrations/20260207_collection_parallel_cardnumber.sql` (e.g. `supabase db push` or run in SQL editor).

2. **Smoke tests**  
   - Comps search → Add to collection → confirm instant render, stock badge when applicable, “Calculating…” then eventual CMV.  
   - Confirm `parallel_type` / `card_number` persist and display in add flow and collection.

3. **Optional**  
   - Monitor CMV background jobs and dual-signal fallback in logs after deploy.
